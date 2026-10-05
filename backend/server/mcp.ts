import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { StudioDb } from "./db.js";
import { READ_SCOPE, WRITE_SCOPE, type AuthRuntime } from "./auth.js";
import type { TenantWorkspace } from "./tenancy.js";
import { getDashboard, getProject, listProjects, listRecords, listSources } from "./core.js";
import {
  completeOnboarding,
  createSelectableQuestion,
  getInteraction,
  getOnboardingModel,
  prepareApprovalRequest,
  submitPreparedApproval,
  submitSelectableResponse,
  type SelectableQuestionInput
} from "./interactions.js";
import type { ProjectInputType } from "../shared/schemas/contracts.js";
import {
  addEvidencePassage, checkCitationHealth, exportEndNoteXml, extractManuscript, getEvidenceWorkspace,
  googleScholarHandoff, importEndNoteXml, ingestChatGptFile, inspectDocxCompatibility, listClaims,
  proposeClaimEvidenceLink, searchPubMed
} from "./research.js";

const MCP_PROTOCOL_VERSION = "2026-07-28";
const SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, "2025-06-18"] as const;
const APP_MIME_TYPE = "text/html;profile=mcp-app";

export const UI_RESOURCES = {
  onboarding: "ui://biomedical-research-studio/onboarding/v1.html",
  dashboard: "ui://biomedical-research-studio/dashboard/v1.html",
  review: "ui://biomedical-research-studio/review/v1.html",
  approval: "ui://biomedical-research-studio/approval/v1.html",
  forms: "ui://biomedical-research-studio/forms/v1.html",
  evidence: "ui://biomedical-research-studio/evidence/v1.html"
} as const;

type JsonObject = Record<string, unknown>;
type NextAction = {
  id: string;
  label: string;
  description: string;
  kind: "tool" | "message" | "client";
  tool?: string;
  arguments?: JsonObject;
  prompt?: string;
  client_action?: string;
  recommended?: boolean;
};
type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean; idempotentHint: boolean };
  securitySchemes?: Array<{ type: "oauth2"; scopes: string[] }>;
  _meta?: JsonObject;
};

const objectSchema = (properties: JsonObject, required: string[] = []): JsonObject => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false
});

const nextActionSchema = objectSchema({
  id: { type: "string" }, label: { type: "string" }, description: { type: "string" },
  kind: { type: "string", enum: ["tool", "message", "client"] }, tool: { type: "string" },
  arguments: { type: "object", additionalProperties: true }, prompt: { type: "string" },
  client_action: { type: "string" }, recommended: { type: "boolean" }
}, ["id", "label", "description", "kind"]);

const resultFields = {
  data: { oneOf: [{ type: "object", additionalProperties: true }, { type: "array", items: { type: "object", additionalProperties: true } }] },
  fallback_text: { type: "string" },
  next_actions: { type: "array", items: nextActionSchema }
};

const dataOutputSchema = objectSchema(resultFields, ["data", "fallback_text", "next_actions"]);

const renderOutputSchema = objectSchema({
  view: { type: "string" },
  ...resultFields
}, ["view", "data", "fallback_text", "next_actions"]);

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const writeOnly = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false };
const networkRead = { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: false };

function toolMeta(status: [string, string], resourceUri?: string, extension?: JsonObject): JsonObject {
  return {
    ...(resourceUri ? {
      ui: { resourceUri, visibility: ["model", "app"] },
      "openai/outputTemplate": resourceUri,
      "openai/widgetAccessible": true
    } : {}),
    ...(extension ? { "openai/ui": extension } : {}),
    "openai/toolInvocation/invoking": status[0],
    "openai/toolInvocation/invoked": status[1]
  };
}

const projectInputSchema = objectSchema({
  title: { type: "string", minLength: 1, maxLength: 200 },
  project_type: { type: "string", minLength: 1 },
  article_type: { type: "string", minLength: 1 },
  study_design: { type: "string" },
  target_journal: { type: "string" },
  author_role: { type: "string" },
  sensitivity: { type: "string", enum: ["public", "internal", "sensitive", "restricted"] }
}, ["title", "project_type", "article_type"]);

export function listMcpTools(): ToolDefinition[] {
  const projectId = { type: "string", minLength: 1, description: "A project ID returned by brs_list_projects or onboarding." };
  const interactionId = { type: "string", minLength: 1, description: "A server-issued interaction request ID." };
  const tools: ToolDefinition[] = [
    {
      name: "brs_get_onboarding",
      title: "Get Research Studio onboarding",
      description: "Return onboarding choices, existing project choices, privacy guidance, and the governed new-project form. Call this before rendering onboarding.",
      inputSchema: objectSchema({}), outputSchema: dataOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Preparing onboarding…", "Onboarding ready"])
    },
    {
      name: "brs_render_onboarding",
      title: "Show Research Studio onboarding",
      description: "Render the interactive onboarding UI. Use brs_get_onboarding first so the model can reason about available projects and privacy guidance.",
      inputSchema: objectSchema({}), outputSchema: renderOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Opening Research Studio…", "Research Studio ready"], UI_RESOURCES.onboarding)
    },
    {
      name: "brs_complete_onboarding",
      title: "Complete Research Studio onboarding",
      description: "Open an existing governed project or create a new one from the onboarding form. Creating a project establishes approval gates A-E; it does not approve any gate.",
      inputSchema: objectSchema({
        action: { type: "string", enum: ["create", "open"] },
        project_id: { type: "string" },
        project: projectInputSchema
      }, ["action"]), outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Saving onboarding choice…", "Onboarding complete"])
    },
    {
      name: "brs_list_projects",
      title: "List governed research projects",
      description: "List projects for a selectable project choice. Returns only project metadata, not manuscript or patient content.",
      inputSchema: objectSchema({}), outputSchema: dataOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Listing projects…", "Projects ready"])
    },
    {
      name: "brs_get_dashboard",
      title: "Get a project dashboard",
      description: "Return authoritative project, sources, tasks, findings, approvals, artifacts, and release-gate status. Call before rendering the dashboard.",
      inputSchema: objectSchema({ project_id: projectId }, ["project_id"]), outputSchema: dataOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Loading project…", "Project loaded"])
    },
    {
      name: "brs_render_dashboard",
      title: "Show the Research Studio dashboard",
      description: "Render the project workspace with evidence, tasks, approvals, and artifacts. Use brs_get_dashboard first.",
      inputSchema: objectSchema({ project_id: projectId }, ["project_id"]), outputSchema: renderOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Opening project workspace…", "Project workspace ready"], UI_RESOURCES.dashboard, {
        entrypoints: [{ type: "global" }, { type: "thread" }]
      })
    },
    {
      name: "brs_get_review_workspace",
      title: "Get two-panel scientific review",
      description: "Return source metadata, original-versus-proposed revision pairs, findings, and safety status for a two-panel review. No source file content is exposed by this tool.",
      inputSchema: objectSchema({ project_id: projectId, revision_id: { type: "string" }, file_uri: { type: "string", description: "Optional ChatGPT file resource URI supplied to a file entrypoint." } }, ["project_id"]),
      outputSchema: dataOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Preparing scientific review…", "Scientific review ready"])
    },
    {
      name: "brs_render_review_workspace",
      title: "Show two-panel scientific review",
      description: "Render source context on the left and evidence-linked findings or proposed revisions on the right. Use brs_get_review_workspace first.",
      inputSchema: objectSchema({ project_id: projectId, revision_id: { type: "string" }, file_uri: { type: "string" } }, ["project_id"]),
      outputSchema: renderOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Opening review workspace…", "Review workspace ready"], UI_RESOURCES.review, {
        entrypoints: [{ type: "thread" }, { type: "file", extensions: ["docx", "pdf", "csv", "xlsx", "xls", "tsv", "png", "jpg", "jpeg", "tif", "tiff"] }]
      })
    },
    {
      name: "brs_inspect_file_metadata",
      title: "Inspect selected file metadata",
      description: "Validate and summarize metadata for a ChatGPT-selected file without downloading or processing its contents. Use a separate governed source-ingestion action before scientific processing.",
      inputSchema: objectSchema({
        project_id: projectId,
        file: objectSchema({
          download_url: { type: "string" }, file_id: { type: "string" }, mime_type: { type: "string" }, file_name: { type: "string" }
        }, ["file_id", "file_name"])
      }, ["file"]), outputSchema: dataOutputSchema, annotations: readOnly,
      _meta: { ...toolMeta(["Inspecting file metadata…", "File metadata ready"]), "openai/fileParams": ["file"] }
    },
    {
      name: "brs_create_selectable_question",
      title: "Create a clickable choice question",
      description: "Use this whenever the user can answer from finite known choices. It creates a server-issued single- or multi-select form so the next step can present clickable choices instead of asking the user to type an option. Call brs_render_selectable_question afterward.",
      inputSchema: objectSchema({
        project_id: { type: "string" }, prompt: { type: "string", minLength: 1 }, help_text: { type: "string" },
        selection_mode: { type: "string", enum: ["single", "multiple"] },
        options: { type: "array", minItems: 2, maxItems: 20, items: objectSchema({ value: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 }, description: { type: "string" }, thumbnail: { type: "string" } }, ["value", "title"]) },
        min_selections: { type: "integer", minimum: 0 }, max_selections: { type: "integer", minimum: 1 }, allow_other: { type: "boolean" }, purpose: { type: "string" }
      }, ["prompt", "selection_mode", "options"]), outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Preparing choices…", "Choices ready"])
    },
    {
      name: "brs_render_selectable_question",
      title: "Show a clickable choice question",
      description: "Render a pending server-issued question as selectable items. Only use a request_id returned by brs_create_selectable_question.",
      inputSchema: objectSchema({ request_id: interactionId }, ["request_id"]), outputSchema: renderOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Opening choices…", "Choices ready"], UI_RESOURCES.forms)
    },
    {
      name: "brs_submit_selectable_response",
      title: "Submit a choice response",
      description: "Record a human selection against the exact server-issued options. The server rejects unknown options, repeated submissions, and invalid selection counts.",
      inputSchema: objectSchema({ request_id: interactionId, selected: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" }, uniqueItems: true }] }, other: { type: "string" } }, ["request_id", "selected"]),
      outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Recording selection…", "Selection recorded"])
    },
    {
      name: "brs_prepare_approval",
      title: "Prepare a governed approval request",
      description: "Create a server-issued approval request containing the exact proposed wording, source version, open findings, scientific consequence, and resulting artifacts. This does not approve anything. Call brs_render_approval afterward.",
      inputSchema: objectSchema({ project_id: projectId, subject_id: { type: "string" }, gate: { type: "string", enum: ["A", "B", "C", "D", "E"] } }, ["project_id"]),
      outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Preparing approval request…", "Approval request ready"])
    },
    {
      name: "brs_render_approval",
      title: "Show an approval card",
      description: "Render a pending approval with clickable Approve, Request changes, and Reject choices. Only use a request_id returned by brs_prepare_approval.",
      inputSchema: objectSchema({ request_id: interactionId }, ["request_id"]), outputSchema: renderOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Opening approval…", "Approval ready"], UI_RESOURCES.approval)
    },
    {
      name: "brs_submit_approval",
      title: "Submit a governed approval decision",
      description: "Record the named human approver's decision for a server-issued approval request. The exact wording and scientific context come from the immutable request; clients cannot replace them during submission.",
      inputSchema: objectSchema({ request_id: interactionId, decision: { type: "string", enum: ["approved", "rejected", "changes_requested"] }, approver: { type: "string", minLength: 1 }, rationale: { type: "string", minLength: 1 } }, ["request_id", "decision", "approver", "rationale"]),
      outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Recording approval decision…", "Approval decision recorded"])
    },
    {
      name: "brs_ingest_chatgpt_file",
      title: "Ingest a selected research file",
      description: "Download a ChatGPT-selected file through its signed URL, run local identifier screening, and store an immutable source artifact. Quarantined files are blocked from scientific processing.",
      inputSchema: objectSchema({ project_id: projectId, file: objectSchema({ download_url: { type: "string", format: "uri" }, file_id: { type: "string" }, file_name: { type: "string" }, mime_type: { type: "string" } }, ["download_url", "file_id"]) }, ["project_id", "file"]),
      outputSchema: dataOutputSchema, annotations: { ...writeOnly, openWorldHint: true },
      _meta: { ...toolMeta(["Screening and ingesting file…", "File intake complete"]), "openai/fileParams": ["file"] }
    },
    {
      name: "brs_extract_manuscript",
      title: "Extract manuscript claims",
      description: "Extract traceable paragraph and sentence locations from an inventoried DOCX or text manuscript and create stable candidate claims. This never processes quarantined sources and does not verify claims.",
      inputSchema: objectSchema({ project_id: projectId, source_artifact_id: { type: "string" } }, ["project_id", "source_artifact_id"]),
      outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Extracting traceable claims…", "Claim extraction complete"])
    },
    {
      name: "brs_search_pubmed",
      title: "Search PubMed",
      description: "Run a live PubMed search and save the exact query, timestamp, identifiers, source URLs, and returned metadata. Finding a citation does not establish that it supports a manuscript claim.",
      inputSchema: objectSchema({ project_id: projectId, query: { type: "string", minLength: 1, maxLength: 500 }, limit: { type: "integer", minimum: 1, maximum: 50 } }, ["project_id", "query"]),
      outputSchema: dataOutputSchema, annotations: networkRead,
      _meta: toolMeta(["Searching PubMed…", "PubMed results ready"])
    },
    {
      name: "brs_create_google_scholar_search",
      title: "Create a Google Scholar search",
      description: "Create a user-opened Google Scholar search URL without scraping or silently importing results. Selected citations must be imported and independently verified.",
      inputSchema: objectSchema({ project_id: projectId, query: { type: "string", minLength: 1, maxLength: 500 } }, ["project_id", "query"]),
      outputSchema: dataOutputSchema, annotations: { ...readOnly, openWorldHint: true },
      _meta: toolMeta(["Preparing Scholar search…", "Scholar search ready"])
    },
    {
      name: "brs_get_evidence_workspace",
      title: "Get claims and exact evidence passages",
      description: "Return manuscript claims, literature records, exact source passages, proposed links, and citation-health alerts while keeping citation identity separate from support.",
      inputSchema: objectSchema({ project_id: projectId }, ["project_id"]), outputSchema: dataOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Loading evidence ledger…", "Evidence ledger ready"])
    },
    {
      name: "brs_render_evidence_workspace",
      title: "Show the evidence workspace",
      description: "Render selectable manuscript claims beside literature records, exact passages, proposed support links, and citation-health alerts.",
      inputSchema: objectSchema({ project_id: projectId }, ["project_id"]), outputSchema: renderOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Opening evidence workspace…", "Evidence workspace ready"], UI_RESOURCES.evidence, { entrypoints: [{ type: "thread" }] })
    },
    {
      name: "brs_record_evidence_passage",
      title: "Record an exact source passage",
      description: "Record an exact passage and precise location from a literature record. The passage remains unassessed until a human reviews its relation to a claim.",
      inputSchema: objectSchema({ project_id: projectId, literature_record_id: { type: "string" }, passage_text: { type: "string", minLength: 1 }, location: { type: "object", additionalProperties: true }, recorder: { type: "string" } }, ["project_id", "literature_record_id", "passage_text", "location"]),
      outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Recording exact passage…", "Evidence passage recorded"])
    },
    {
      name: "brs_propose_claim_evidence_link",
      title: "Propose a claim-to-passage link",
      description: "Propose that an exact passage supports, contradicts, or contextualizes a manuscript claim. The link remains proposed and routes to Gate B human review.",
      inputSchema: objectSchema({ project_id: projectId, claim_id: { type: "string" }, passage_id: { type: "string" }, relation: { type: "string", enum: ["supports", "contradicts", "contextualizes"] } }, ["project_id", "claim_id", "passage_id", "relation"]),
      outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Proposing evidence link…", "Evidence link ready for review"])
    },
    {
      name: "brs_check_citation_health",
      title: "Check citation retraction and update signals",
      description: "Check saved PubMed publication types and Crossref update metadata for retraction or correction signals. A clear result is not a guarantee of validity.",
      inputSchema: objectSchema({ project_id: projectId, literature_record_id: { type: "string" } }, ["project_id", "literature_record_id"]),
      outputSchema: dataOutputSchema, annotations: networkRead,
      _meta: toolMeta(["Checking citation health…", "Citation-health check complete"])
    },
    {
      name: "brs_import_endnote_xml",
      title: "Import EndNote XML",
      description: "Import and deduplicate EndNote XML supplied as text. DOI, PMID, then normalized title and year are used as identity keys; ambiguous duplicates require human review.",
      inputSchema: objectSchema({ project_id: projectId, xml: { type: "string", minLength: 1 }, importer: { type: "string" } }, ["project_id", "xml"]),
      outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Importing EndNote records…", "EndNote import complete"])
    },
    {
      name: "brs_export_endnote_xml",
      title: "Export EndNote XML",
      description: "Export the project's normalized reference records as EndNote XML with a content hash for provenance.",
      inputSchema: objectSchema({ project_id: projectId }, ["project_id"]), outputSchema: dataOutputSchema, annotations: readOnly,
      _meta: toolMeta(["Preparing EndNote export…", "EndNote export ready"])
    },
    {
      name: "brs_inspect_docx_compatibility",
      title: "Inspect DOCX round-trip compatibility",
      description: "Inspect an inventoried DOCX before editing. Macros, signatures, ActiveX, embedded OLE objects, and altChunk content block round-trip editing; comments and tracked changes require review.",
      inputSchema: objectSchema({ project_id: projectId, source_artifact_id: { type: "string" } }, ["project_id", "source_artifact_id"]),
      outputSchema: dataOutputSchema, annotations: writeOnly,
      _meta: toolMeta(["Inspecting DOCX structures…", "DOCX compatibility report ready"])
    }
  ];
  return tools.map((tool) => ({
    ...tool,
    securitySchemes: [{ type: "oauth2", scopes: tool.annotations.readOnlyHint ? [READ_SCOPE] : [READ_SCOPE, WRITE_SCOPE] }]
  }));
}

function projectIdFrom(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const object = data as JsonObject;
  const project = object.project as JsonObject | undefined;
  return typeof project?.id === "string" ? project.id : typeof object.project_id === "string" ? object.project_id : undefined;
}

function nextActions(label: string, data: unknown): NextAction[] {
  const projectId = projectIdFrom(data);
  if (label === "onboarding") {
    if (projectId) return [{ id: "open-dashboard", label: "Open project workspace", description: "Continue with source intake and the governed task plan.", kind: "tool", tool: "brs_render_dashboard", arguments: { project_id: projectId }, recommended: true }];
    return [{ id: "complete-setup", label: "Complete project setup", description: "Choose an existing project or create a governed workspace.", kind: "client", client_action: "focus-onboarding", recommended: true }];
  }
  if (label === "projects") return [{ id: "choose-project", label: "Choose a project", description: "Open onboarding to select an existing project or create a new one.", kind: "tool", tool: "brs_render_onboarding", arguments: {}, recommended: true }];
  if (label === "dashboard" && data && typeof data === "object" && !Array.isArray(data)) {
    const dashboard = data as JsonObject;
    const sources = Array.isArray(dashboard.sources) ? dashboard.sources : [];
    const findings = Array.isArray(dashboard.findings) ? dashboard.findings as JsonObject[] : [];
    const unresolvedFindings = findings.filter((record) => {
      const finding = (record.payload as JsonObject | undefined) ?? record;
      return finding.audit_status !== "consistent" && record.status !== "resolved" && record.status !== "superseded";
    });
    const pending = Array.isArray(dashboard.pending_approvals) ? dashboard.pending_approvals as JsonObject[] : [];
    const release = dashboard.release as JsonObject | undefined;
    if (!projectId) return [];
    if (sources.length === 0) return [{ id: "add-sources", label: "Add research materials", description: "Select the manuscript, protocol, outputs, tables, figures, or reviewer files for privacy screening.", kind: "client", client_action: "select-files", recommended: true }];
    if (unresolvedFindings.length > 0) return [{ id: "review-findings", label: "Review findings", description: "Compare source context, discrepancies, and proposed revisions side by side.", kind: "tool", tool: "brs_render_review_workspace", arguments: { project_id: projectId }, recommended: true }];
    const nextGate = Array.isArray(release?.missing_gates) ? String(release.missing_gates[0] ?? "") : "";
    if (nextGate) {
      const revision = pending[0];
      if (nextGate !== "D" || revision) return [{
        id: `review-gate-${nextGate.toLowerCase()}`,
        label: `Review Gate ${nextGate}`,
        description: "Inspect the locked scope, evidence, wording, findings, and scientific consequence before deciding.",
        kind: "tool",
        tool: "brs_prepare_approval",
        arguments: { project_id: projectId, ...(nextGate === "D" ? { subject_id: revision?.id } : {}), gate: nextGate },
        recommended: true
      }];
    }
    if (!release?.releasable) return [{ id: "continue-workflow", label: "Continue the governed workflow", description: "Ask the Senior Investigator to identify the next incomplete gate and required evidence.", kind: "message", prompt: `For project ${projectId}, show the next incomplete approval gate, the evidence still needed, and the safest next action.`, recommended: true }];
    return [{ id: "review-release", label: "Review release package", description: "Verify artifacts and provenance before document delivery.", kind: "message", prompt: `For project ${projectId}, review the approved release package and show the available artifacts.`, recommended: true }];
  }
  if (label === "review" && projectId) {
    const object = data as JsonObject;
    const revisions = Array.isArray(object.revisions) ? object.revisions as JsonObject[] : [];
    const findings = Array.isArray(object.findings) ? object.findings : [];
    if (findings.length > 0) return [{ id: "resolve-finding", label: "Resolve the next finding", description: "Choose the authoritative source or request clarification before changing scientific text.", kind: "message", prompt: `For project ${projectId}, guide me through resolving the highest-severity open finding using clickable choices.`, recommended: true }];
    if (revisions.length > 0) return [{ id: "approve-revision", label: "Review revision approval", description: "Review the exact proposed wording for Gate D.", kind: "tool", tool: "brs_prepare_approval", arguments: { project_id: projectId, subject_id: revisions[0]?.id, gate: "D" }, recommended: true }];
    return [{ id: "return-dashboard", label: "Return to project overview", description: "Review project status and the next incomplete gate.", kind: "tool", tool: "brs_render_dashboard", arguments: { project_id: projectId }, recommended: true }];
  }
  if ((label === "question" || label === "forms") && data && typeof data === "object" && !Array.isArray(data)) {
    const request = data as JsonObject;
    if (request.status === "pending" && typeof request.id === "string") return [{ id: "answer-question", label: "Choose a response", description: "Answer using the selectable items supplied with this question.", kind: "tool", tool: "brs_render_selectable_question", arguments: { request_id: request.id }, recommended: true }];
    if (projectId) return [{ id: "return-dashboard", label: "Continue project", description: "Return to the project overview and updated recommendations.", kind: "tool", tool: "brs_render_dashboard", arguments: { project_id: projectId }, recommended: true }];
  }
  if (label === "approval" && data && typeof data === "object" && !Array.isArray(data)) {
    const object = data as JsonObject;
    const request = (object.request as JsonObject | undefined) ?? object;
    if (request.status === "pending" && typeof request.id === "string") return [{ id: "decide-approval", label: "Review and decide", description: "Inspect the locked wording, sources, findings, and consequence before recording a decision.", kind: "tool", tool: "brs_render_approval", arguments: { request_id: request.id }, recommended: true }];
    const approvalProjectId = projectIdFrom(request) ?? projectId;
    if (approvalProjectId) return [{ id: "return-dashboard", label: "Continue project", description: "See updated gates, findings, and the next recommended action.", kind: "tool", tool: "brs_render_dashboard", arguments: { project_id: approvalProjectId }, recommended: true }];
  }
  if (label === "file") return [{ id: "inventory-file", label: "Continue governed intake", description: "Confirm the destination project, run privacy screening, and inventory the selected file before scientific use.", kind: "message", prompt: "Continue governed source intake for the selected file. Confirm the project, run privacy screening, and do not use the contents scientifically until inventory succeeds.", recommended: true }];
  if (label === "evidence" && projectId) return [{ id: "search-evidence", label: "Search PubMed", description: "Search for relevant literature, then capture exact supporting or contradicting passages.", kind: "message", prompt: `For project ${projectId}, help me build a privacy-safe PubMed query using the manuscript claims, then show the results.`, recommended: true }];
  if (label === "extraction" && projectId) return [{ id: "open-evidence", label: "Review extracted claims", description: "Inspect candidate claims and begin evidence linking.", kind: "tool", tool: "brs_render_evidence_workspace", arguments: { project_id: projectId }, recommended: true }];
  if (label === "literature" && projectId) return [{ id: "open-evidence", label: "Review citations and passages", description: "Compare citations with exact passages and manuscript claims.", kind: "tool", tool: "brs_render_evidence_workspace", arguments: { project_id: projectId }, recommended: true }];
  if (label === "docx" && projectId) return [{ id: "return-dashboard", label: "Continue controlled document workflow", description: "Review compatibility findings before approving the source version for editing.", kind: "tool", tool: "brs_render_dashboard", arguments: { project_id: projectId }, recommended: true }];
  return [];
}

function fallbackText(label: string, data: unknown, actions: NextAction[]): string {
  const next = actions[0] ? ` Next: ${actions[0].label}.` : "";
  if (label === "projects" && Array.isArray(data)) return `${data.length ? `${data.length} governed project${data.length === 1 ? "" : "s"} available.` : "No governed projects exist yet."}${next}`;
  if (label === "dashboard") {
    const dashboard = data as JsonObject;
    const release = dashboard.release as JsonObject | undefined;
    return `Project dashboard loaded. Release is ${release?.releasable ? "approved" : "blocked"}.${next}`;
  }
  if (label === "question") return `A clickable response form is ready. In clients without UI, respond with one of the option values in data.requested_schema.${next}`;
  if (label === "approval") return `A governed approval request is ready. In clients without UI, use brs_submit_approval with the request ID and an explicit human decision.${next}`;
  return `${label} data is available in structuredContent.${next}`;
}

function dataResult(label: string, data: unknown) {
  const actions = nextActions(label, data);
  const structuredContent = { data, fallback_text: fallbackText(label, data, actions), next_actions: actions };
  return { content: [{ type: "text", text: structuredContent.fallback_text }], structuredContent };
}

function renderResult(view: keyof typeof UI_RESOURCES, data: unknown) {
  const actions = nextActions(view, data);
  const structuredContent = { view, data, fallback_text: fallbackText(view, data, actions), next_actions: actions };
  return { content: [{ type: "text", text: structuredContent.fallback_text }], structuredContent };
}

function requireString(input: JsonObject, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value;
}

function requireEnum<T extends string>(input: JsonObject, key: string, allowed: readonly T[]): T {
  const value = requireString(input, key);
  if (!allowed.includes(value as T)) throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  return value as T;
}

function requireObject(input: JsonObject, key: string): JsonObject {
  const value = input[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} is required`);
  return value as JsonObject;
}

function validatedProjectInput(input: JsonObject): ProjectInputType {
  const allowedSensitivity = ["public", "internal", "sensitive", "restricted"] as const;
  const title = requireString(input, "title");
  if (title.length > 200) throw new Error("title must be 200 characters or fewer");
  const optionalString = (key: string) => input[key] === undefined ? undefined : requireString(input, key);
  return {
    title,
    project_type: requireString(input, "project_type"),
    article_type: requireString(input, "article_type"),
    study_design: optionalString("study_design"),
    target_journal: optionalString("target_journal"),
    author_role: optionalString("author_role"),
    sensitivity: input.sensitivity === undefined ? undefined : requireEnum(input, "sensitivity", allowedSensitivity)
  };
}

function reviewModel(db: StudioDb, input: JsonObject) {
  const projectId = requireString(input, "project_id");
  const project = getProject(db, projectId);
  if (!project) throw new Error("Project not found");
  const revisions = listRecords(db, projectId, "ManuscriptRevision");
  const selected = typeof input.revision_id === "string" ? revisions.filter((revision) => revision.id === input.revision_id) : revisions;
  return {
    project,
    file_uri: typeof input.file_uri === "string" ? input.file_uri : null,
    source_metadata: listSources(db, projectId),
    revisions: selected.map((revision) => {
      const payload = revision.payload as JsonObject;
      return {
        id: revision.id,
        section: payload.section,
        original_text: payload.original_text,
        proposed_text: payload.proposed_text,
        rationale: payload.rationale,
        substantive_domains: payload.substantive_domains,
        source_artifact_ids: revision.source_artifact_ids,
        status: revision.status,
        human_review_required: revision.human_review_required
      };
    }),
    findings: listRecords(db, projectId, "Finding"),
    safety_note: "Proposed revisions are not approved or publication-ready until the applicable human gates are explicitly approved."
  };
}

export async function callMcpTool(db: StudioDb, name: string, input: JsonObject = {}, dataRoot = join(process.cwd(), "data")) {
  switch (name) {
    case "brs_get_onboarding": return dataResult("onboarding", getOnboardingModel(db));
    case "brs_render_onboarding": return renderResult("onboarding", getOnboardingModel(db));
    case "brs_complete_onboarding": {
      const action = requireEnum(input, "action", ["create", "open"] as const);
      return dataResult("onboarding", completeOnboarding(db, {
      action,
      project_id: typeof input.project_id === "string" ? input.project_id : undefined,
      project: action === "create" ? validatedProjectInput(requireObject(input, "project")) : undefined
    }));
    }
    case "brs_list_projects": return dataResult("projects", listProjects(db));
    case "brs_get_dashboard": return dataResult("dashboard", getDashboard(db, requireString(input, "project_id")));
    case "brs_render_dashboard": return renderResult("dashboard", getDashboard(db, requireString(input, "project_id")));
    case "brs_get_review_workspace": return dataResult("review", reviewModel(db, input));
    case "brs_render_review_workspace": return renderResult("review", reviewModel(db, input));
    case "brs_inspect_file_metadata": {
      const file = input.file as JsonObject | undefined;
      if (!file || typeof file.file_id !== "string" || typeof file.file_name !== "string") throw new Error("A ChatGPT file reference is required");
      if (input.project_id && !getProject(db, String(input.project_id))) throw new Error("Project not found");
      return dataResult("file", {
        project_id: input.project_id ?? null,
        file_id: file.file_id,
        file_name: file.file_name,
        mime_type: typeof file.mime_type === "string" ? file.mime_type : "application/octet-stream",
        ingestion_status: "not_ingested",
        next_step: "Confirm the project and use governed source ingestion before scientific processing.",
        human_review_required: true
      });
    }
    case "brs_create_selectable_question": return dataResult("question", createSelectableQuestion(db, input as unknown as SelectableQuestionInput));
    case "brs_render_selectable_question": {
      const request = getInteraction(db, requireString(input, "request_id"));
      if (request.kind !== "selectable_question") throw new Error("Interaction is not a selectable question");
      return renderResult("forms", request);
    }
    case "brs_submit_selectable_response": return dataResult("question", submitSelectableResponse(db, requireString(input, "request_id"), input.selected as string | string[], typeof input.other === "string" ? input.other : undefined));
    case "brs_prepare_approval": return dataResult("approval", prepareApprovalRequest(db, {
      project_id: requireString(input, "project_id"),
      subject_id: typeof input.subject_id === "string" ? input.subject_id : undefined,
      gate: input.gate === undefined ? undefined : requireEnum(input, "gate", ["A", "B", "C", "D", "E"] as const)
    }));
    case "brs_render_approval": {
      const request = getInteraction(db, requireString(input, "request_id"));
      if (request.kind !== "approval") throw new Error("Interaction is not an approval request");
      return renderResult("approval", request);
    }
    case "brs_submit_approval": return dataResult("approval", submitPreparedApproval(db, {
      request_id: requireString(input, "request_id"),
      decision: requireEnum(input, "decision", ["approved", "rejected", "changes_requested"] as const),
      approver: requireString(input, "approver"),
      rationale: requireString(input, "rationale")
    }));
    case "brs_ingest_chatgpt_file": {
      const file = requireObject(input, "file");
      return dataResult("file", await ingestChatGptFile(db, dataRoot, requireString(input, "project_id"), {
        download_url: requireString(file, "download_url"),
        file_id: requireString(file, "file_id"),
        file_name: typeof file.file_name === "string" && file.file_name.trim() ? file.file_name : `chatgpt-${file.file_id}`,
        mime_type: typeof file.mime_type === "string" ? file.mime_type : undefined
      }));
    }
    case "brs_extract_manuscript": return dataResult("extraction", extractManuscript(db, requireString(input, "project_id"), requireString(input, "source_artifact_id")));
    case "brs_search_pubmed": return dataResult("literature", await searchPubMed(db, requireString(input, "project_id"), requireString(input, "query"), typeof input.limit === "number" ? input.limit : 10));
    case "brs_create_google_scholar_search": return dataResult("literature", googleScholarHandoff(db, requireString(input, "project_id"), requireString(input, "query")));
    case "brs_get_evidence_workspace": return dataResult("evidence", getEvidenceWorkspace(db, requireString(input, "project_id")));
    case "brs_render_evidence_workspace": return renderResult("evidence", getEvidenceWorkspace(db, requireString(input, "project_id")));
    case "brs_record_evidence_passage": return dataResult("evidence", addEvidencePassage(db, requireString(input, "project_id"), requireString(input, "literature_record_id"), requireString(input, "passage_text"), requireObject(input, "location"), typeof input.recorder === "string" ? input.recorder : undefined));
    case "brs_propose_claim_evidence_link": return dataResult("evidence", proposeClaimEvidenceLink(db, requireString(input, "project_id"), requireString(input, "claim_id"), requireString(input, "passage_id"), requireEnum(input, "relation", ["supports", "contradicts", "contextualizes"] as const)));
    case "brs_check_citation_health": return dataResult("literature", await checkCitationHealth(db, requireString(input, "project_id"), requireString(input, "literature_record_id")));
    case "brs_import_endnote_xml": return dataResult("literature", importEndNoteXml(db, requireString(input, "project_id"), requireString(input, "xml"), typeof input.importer === "string" ? input.importer : undefined));
    case "brs_export_endnote_xml": return dataResult("literature", exportEndNoteXml(db, requireString(input, "project_id")));
    case "brs_inspect_docx_compatibility": return dataResult("docx", inspectDocxCompatibility(db, requireString(input, "project_id"), requireString(input, "source_artifact_id")));
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

const resourceInfo: Record<string, { file: string; name: string; description: string; modes: string[]; border: boolean }> = {
  [UI_RESOURCES.onboarding]: { file: "onboarding.html", name: "Research Studio onboarding", description: "Guided setup and project choice.", modes: ["inline", "fullscreen"], border: true },
  [UI_RESOURCES.dashboard]: { file: "dashboard.html", name: "Research Studio dashboard", description: "Project dashboard, evidence, approvals, and artifacts.", modes: ["inline", "fullscreen"], border: false },
  [UI_RESOURCES.review]: { file: "review.html", name: "Two-panel scientific review", description: "Original context beside findings and proposed revisions.", modes: ["inline", "fullscreen"], border: false },
  [UI_RESOURCES.approval]: { file: "approval.html", name: "Governed approval card", description: "Exact wording, evidence context, and explicit human decision controls.", modes: ["inline", "fullscreen"], border: true },
  [UI_RESOURCES.forms]: { file: "forms.html", name: "Selectable question form", description: "Clickable single- and multi-select response options.", modes: ["inline", "fullscreen"], border: true },
  [UI_RESOURCES.evidence]: { file: "evidence.html", name: "Claim-to-source evidence workspace", description: "Selectable claims, exact source passages, proposed links, and citation-health alerts.", modes: ["inline", "fullscreen"], border: false }
};

export function listMcpResources() {
  return Object.entries(resourceInfo).map(([uri, resource]) => ({ uri, name: resource.name, description: resource.description, mimeType: APP_MIME_TYPE }));
}

export function readMcpResource(repoRoot: string, uri: string) {
  const resource = resourceInfo[uri];
  if (!resource) throw new Error("Resource not found");
  const uiRoot = join(repoRoot, "ui");
  const path = join(uiRoot, resource.file);
  if (!existsSync(path)) throw new Error(`Packaged UI resource is missing: ${resource.file}`);
  const cssPath = join(uiRoot, "styles.css");
  const bridgePath = join(uiRoot, "bridge.js");
  const uiPath = join(uiRoot, "ui.js");
  for (const requiredPath of [cssPath, bridgePath, uiPath]) if (!existsSync(requiredPath)) throw new Error(`Packaged UI asset is missing: ${requiredPath}`);
  const css = readFileSync(cssPath, "utf8");
  const bridge = readFileSync(bridgePath, "utf8").replace("export const bridge =", "const bridge =");
  const ui = readFileSync(uiPath, "utf8").replace(/^import\s+\{\s*bridge\s*\}\s+from\s+["']\.\/bridge\.js["'];?\s*/m, "");
  const text = readFileSync(path, "utf8")
    .replace(/<link\s+rel=["']stylesheet["']\s+href=["']\.\/styles\.css["']\s*\/?>/i, `<style>${css}</style>`)
    .replace(/<script\s+type=["']module["']\s+src=["']\.\/ui\.js["']><\/script>/i, `<script type="module">${bridge}\n${ui}</script>`);
  return {
    contents: [{
      uri,
      mimeType: APP_MIME_TYPE,
      text,
      _meta: {
        ui: { prefersBorder: resource.border, csp: { connectDomains: [], resourceDomains: [] } },
        "openai/ui": { availableDisplayModes: resource.modes },
        "openai/widgetDescription": resource.description,
        "openai/widgetPrefersBorder": resource.border,
        "openai/widgetCSP": { connect_domains: [], resource_domains: [] }
      }
    }] as const
  };
}

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: JsonObject };

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

type WorkspaceResolver = (request: FastifyRequest) => TenantWorkspace | Promise<TenantWorkspace>;

export function registerMcpRoutes(
  app: FastifyInstance,
  dbOrResolver: StudioDb | WorkspaceResolver,
  repoRoot: string,
  dataRoot = join(repoRoot, "data"),
  auth?: AuthRuntime
): void {
  const resolveWorkspace: WorkspaceResolver = typeof dbOrResolver === "function"
    ? dbOrResolver
    : async () => ({
        db: dbOrResolver,
        dataRoot,
        identity: { subject: "local-user", issuer: "local", tenantKey: "local", scopes: new Set([READ_SCOPE, WRITE_SCOPE]) }
      });

  app.get("/mcp", async () => ({
    name: "Biomedical Research Studio",
    protocol: "Model Context Protocol",
    protocol_version: MCP_PROTOCOL_VERSION,
    endpoint: "/mcp",
    transports: ["streamable-http-json"],
    instructions: "POST JSON-RPC 2.0 requests to this endpoint. Tools retain structured, headless fallbacks when UI resources are unavailable."
  }));

  app.post("/mcp", async (request, reply) => {
    const body = request.body as JsonRpcRequest;
    if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") return reply.code(400).send(rpcError(body?.id, -32600, "Invalid JSON-RPC request"));
    if (body.id === undefined) return reply.code(204).send();
    try {
      switch (body.method) {
        case "server/discover":
          return rpcResult(body.id, {
            resultType: "complete",
            supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
            capabilities: { tools: {}, resources: {} }
          });
        case "initialize":
          return rpcResult(body.id, {
            protocolVersion: typeof body.params?.protocolVersion === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(body.params.protocolVersion as typeof SUPPORTED_PROTOCOL_VERSIONS[number]) ? body.params.protocolVersion : MCP_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
            serverInfo: { name: "biomedical-research-studio", version: "0.4.1" },
            instructions: "Use clickable selectable-question tools whenever the user can choose from finite options. Never treat generated text or a UI click as scientific approval unless brs_submit_approval records a named human decision."
          });
        case "ping": return rpcResult(body.id, {});
        case "tools/list": return rpcResult(body.id, { resultType: "complete", ttlMs: 300_000, cacheScope: "public", tools: listMcpTools() });
        case "tools/call": {
          const params = body.params ?? {};
          const toolName = requireString(params, "name");
          const workspace = await resolveWorkspace(request);
          const definition = listMcpTools().find((tool) => tool.name === toolName);
          const requiredScope = definition?.annotations.readOnlyHint ? READ_SCOPE : WRITE_SCOPE;
          if (auth && !workspace.identity.scopes.has(requiredScope)) {
            const challenge = auth.challenge(requiredScope, "insufficient_scope", `Permission ${requiredScope} is required`);
            return rpcResult(body.id, {
              isError: true,
              content: [{ type: "text", text: `Authorization required: ${requiredScope}` }],
              _meta: { "mcp/www_authenticate": [challenge] }
            });
          }
          const result = await callMcpTool(workspace.db, toolName, (params.arguments as JsonObject | undefined) ?? {}, workspace.dataRoot);
          return rpcResult(body.id, result);
        }
        case "resources/list": return rpcResult(body.id, { resultType: "complete", ttlMs: 300_000, cacheScope: "public", resources: listMcpResources() });
        case "resources/read": return rpcResult(body.id, readMcpResource(repoRoot, requireString(body.params ?? {}, "uri")));
        default: return reply.code(404).send(rpcError(body.id, -32601, "Method not found"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool call failed";
      if (body.method === "tools/call") {
        return rpcResult(body.id, { isError: true, content: [{ type: "text", text: message }], structuredContent: { data: { error: message, human_review_required: true }, fallback_text: message, next_actions: [] } });
      }
      return reply.code(400).send(rpcError(body.id, -32602, message));
    }
  });
}
