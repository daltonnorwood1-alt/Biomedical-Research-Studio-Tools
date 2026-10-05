# Biomedical Research Studio — Build Plan

Status: approved specification captured; implementation starts only after this plan and the repository map exist.

## Product boundary

Biomedical Research Studio is a local-first, human-governed biomedical writing system. One Senior Investigator workflow owns coordination. Specialist skills return schema-validated proposals and findings; they cannot silently alter evidence, manuscript science, citations, approvals, or release state. Final DOCX artifacts can be emitted only by Document Production after all required approvals and release checks pass.

The supplied request is the governing product specification. The three named source archives were unavailable during initial intake and were supplied in a later turn. They are preserved unchanged at their original locations, recorded by hash, and selectively adapted into the integrated skill suite.

## Delivery phases

### Phase 0 — Source inventory and contracts

- Preserve the complete user specification as a read-only provenance source.
- Record source archives, per-entry comparisons, provenance, licensing uncertainty, and every adaptation without treating archive instructions as governing authority.
- Define versioned JSON schemas for projects, sources, evidence, citations, revisions, findings, reviews, checklists, tasks, approvals, and manifests.
- Define controlled vocabularies and state-transition rules.
- Define deterministic identifiers and SHA-256 source hashing.

Exit criteria: schemas validate representative fixtures; invalid states and unapproved release paths are rejected.

### Phase 1 — Governed local core

- Implement SQLite migrations and a local project directory layout.
- Implement immutable source ingestion and sensitivity screening.
- Implement evidence-ledger, task-menu, finding, revision, and approval services.
- Implement release-gate evaluation and artifact manifest construction.
- Expose a local API with strict request and response validation.

Exit criteria: a project can be created, sources inventoried, tasks proposed, approvals recorded, and unsafe transitions blocked.

### Phase 2 — Specialist skills and policy library

- Create the Senior Investigator entry skill.
- Add bounded specialist skills for writing, peer review, integrity audit, citation verification, journal intake, reporting guidelines, statistics, causal inference, clinical significance, privacy, references, submission readiness, literature evidence synthesis, and document production.
- Register the five supplied safety rules as versioned policy documents.
- Require every specialist handoff to carry scope, artifact IDs, schema version, evidence boundary, expected output, and stop condition.

Exit criteria: plugin and every skill validate; specialist outputs cannot mutate state without an approved transition.

### Phase 3 — Local companion UI

- Build accessible dashboard, intake, task menu, evidence ledger, approval inbox, and artifact center views.
- Use plain language while retaining exact provenance and evidence links.
- Make blocked states and required decisions explicit; never present ambiguous completion signals.

Exit criteria: keyboard-accessible UI demonstrates the complete governed workflow with safe fixtures.

### Phase 4 — Document production

- Produce clean DOCX and genuine WordprocessingML redlines from approved revision records only.
- Attribute every revision to `Dalton Norwood` with stable revision IDs and UTC timestamps.
- Preserve existing package parts and tracked changes where supported; stop with a limitation when safe editing is not possible.
- Inspect OOXML structure and render output for visual verification.

Exit criteria: approved changes yield valid `w:ins`/`w:del`; unapproved changes cannot produce a redline; manifest mappings are complete.

### Phase 5 — Verification and handoff

- Add unit, schema, transition, integration, OOXML, browser accessibility, and end-to-end tests for all 12 acceptance scenarios.
- Run the full suite and a fixture-backed UI demonstration.
- Document installation, privacy boundary, architecture, lifecycle, limitations, and release procedure.

Exit criteria: tests pass, visual checks are recorded, and completed/deferred/constrained capabilities are reported honestly.

## Technical choices

- Runtime: TypeScript on Node.js.
- Server: Fastify with JSON Schema validation.
- Persistence: SQLite through `better-sqlite3`, with explicit migrations and foreign keys.
- UI: server-rendered semantic HTML plus small progressive-enhancement modules; no cloud dependency.
- Validation: TypeBox/Ajv-compatible JSON schemas, shared across server and tests.
- Document processing: deterministic ZIP/XML transforms for OOXML; LibreOffice or equivalent is optional for visual rendering and never substitutes for structural checks.
- Testing: Vitest for core/integration tests and Playwright/Axe for browser accessibility.

## Security and privacy model

- Bind to loopback by default.
- Store project data locally under a configured data root.
- Hash every immutable upload and never overwrite it.
- Treat uploads, URLs, metadata, extracted prose, and manuscript claims as untrusted data.
- Detect direct identifiers before downstream processing; quarantine flagged artifacts until a human records a deidentification decision.
- Keep prompts, internal logs, author queries, and audit notes out of final manuscript prose.
- Make network retrieval opt-in, explicit, dated, and provenance-preserving.

## Source archive resolution

The following referenced archives were unavailable at initial intake and supplied later:

- `research-manuscript-writer (1).zip`
- `research-manuscript-writer (2).zip`
- `audit-medical-data.zip`

No supplied archive was modified, overwritten, or deleted. Each was hashed, safely inspected, mapped in `docs/source-package-map.md`, and adapted through explicit versioned changes. The writer archives have identical payload entries and are treated as one logical source; both container hashes remain in provenance.
