# Architecture and Trust Boundaries

## Control flow

```text
Human author
   │ uploads, decisions, approvals
   ▼
Senior Investigator ── bounded handoff ──► Specialist workflow
   │                                         │ structured proposal only
   ├──► immutable source store               ▼
   ├──► evidence / findings ledger ◄──── validated handoff
   ├──► approval service
   └──► release assessment ── approved ──► Document Production
                                        └─► DOCX + manifest
```

The Senior Investigator is the sole coordinator, not a license to bypass human authority. The API is the only writer of governed state. Specialist skills cannot write final artifacts. Document Production cannot run until release assessment confirms all gates, absence of unresolved blocking findings, and approval of the exact revision.

## State model

Every governed record carries `id`, `project_id`, `schema_version`, `created_at`, `created_by`, `source_artifact_ids`, `status`, `confidence`, and `human_review_required`. Records are additive. Supersession is explicit; source bytes and approval decisions are never edited in place.

The audit log forms a SHA-256 hash chain across events. This is tamper-evident provenance, not a cryptographic identity or regulatory signature.

## Evidence model

- Metadata verification is separate from direct claim support.
- Author-provided material is not considered independently verified.
- Contradictions are linked and surfaced.
- Partial access is labeled metadata-only, abstract-level, or full-text.
- Unverified records cannot support substantive claims or release.

## Document model

The initial engine produces valid minimal OOXML packages and authentic revisions with `w:ins`, `w:del`, deterministic IDs, UTC timestamps, and `Dalton Norwood` attribution. It intentionally refuses to claim arbitrary uploaded-DOCX preservation. A future compatibility layer must inspect each source package, preserve unknown parts, and fail safely when a construct cannot be transformed without loss.

## Network boundary

The current application has no outbound literature or journal connectors. Future retrieval services must be opt-in per request, limit queries to required metadata or public documents, record exact source and date, and keep retrieved content in the evidence ledger as untrusted evidence.
