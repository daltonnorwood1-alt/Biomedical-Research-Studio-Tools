import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const migration = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, project_type TEXT NOT NULL, article_type TEXT NOT NULL,
  study_design TEXT, target_journal TEXT, author_role TEXT, sensitivity TEXT NOT NULL,
  phase TEXT NOT NULL, risk_state TEXT NOT NULL, release_state TEXT NOT NULL,
  schema_version TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  source_artifact_ids TEXT NOT NULL, status TEXT NOT NULL, confidence TEXT NOT NULL,
  human_review_required INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS source_artifacts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), original_name TEXT NOT NULL,
  immutable_path TEXT NOT NULL, mime_type TEXT NOT NULL, sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL,
  sensitivity_classification TEXT NOT NULL, processing_status TEXT NOT NULL, version_of TEXT,
  source_location TEXT, identifier_findings TEXT NOT NULL,
  schema_version TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  source_artifact_ids TEXT NOT NULL, status TEXT NOT NULL, confidence TEXT NOT NULL,
  human_review_required INTEGER NOT NULL, UNIQUE(project_id, sha256)
);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), record_type TEXT NOT NULL,
  payload TEXT NOT NULL, schema_version TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  source_artifact_ids TEXT NOT NULL, status TEXT NOT NULL, confidence TEXT NOT NULL,
  human_review_required INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_project_type ON records(project_id, record_type);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), gate TEXT NOT NULL,
  subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, decision TEXT NOT NULL,
  exact_proposed_wording TEXT NOT NULL, selected_source_version TEXT NOT NULL,
  open_finding_ids TEXT NOT NULL, scientific_consequence TEXT NOT NULL,
  resulting_artifacts TEXT NOT NULL, approver TEXT NOT NULL, rationale TEXT NOT NULL,
  schema_version TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  source_artifact_ids TEXT NOT NULL, status TEXT NOT NULL, confidence TEXT NOT NULL,
  human_review_required INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approvals_project_gate ON approvals(project_id, gate, created_at);
CREATE TABLE IF NOT EXISTS audit_log (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, project_id TEXT,
  event_type TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, payload TEXT NOT NULL, previous_hash TEXT,
  event_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS interaction_requests (
  id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), kind TEXT NOT NULL,
  prompt TEXT NOT NULL, requested_schema TEXT NOT NULL, context TEXT NOT NULL,
  status TEXT NOT NULL, response TEXT, created_at TEXT NOT NULL, responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_interactions_project_status ON interaction_requests(project_id, status, created_at);
CREATE TABLE IF NOT EXISTS extraction_runs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), source_artifact_id TEXT NOT NULL REFERENCES source_artifacts(id),
  extractor TEXT NOT NULL, extractor_version TEXT NOT NULL, status TEXT NOT NULL, document_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_extractions_project_source ON extraction_runs(project_id, source_artifact_id, created_at);
CREATE TABLE IF NOT EXISTS manuscript_claims (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), source_artifact_id TEXT NOT NULL REFERENCES source_artifacts(id),
  source_sha256 TEXT NOT NULL, location_json TEXT NOT NULL, claim_text TEXT NOT NULL, claim_type TEXT NOT NULL,
  claim_hash TEXT NOT NULL, evidence_status TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  UNIQUE(project_id, claim_hash)
);
CREATE INDEX IF NOT EXISTS idx_claims_project ON manuscript_claims(project_id, evidence_status, created_at);
CREATE TABLE IF NOT EXISTS literature_records (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), provider TEXT NOT NULL, provider_id TEXT NOT NULL,
  pmid TEXT, doi TEXT, title TEXT NOT NULL, abstract TEXT, metadata_json TEXT NOT NULL, source_url TEXT NOT NULL,
  access_level TEXT NOT NULL, retrieved_at TEXT NOT NULL, raw_sha256 TEXT NOT NULL, status TEXT NOT NULL,
  UNIQUE(project_id, provider, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_literature_project ON literature_records(project_id, retrieved_at);
CREATE TABLE IF NOT EXISTS search_runs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), provider TEXT NOT NULL, query TEXT NOT NULL,
  filters_json TEXT NOT NULL, retrieved_at TEXT NOT NULL, result_count INTEGER NOT NULL, result_ids_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_passages (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), literature_record_id TEXT NOT NULL REFERENCES literature_records(id),
  passage_text TEXT NOT NULL, location_json TEXT NOT NULL, source_hash TEXT NOT NULL, support_status TEXT NOT NULL,
  verification_status TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_passages_project_record ON evidence_passages(project_id, literature_record_id);
CREATE TABLE IF NOT EXISTS claim_evidence_links (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), claim_id TEXT NOT NULL REFERENCES manuscript_claims(id),
  passage_id TEXT NOT NULL REFERENCES evidence_passages(id), relation TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, created_by TEXT NOT NULL, UNIQUE(claim_id, passage_id)
);
CREATE TABLE IF NOT EXISTS citation_health_checks (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), literature_record_id TEXT NOT NULL REFERENCES literature_records(id),
  provider TEXT NOT NULL, checked_at TEXT NOT NULL, status TEXT NOT NULL, update_type TEXT NOT NULL,
  details_json TEXT NOT NULL, human_review_required INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_citation_health_project ON citation_health_checks(project_id, checked_at);
CREATE TABLE IF NOT EXISTS reference_records (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), endnote_key TEXT, doi TEXT, pmid TEXT, title TEXT NOT NULL,
  year TEXT, authors_json TEXT NOT NULL, record_json TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  UNIQUE(project_id, id)
);
CREATE INDEX IF NOT EXISTS idx_references_project ON reference_records(project_id, created_at);
CREATE TABLE IF NOT EXISTS document_compatibility_reports (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), source_artifact_id TEXT NOT NULL REFERENCES source_artifacts(id),
  classification TEXT NOT NULL, findings_json TEXT NOT NULL, supported_features_json TEXT NOT NULL,
  blocked_features_json TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL
);
`;

export function openDatabase(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(migration);
  return db;
}

export type StudioDb = DatabaseSync;
