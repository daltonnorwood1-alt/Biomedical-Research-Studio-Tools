import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import PizZip from "pizzip";
import type { StudioDb } from "./db.js";
import { SCHEMA_VERSION, type ApprovalInputType, type FindingInputType, type ProjectInputType, type RevisionInputType, type TaskInputType } from "../shared/schemas/contracts.js";

const now = () => new Date().toISOString();
const encode = (value: unknown) => JSON.stringify(value);
const decode = <T>(value: unknown): T => JSON.parse(String(value)) as T;
const id = (prefix: string) => `${prefix}_${randomUUID()}`;

export function stableFindingId(projectId: string, ruleId: string, locations: string[], observed: string): string {
  const normalized = JSON.stringify({ projectId, ruleId, locations: [...locations].sort(), observed: observed.trim() });
  return `finding_${createHash("sha256").update(normalized).digest("hex").slice(0, 20)}`;
}

export function appendAudit(db: StudioDb, projectId: string | null, eventType: string, actor: string, payload: unknown): void {
  const previous = db.prepare("SELECT event_hash FROM audit_log ORDER BY sequence DESC LIMIT 1").get() as { event_hash?: string } | undefined;
  const at = now();
  const eventId = id("evt");
  const body = encode(payload);
  const eventHash = createHash("sha256").update(`${previous?.event_hash ?? "GENESIS"}|${eventId}|${projectId ?? ""}|${eventType}|${actor}|${at}|${body}`).digest("hex");
  db.prepare("INSERT INTO audit_log(event_id, project_id, event_type, actor, at, payload, previous_hash, event_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(eventId, projectId, eventType, actor, at, body, previous?.event_hash ?? null, eventHash);
}

export function createProject(db: StudioDb, input: ProjectInputType, actor = "Dalton Norwood") {
  const projectId = id("project");
  const createdAt = now();
  db.prepare(`INSERT INTO projects(id,title,project_type,article_type,study_design,target_journal,author_role,sensitivity,phase,risk_state,release_state,schema_version,created_at,created_by,source_artifact_ids,status,confidence,human_review_required)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      projectId, input.title, input.project_type, input.article_type, input.study_design ?? null,
      input.target_journal ?? null, input.author_role ?? null, input.sensitivity ?? "sensitive",
      "intake", "not-assessed", "blocked", SCHEMA_VERSION, createdAt, actor, "[]", "in_review", "not-assessed", 1
    );
  for (const gate of ["A", "B", "C", "D", "E"]) {
    createRecord(db, projectId, "ChecklistItem", { gate, label: ({A:"Scope",B:"Evidence",C:"Audit",D:"Revision",E:"Release"} as Record<string,string>)[gate], gate_status: gate === "A" ? "in_review" : "not_started" }, actor, [], "in_review", true);
  }
  appendAudit(db, projectId, "project.created", actor, input);
  return getProject(db, projectId);
}

export function getProject(db: StudioDb, projectId: string) {
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
}

export function listProjects(db: StudioDb) {
  return db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
}

export function createRecord(db: StudioDb, projectId: string, recordType: string, payload: unknown, actor: string, sourceIds: string[], status = "in_review", review = true, recordId?: string) {
  const record = {
    id: recordId ?? id(recordType.toLowerCase()), project_id: projectId, record_type: recordType,
    payload, schema_version: SCHEMA_VERSION, created_at: now(), created_by: actor,
    source_artifact_ids: sourceIds, status, confidence: "not-assessed", human_review_required: review
  };
  db.prepare("INSERT INTO records(id,project_id,record_type,payload,schema_version,created_at,created_by,source_artifact_ids,status,confidence,human_review_required) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(record.id, projectId, recordType, encode(payload), record.schema_version, record.created_at, actor, encode(sourceIds), status, record.confidence, review ? 1 : 0);
  appendAudit(db, projectId, `${recordType}.created`, actor, { id: record.id, sourceIds });
  return record;
}

export function listRecords(db: StudioDb, projectId: string, recordType?: string): Array<Record<string, unknown>> {
  const rows = recordType
    ? db.prepare("SELECT * FROM records WHERE project_id = ? AND record_type = ? ORDER BY created_at DESC").all(projectId, recordType)
    : db.prepare("SELECT * FROM records WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return { ...r, id: String(r.id), payload: decode(r.payload), source_artifact_ids: decode(r.source_artifact_ids), human_review_required: Boolean(r.human_review_required) };
  });
}

const directIdentifierPatterns = [
  { type: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "phone", regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { type: "mrn", regex: /\b(?:MRN|medical record(?: number)?)\s*[:#-]?\s*[A-Z0-9-]{5,}\b/gi }
];

export function detectDirectIdentifiers(buffer: Buffer): string[] {
  let sample = buffer.subarray(0, Math.min(buffer.length, 2_000_000)).toString("utf8");
  let ooxmlTextOverLimit = false;
  if (buffer.subarray(0, 2).toString("binary") === "PK") {
    try {
      const zip = new PizZip(buffer);
      let collected = "";
      for (const name of Object.keys(zip.files).filter((candidate) => /^word\/(?:document|comments|footnotes|endnotes|header\d+|footer\d+)\.xml$/i.test(candidate))) {
        const entry = zip.file(name);
        const declaredSize = Number((entry as unknown as { _data?: { uncompressedSize?: number } } | null)?._data?.uncompressedSize ?? 0);
        if (declaredSize > 2_000_000 || collected.length + declaredSize > 2_000_000) { ooxmlTextOverLimit = true; continue; }
        collected += ` ${entry?.asText() ?? ""}`;
        if (collected.length > 2_000_000) { ooxmlTextOverLimit = true; collected = collected.slice(0, 2_000_000); break; }
      }
      sample = collected.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    } catch {
      // Malformed or non-OOXML ZIP inputs continue through the conservative raw-byte screen.
    }
  }
  const findings = directIdentifierPatterns.filter(({ regex }) => { regex.lastIndex = 0; return regex.test(sample); }).map(({ type }) => type);
  if (ooxmlTextOverLimit) findings.push("ooxml-text-over-limit");
  return findings;
}

export function ingestSource(db: StudioDb, dataRoot: string, projectId: string, name: string, mime: string, bytes: Buffer, actor = "Dalton Norwood") {
  if (!getProject(db, projectId)) throw new Error("Project not found");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = db.prepare("SELECT * FROM source_artifacts WHERE project_id = ? AND sha256 = ?").get(projectId, sha256);
  if (existing) return existing;
  const findings = detectDirectIdentifiers(bytes);
  const sourceId = id("source");
  const projectRoot = join(dataRoot, projectId);
  const directory = findings.length ? join(projectRoot, "sources", "quarantine") : join(projectRoot, "sources", "original");
  mkdirSync(directory, { recursive: true });
  const safeName = basename(name).replace(/[^A-Za-z0-9._-]/g, "_");
  const tempPath = join(directory, `.${sourceId}.uploading`);
  const immutablePath = join(directory, `${sourceId}-${safeName}`);
  writeFileSync(tempPath, bytes, { flag: "wx", mode: 0o600 });
  renameSync(tempPath, immutablePath);
  const createdAt = now();
  const status = findings.length ? "quarantined" : "inventoried";
  db.prepare(`INSERT INTO source_artifacts(id,project_id,original_name,immutable_path,mime_type,sha256,byte_size,sensitivity_classification,processing_status,version_of,source_location,identifier_findings,schema_version,created_at,created_by,source_artifact_ids,status,confidence,human_review_required)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      sourceId, projectId, name, immutablePath, mime || "application/octet-stream", sha256, bytes.length,
      findings.length ? "restricted" : "unclassified", status, null, "upload", encode(findings), SCHEMA_VERSION,
      createdAt, actor, encode([]), status, findings.length ? "high" : "not-assessed", findings.length ? 1 : 0
    );
  if (findings.length) {
    createFinding(db, { project_id: projectId, source_artifact_ids: [sourceId], rule_id: "PRIVACY-DIRECT-IDENTIFIER", severity: "critical", confidence: "high", audit_status: "confirmed discrepancy", source_locations: [name], observed: `Direct identifier classes detected: ${findings.join(", ")}`, comparator: "Only deidentified materials may proceed to specialist workflows.", reproducible_evidence: "Deterministic local pattern screening; identifier values are not retained in the finding.", scientific_consequence: "Downstream processing is blocked to minimize sensitive-data exposure.", recommendation: "Provide a deidentified replacement or record an authorized privacy disposition.", safety_verdict: "FAIL" }, actor);
  }
  appendAudit(db, projectId, "source.ingested", actor, { sourceId, sha256, status, findings });
  return db.prepare("SELECT * FROM source_artifacts WHERE id = ?").get(sourceId);
}

export function listSources(db: StudioDb, projectId: string) {
  return db.prepare("SELECT id,project_id,original_name,mime_type,sha256,byte_size,sensitivity_classification,processing_status,version_of,source_location,identifier_findings,schema_version,created_at,created_by,status,confidence,human_review_required FROM source_artifacts WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map((row) => ({ ...(row as object), identifier_findings: decode((row as Record<string,unknown>).identifier_findings), human_review_required: Boolean((row as Record<string,unknown>).human_review_required) }));
}

export function createTask(db: StudioDb, input: TaskInputType, actor = "Senior Investigator") {
  return createRecord(db, input.project_id, "Task", input, actor, [], input.category === "blocked" ? "blocked" : "not_started", input.approval_required);
}

export function createRevision(db: StudioDb, input: RevisionInputType, actor = "Senior Investigator") {
  return createRecord(db, input.project_id, "ManuscriptRevision", input, actor, input.source_artifact_ids, "awaiting_input", true);
}

export function createFinding(db: StudioDb, input: FindingInputType, actor = "Specialist workflow") {
  const findingId = stableFindingId(input.project_id, input.rule_id, input.source_locations, input.observed);
  const existing = db.prepare("SELECT id FROM records WHERE id = ?").get(findingId);
  if (existing) return listRecords(db, input.project_id).find((record) => record.id === findingId);
  return createRecord(db, input.project_id, "Finding", input, actor, input.source_artifact_ids, input.audit_status, true, findingId);
}

export function recordApproval(db: StudioDb, input: ApprovalInputType, actor = input.approver) {
  if (!getProject(db, input.project_id)) throw new Error("Project not found");
  if (!(["A", "B", "C", "D", "E"] as const).includes(input.gate)) throw new Error("Invalid approval gate");
  if (!(["approved", "rejected", "changes_requested"] as const).includes(input.decision)) throw new Error("Invalid approval decision");
  if (!input.approver?.trim() || !input.rationale?.trim()) throw new Error("Approver and rationale are required");
  if (!input.subject_id?.trim() || !input.subject_type?.trim()) throw new Error("Approval subject is required");
  if (!input.exact_proposed_wording?.trim()) throw new Error("Exact proposed wording is required");
  const approvalId = id("approval");
  const createdAt = now();
  db.prepare(`INSERT INTO approvals(id,project_id,gate,subject_type,subject_id,decision,exact_proposed_wording,selected_source_version,open_finding_ids,scientific_consequence,resulting_artifacts,approver,rationale,schema_version,created_at,created_by,source_artifact_ids,status,confidence,human_review_required)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      approvalId, input.project_id, input.gate, input.subject_type, input.subject_id, input.decision,
      input.exact_proposed_wording, input.selected_source_version, encode(input.open_finding_ids), input.scientific_consequence,
      encode(input.resulting_artifacts), input.approver, input.rationale, SCHEMA_VERSION, createdAt, actor,
      encode([]), input.decision, "high", 0
    );
  appendAudit(db, input.project_id, "approval.recorded", actor, { approvalId, gate: input.gate, decision: input.decision, subjectId: input.subject_id });
  return db.prepare("SELECT * FROM approvals WHERE id = ?").get(approvalId);
}

export function listApprovals(db: StudioDb, projectId: string) {
  return db.prepare("SELECT * FROM approvals WHERE project_id = ? ORDER BY created_at DESC, rowid DESC").all(projectId).map((row) => {
    const r = row as Record<string,unknown>;
    return { ...r, open_finding_ids: decode(r.open_finding_ids), resulting_artifacts: decode(r.resulting_artifacts) };
  });
}

export function releaseAssessment(db: StudioDb, projectId: string, revisionId?: string) {
  if (!getProject(db, projectId)) throw new Error("Project not found");
  const approvals = listApprovals(db, projectId) as Array<Record<string, unknown>>;
  const latestGate = new Map<string, string>();
  for (const approval of approvals) if (!latestGate.has(String(approval.gate))) latestGate.set(String(approval.gate), String(approval.decision));
  const missingGates = ["A", "B", "C", "D", "E"].filter((gate) => latestGate.get(gate) !== "approved");
  const findings = listRecords(db, projectId, "Finding") as Array<Record<string, unknown>>;
  const blockingFindings = findings.filter((finding) => {
    const payload = finding.payload as Record<string, unknown>;
    const unresolved = payload.audit_status !== "consistent" && finding.status !== "resolved" && finding.status !== "superseded";
    return payload.safety_verdict === "FAIL" || (unresolved && (payload.severity === "critical" || payload.severity === "major"));
  });
  const revisionApproved = !revisionId || approvals.some((approval) => approval.gate === "D" && approval.subject_id === revisionId && approval.decision === "approved");
  return {
    releasable: missingGates.length === 0 && blockingFindings.length === 0 && revisionApproved,
    missing_gates: missingGates,
    blocking_finding_ids: blockingFindings.map((finding) => finding.id),
    revision_approved: revisionApproved
  };
}

export function getDashboard(db: StudioDb, projectId: string) {
  const project = getProject(db, projectId);
  if (!project) throw new Error("Project not found");
  const sources = listSources(db, projectId);
  const tasks = listRecords(db, projectId, "Task");
  const findings = listRecords(db, projectId, "Finding");
  const approvals = listApprovals(db, projectId);
  const artifacts = listRecords(db, projectId, "ArtifactManifest");
  const pendingApprovals = (listRecords(db, projectId, "ManuscriptRevision") as Array<Record<string,unknown>>).filter((revision) => !approvals.some((approval) => (approval as Record<string,unknown>).subject_id === revision.id && (approval as Record<string,unknown>).decision === "approved"));
  return { project, sources, tasks, findings, approvals, artifacts, pending_approvals: pendingApprovals, release: releaseAssessment(db, projectId) };
}
