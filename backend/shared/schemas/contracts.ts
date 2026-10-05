import { Type, type Static } from "@sinclair/typebox";

export const SCHEMA_VERSION = "1.0.0" as const;

export const EvidenceStatus = Type.Union([
  Type.Literal("confirmed"),
  Type.Literal("author-provided-unverified"),
  Type.Literal("plausible-unverified"),
  Type.Literal("unsupported"),
  Type.Literal("conflicted")
]);

export const AuditStatus = Type.Union([
  Type.Literal("confirmed discrepancy"),
  Type.Literal("probable discrepancy"),
  Type.Literal("needs clarification"),
  Type.Literal("consistent"),
  Type.Literal("not assessable")
]);

export const GateStatus = Type.Union([
  Type.Literal("not_started"),
  Type.Literal("awaiting_input"),
  Type.Literal("in_review"),
  Type.Literal("blocked"),
  Type.Literal("approved"),
  Type.Literal("rejected"),
  Type.Literal("superseded")
]);

export const Confidence = Type.Union([
  Type.Literal("high"), Type.Literal("moderate"), Type.Literal("low"), Type.Literal("not-assessed")
]);

export const CommonRecord = Type.Object({
  id: Type.String({ minLength: 1 }),
  project_id: Type.String({ minLength: 1 }),
  schema_version: Type.Literal(SCHEMA_VERSION),
  created_at: Type.String({ format: "date-time" }),
  created_by: Type.String({ minLength: 1 }),
  source_artifact_ids: Type.Array(Type.String()),
  status: Type.String({ minLength: 1 }),
  confidence: Confidence,
  human_review_required: Type.Boolean()
});

export const ProjectInput = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  project_type: Type.String({ minLength: 1 }),
  article_type: Type.String({ minLength: 1 }),
  study_design: Type.Optional(Type.String()),
  target_journal: Type.Optional(Type.String()),
  author_role: Type.Optional(Type.String()),
  sensitivity: Type.Optional(Type.Union([
    Type.Literal("public"), Type.Literal("internal"), Type.Literal("sensitive"), Type.Literal("restricted")
  ]))
});

export const TaskInput = Type.Object({
  project_id: Type.String(),
  title: Type.String({ minLength: 1 }),
  category: Type.Union([Type.Literal("recommended"), Type.Literal("optional"), Type.Literal("blocked"), Type.Literal("complete")]),
  prerequisites: Type.Array(Type.String()),
  expected_artifact: Type.String(),
  risk: Type.Union([Type.Literal("low"), Type.Literal("moderate"), Type.Literal("high")]),
  approval_required: Type.Boolean(),
  scope: Type.String(),
  stop_condition: Type.String()
});

export const ApprovalInput = Type.Object({
  project_id: Type.String(),
  gate: Type.Union([Type.Literal("A"), Type.Literal("B"), Type.Literal("C"), Type.Literal("D"), Type.Literal("E")]),
  subject_type: Type.String(),
  subject_id: Type.String(),
  decision: Type.Union([Type.Literal("approved"), Type.Literal("rejected"), Type.Literal("changes_requested")]),
  exact_proposed_wording: Type.String(),
  selected_source_version: Type.String(),
  open_finding_ids: Type.Array(Type.String()),
  scientific_consequence: Type.String(),
  resulting_artifacts: Type.Array(Type.String()),
  approver: Type.String({ minLength: 1 }),
  rationale: Type.String()
});

export const RevisionInput = Type.Object({
  project_id: Type.String(),
  source_artifact_ids: Type.Array(Type.String(), { minItems: 1 }),
  section: Type.String(),
  original_text: Type.String(),
  proposed_text: Type.String(),
  rationale: Type.String(),
  substantive_domains: Type.Array(Type.Union([
    Type.Literal("methods"), Type.Literal("results"), Type.Literal("conclusions"),
    Type.Literal("statistics"), Type.Literal("causal-language"), Type.Literal("clinical-implications"),
    Type.Literal("declarations"), Type.Literal("reviewer-response"), Type.Literal("citations"), Type.Literal("editorial")
  ]), { minItems: 1 })
});

export const FindingInput = Type.Object({
  project_id: Type.String(),
  source_artifact_ids: Type.Array(Type.String()),
  rule_id: Type.String(),
  severity: Type.Union([Type.Literal("critical"), Type.Literal("major"), Type.Literal("minor"), Type.Literal("note")]),
  confidence: Type.Union([Type.Literal("high"), Type.Literal("moderate"), Type.Literal("low")]),
  audit_status: AuditStatus,
  source_locations: Type.Array(Type.String()),
  observed: Type.String(),
  comparator: Type.String(),
  reproducible_evidence: Type.String(),
  scientific_consequence: Type.String(),
  recommendation: Type.String(),
  safety_verdict: Type.Optional(Type.Union([Type.Literal("PASS"), Type.Literal("CONDITIONAL PASS"), Type.Literal("FAIL")]))
});

export type ProjectInputType = Static<typeof ProjectInput>;
export type TaskInputType = Static<typeof TaskInput>;
export type ApprovalInputType = Static<typeof ApprovalInput>;
export type RevisionInputType = Static<typeof RevisionInput>;
export type FindingInputType = Static<typeof FindingInput>;

export const ALL_RECORD_TYPES = [
  "Project", "SourceArtifact", "EvidenceClaim", "CitationRecord", "CitationVerification",
  "ManuscriptSection", "ManuscriptRevision", "Finding", "ReviewComment", "ReviewerResponse",
  "ChecklistItem", "JournalRequirement", "Task", "ApprovalRequest", "ArtifactManifest"
] as const;
