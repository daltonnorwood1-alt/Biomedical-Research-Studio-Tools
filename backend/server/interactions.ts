import { randomUUID } from "node:crypto";
import type { StudioDb } from "./db.js";
import { appendAudit, createProject, getProject, listApprovals, listProjects, listSources, recordApproval, releaseAssessment } from "./core.js";
import type { ApprovalInputType, ProjectInputType } from "../shared/schemas/contracts.js";

export type ChoiceOption = {
  value: string;
  title: string;
  description?: string;
  thumbnail?: string;
};

export type SelectableQuestionInput = {
  project_id?: string;
  prompt: string;
  help_text?: string;
  selection_mode: "single" | "multiple";
  options: ChoiceOption[];
  min_selections?: number;
  max_selections?: number;
  allow_other?: boolean;
  purpose?: string;
};

type InteractionRow = {
  id: string;
  project_id: string | null;
  kind: string;
  prompt: string;
  requested_schema: string;
  context: string;
  status: string;
  response: string | null;
  created_at: string;
  responded_at: string | null;
};

const now = () => new Date().toISOString();
const encode = (value: unknown) => JSON.stringify(value);
const decode = <T>(value: string) => JSON.parse(value) as T;

function validateOptions(options: ChoiceOption[]): void {
  if (!Array.isArray(options)) throw new Error("options must be an array");
  if (options.length < 2 || options.length > 20) throw new Error("Selectable questions require 2 to 20 options");
  if (options.some((option) => !option || typeof option !== "object")) throw new Error("Every option must be an object");
  if (options.some((option) => typeof option.value !== "string" || typeof option.title !== "string")) throw new Error("Every option requires string value and title fields");
  const values = options.map((option) => option.value.trim());
  if (values.some((value) => !value)) throw new Error("Every option requires a non-empty value");
  if (new Set(values).size !== values.length) throw new Error("Option values must be unique");
  if (options.some((option) => !option.title.trim())) throw new Error("Every option requires a title");
}

export function getInteraction(db: StudioDb, requestId: string) {
  const row = db.prepare("SELECT * FROM interaction_requests WHERE id = ?").get(requestId) as InteractionRow | undefined;
  if (!row) throw new Error("Interaction request not found");
  return {
    ...row,
    requested_schema: decode<Record<string, unknown>>(row.requested_schema),
    context: decode<Record<string, unknown>>(row.context),
    response: row.response ? decode<Record<string, unknown>>(row.response) : null
  };
}

export function createSelectableQuestion(db: StudioDb, input: SelectableQuestionInput, actor = "Biomedical Research Studio") {
  if (!input || typeof input !== "object") throw new Error("A selectable question is required");
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new Error("prompt is required");
  if (!(["single", "multiple"] as const).includes(input.selection_mode)) throw new Error("selection_mode must be single or multiple");
  if (input.project_id !== undefined && (typeof input.project_id !== "string" || !input.project_id.trim())) throw new Error("project_id must be a non-empty string");
  if (input.allow_other !== undefined && typeof input.allow_other !== "boolean") throw new Error("allow_other must be a boolean");
  for (const [name, value] of [["min_selections", input.min_selections], ["max_selections", input.max_selections]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new Error(`${name} must be a non-negative integer`);
  }
  validateOptions(input.options);
  if (input.project_id && !getProject(db, input.project_id)) throw new Error("Project not found");
  const min = input.min_selections ?? 1;
  const max = input.selection_mode === "single" ? 1 : (input.max_selections ?? input.options.length);
  if (min < 0 || max < min || max > input.options.length) throw new Error("Invalid selection limits");
  const property = input.selection_mode === "single"
    ? {
        type: "string",
        title: input.prompt,
        description: input.help_text,
        oneOf: input.options.map((option) => ({
          const: option.value,
          title: option.title,
          description: option.description,
          ...(option.thumbnail ? { "x-openai-thumbnail": option.thumbnail } : {})
        }))
      }
    : {
        type: "array",
        title: input.prompt,
        description: input.help_text,
        minItems: min,
        maxItems: max,
        uniqueItems: true,
        items: {
          type: "string",
          oneOf: input.options.map((option) => ({
            const: option.value,
            title: option.title,
            description: option.description,
            ...(option.thumbnail ? { "x-openai-thumbnail": option.thumbnail } : {})
          }))
        }
      };
  const requestedSchema = {
    type: "object",
    properties: { selected: property, ...(input.allow_other ? { other: { type: "string", title: "Other response" } } : {}) },
    required: ["selected"],
    additionalProperties: false
  };
  const requestId = `interaction_${randomUUID()}`;
  db.prepare("INSERT INTO interaction_requests(id,project_id,kind,prompt,requested_schema,context,status,response,created_at,responded_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(requestId, input.project_id ?? null, "selectable_question", input.prompt, encode(requestedSchema), encode({ ...input, min_selections: min, max_selections: max }), "pending", null, now(), null);
  appendAudit(db, input.project_id ?? null, "interaction.requested", actor, { request_id: requestId, kind: "selectable_question", purpose: input.purpose ?? null });
  return getInteraction(db, requestId);
}

export function submitSelectableResponse(db: StudioDb, requestId: string, selected: string | string[], other?: string, actor = "Human user") {
  const request = getInteraction(db, requestId);
  if (request.kind !== "selectable_question") throw new Error("Interaction is not a selectable question");
  if (request.status !== "pending") throw new Error("Interaction has already been answered");
  const context = request.context as unknown as SelectableQuestionInput & { min_selections: number; max_selections: number };
  const selections = Array.isArray(selected) ? selected : [selected];
  const allowed = new Set(context.options.map((option) => option.value));
  if (context.selection_mode === "single" && selections.length !== 1) throw new Error("Select exactly one option");
  if (selections.length < context.min_selections || selections.length > context.max_selections) throw new Error("Selection count is outside the permitted range");
  if (new Set(selections).size !== selections.length || selections.some((value) => !allowed.has(value))) throw new Error("Response contains an invalid option");
  if (other && !context.allow_other) throw new Error("This question does not accept an additional response");
  const response = { selected: context.selection_mode === "single" ? selections[0] : selections, ...(other ? { other } : {}) };
  db.prepare("UPDATE interaction_requests SET status = 'answered', response = ?, responded_at = ? WHERE id = ?")
    .run(encode(response), now(), requestId);
  appendAudit(db, request.project_id, "interaction.answered", actor, { request_id: requestId, selected: selections, included_other: Boolean(other) });
  return getInteraction(db, requestId);
}

export function getOnboardingModel(db: StudioDb) {
  const projects = listProjects(db) as Array<Record<string, unknown>>;
  return {
    title: "Welcome to Biomedical Research Studio",
    subtitle: "Choose an existing governed project or create a new one.",
    privacy_notice: "Do not add direct identifiers. Uploaded materials are screened and may be quarantined before downstream use.",
    choices: [
      { value: "create", title: "Create a new project", description: "Start a governed biomedical research workflow." },
      ...(projects.length ? [{ value: "open", title: "Open an existing project", description: `Choose from ${projects.length} existing project${projects.length === 1 ? "" : "s"}.` }] : [])
    ],
    projects: projects.map((project) => ({ id: project.id, title: project.title, phase: project.phase, status: project.status, sensitivity: project.sensitivity })),
    new_project_schema: {
      type: "object",
      properties: {
        title: { type: "string", title: "Project title", minLength: 1, maxLength: 200 },
        project_type: { type: "string", title: "Desired outcome", oneOf: ["new manuscript", "section drafting", "manuscript revision", "peer review response", "data integrity audit", "journal adaptation", "submission package"].map((value) => ({ const: value, title: value })) },
        article_type: { type: "string", title: "Article type", oneOf: ["Original research", "Systematic review", "Narrative review", "Case report", "Protocol", "Brief report", "Other"].map((value) => ({ const: value, title: value })) },
        study_design: { type: "string", title: "Study design" },
        target_journal: { type: "string", title: "Target journal" },
        author_role: { type: "string", title: "Your role" },
        sensitivity: { type: "string", title: "Sensitivity", oneOf: ["public", "internal", "sensitive", "restricted"].map((value) => ({ const: value, title: value })) }
      },
      required: ["title", "project_type", "article_type", "sensitivity"],
      additionalProperties: false
    }
  };
}

export function completeOnboarding(db: StudioDb, input: { action: "create" | "open"; project_id?: string; project?: ProjectInputType }, actor = "Human user") {
  if (!(["create", "open"] as const).includes(input.action)) throw new Error("action must be create or open");
  if (input.action === "open") {
    if (!input.project_id) throw new Error("project_id is required when opening a project");
    const project = getProject(db, input.project_id);
    if (!project) throw new Error("Project not found");
    appendAudit(db, input.project_id, "onboarding.completed", actor, { action: "open" });
    return { action: "open", project };
  }
  if (!input.project) throw new Error("project is required when creating a project");
  const project = createProject(db, input.project, actor);
  appendAudit(db, String((project as Record<string, unknown>).id), "onboarding.completed", actor, { action: "create" });
  return { action: "create", project };
}

export function prepareApprovalRequest(db: StudioDb, input: { project_id: string; subject_id?: string; gate?: "A" | "B" | "C" | "D" | "E" }, actor = "Biomedical Research Studio") {
  if (input.gate !== undefined && !(["A", "B", "C", "D", "E"] as const).includes(input.gate)) throw new Error("gate must be A, B, C, D, or E");
  const project = getProject(db, input.project_id) as Record<string, unknown> | undefined;
  if (!project) throw new Error("Project not found");
  const revisions = db.prepare("SELECT * FROM records WHERE project_id = ? AND record_type = 'ManuscriptRevision' ORDER BY created_at DESC").all(input.project_id) as Array<Record<string, unknown>>;
  const row = input.subject_id ? revisions.find((revision) => revision.id === input.subject_id) : revisions[0];
  const gate = input.gate ?? "D";
  const approvals = listApprovals(db, input.project_id) as Array<Record<string, unknown>>;
  const latestGate = new Map<string, string>();
  for (const approval of approvals) if (!latestGate.has(String(approval.gate))) latestGate.set(String(approval.gate), String(approval.decision));
  const sequence = ["A", "B", "C", "D", "E"] as const;
  const missingPriorGates = sequence.slice(0, sequence.indexOf(gate)).filter((priorGate) => latestGate.get(priorGate) !== "approved");
  if (missingPriorGates.length) throw new Error(`Gate ${gate} cannot be prepared until ${missingPriorGates.map((item) => `Gate ${item}`).join(", ")} ${missingPriorGates.length === 1 ? "is" : "are"} approved`);
  if (!row && gate === "D") throw new Error("No manuscript revision is available for approval");
  const sources = listSources(db, input.project_id) as Array<Record<string, unknown>>;
  if (gate === "B" && sources.length === 0) throw new Error("Gate B cannot be prepared until at least one source is inventoried");
  const payload = row ? decode<Record<string, unknown>>(String(row.payload)) : {};
  const findings = db.prepare("SELECT id,payload FROM records WHERE project_id = ? AND record_type = 'Finding' ORDER BY created_at DESC").all(input.project_id) as Array<Record<string, unknown>>;
  const openFindings = findings.filter((finding) => {
    const findingPayload = decode<Record<string, unknown>>(String(finding.payload));
    return findingPayload.audit_status !== "consistent";
  }).map((finding) => String(finding.id));
  if (gate === "E") {
    const assessment = releaseAssessment(db, input.project_id);
    const missingBeforeRelease = assessment.missing_gates.filter((missingGate) => missingGate !== "E");
    if (missingBeforeRelease.length || assessment.blocking_finding_ids.length) {
      throw new Error(`Gate E cannot be prepared while release blockers remain: ${[
        ...missingBeforeRelease.map((missingGate) => `Gate ${missingGate} is not approved`),
        ...assessment.blocking_finding_ids.map((findingId) => `finding ${findingId} is unresolved`)
      ].join("; ")}`);
    }
  }
  const sourceIds = sources.map((source) => String(source.id));
  const sourceNames = sources.map((source) => String(source.original_name));
  const gateWording: Record<typeof gate, string> = {
    A: `Approve project scope for ${String(project.project_type)} (${String(project.article_type)}${project.study_design ? `; ${String(project.study_design)}` : ""}).`,
    B: `Approve the inventoried evidence set of ${sources.length} source${sources.length === 1 ? "" : "s"}: ${sourceNames.join(", ")}.`,
    C: `Approve the audit state after review of ${findings.length} finding${findings.length === 1 ? "" : "s"}; unresolved findings: ${openFindings.length ? openFindings.join(", ") : "none"}.`,
    D: String(payload.proposed_text ?? ""),
    E: `Approve controlled release of the governed output package for ${String(project.title)}.`
  };
  const gateConsequence: Record<typeof gate, string> = {
    A: "This fixes the intended workflow and study scope used for downstream review.",
    B: "Only the listed source versions become the governed evidence set.",
    C: "This accepts the displayed audit state but does not override unresolved release blockers.",
    D: String(payload.rationale ?? "This accepts the exact manuscript revision shown."),
    E: "This authorizes production of the clean document, authentic redline, and release manifest only for the approved state."
  };
  const context = {
    project_id: input.project_id,
    gate,
    subject_type: row ? "ManuscriptRevision" : "Gate",
    subject_id: row ? String(row.id) : `gate-${gate}`,
    exact_proposed_wording: gateWording[gate],
    original_text: String(payload.original_text ?? ""),
    selected_source_version: gate === "D" && Array.isArray(payload.source_artifact_ids) ? String(payload.source_artifact_ids[0] ?? "not-applicable") : (sourceIds.join(",") || "not-applicable"),
    open_finding_ids: openFindings,
    scientific_consequence: gateConsequence[gate],
    resulting_artifacts: gate === "E" ? ["clean DOCX", "redline DOCX", "release manifest"] : []
  };
  const requestedSchema = {
    type: "object",
    properties: {
      decision: {
        type: "string",
        title: "Decision",
        oneOf: [
          { const: "approved", title: "Approve", description: "Accept the exact proposed wording and consequence shown." },
          { const: "changes_requested", title: "Request changes", description: "Return this item for revision without approving it." },
          { const: "rejected", title: "Reject", description: "Reject this proposal." }
        ]
      },
      approver: { type: "string", title: "Approver name", minLength: 1 },
      rationale: { type: "string", title: "Decision rationale" }
    },
    required: ["decision", "approver", "rationale"],
    additionalProperties: false
  };
  const requestId = `interaction_${randomUUID()}`;
  db.prepare("INSERT INTO interaction_requests(id,project_id,kind,prompt,requested_schema,context,status,response,created_at,responded_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(requestId, input.project_id, "approval", `Gate ${gate} approval`, encode(requestedSchema), encode(context), "pending", null, now(), null);
  appendAudit(db, input.project_id, "approval.requested", actor, { request_id: requestId, gate, subject_id: context.subject_id });
  return getInteraction(db, requestId);
}

export function submitPreparedApproval(db: StudioDb, input: { request_id: string; decision: "approved" | "rejected" | "changes_requested"; approver: string; rationale: string }) {
  const request = getInteraction(db, input.request_id);
  if (request.kind !== "approval") throw new Error("Interaction is not an approval request");
  if (request.status !== "pending") throw new Error("Approval request has already been decided");
  if (!(["approved", "rejected", "changes_requested"] as const).includes(input.decision)) throw new Error("decision must be approved, rejected, or changes_requested");
  if (!input.approver.trim() || !input.rationale.trim()) throw new Error("Approver and rationale are required");
  const context = request.context as unknown as Omit<ApprovalInputType, "decision" | "approver" | "rationale">;
  const approval = recordApproval(db, { ...context, decision: input.decision, approver: input.approver, rationale: input.rationale });
  db.prepare("UPDATE interaction_requests SET status = 'answered', response = ?, responded_at = ? WHERE id = ?")
    .run(encode({ decision: input.decision, approver: input.approver, rationale: input.rationale, approval_id: (approval as Record<string, unknown>).id }), now(), input.request_id);
  return { request: getInteraction(db, input.request_id), approval };
}
