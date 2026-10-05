# Biomedical Research Studio

Biomedical Research Studio is a local-first, human-governed system for biomedical manuscript drafting, revision, peer-review response, integrity review, literature evidence synthesis, and controlled Word delivery. One Senior Investigator workflow coordinates bounded specialists. Evidence, safety findings, scientific revisions, and release decisions remain visible and approval-gated.

## Current release

Version `0.4.1` is a portable, skills-first ChatGPT plugin suite with a coordinated set of biomedical research workflows and embedded MCP Apps interfaces. It includes guided onboarding, selectable forms, inline review and approval cards, a two-panel audit view, an evidence workspace, PubMed search provenance, a safe Google Scholar handoff, exact claim-to-source passage records, citation-health checks, EndNote XML synchronization, and DOCX compatibility preflight. The browser application remains an optional local companion prototype rather than the primary interface.

The optional companion prototype supports local project creation, immutable hashed upload intake, direct-identifier quarantine, a durable SQLite ledger, bounded task/revision/finding records, append-only approvals, release blocking, an accessible browser workspace, deterministic safety checks, and clean plus genuine tracked-change DOCX production for approved text revisions.

It does **not** yet preserve every arbitrary construct from an uploaded DOCX. The current document engine creates a new governed OOXML package for an approved revision; the v0.4 line adds preflight classification and blocks macros, signatures, ActiveX, embedded OLE objects, and altChunk content from round-trip editing. PDF claim extraction, complete full-text retrieval, automated Google Scholar ingestion, and arbitrary complex-DOCX round trips remain later work.

Version 0.4.1 adds current MCP 2.0 (`2026-07-28`) discovery and list envelopes while retaining the `2025-06-18` compatibility handshake. The official MCP Inspector reports zero strict schema errors and zero warnings across all 27 tools, and recognizes six MCP App UI tools.

## Install and run

Requirements: Node.js 22 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4317`. The server binds to loopback by default.

The local plugin MCP configuration uses `http://127.0.0.1:4317/mcp`, so start the server before connecting the plugin in ChatGPT developer mode. A public release must replace the loopback endpoint with its deployed HTTPS `/mcp` URL and add production OAuth at the hosting boundary. See [public deployment](./docs/public-deployment.md) and [plugin UI packaging](./docs/plugin-ui-packaging.md).

For the exact personal installation, Secure MCP Tunnel, and acceptance-test sequence, see [ChatGPT installation](./docs/chatgpt-install.md).

To use another local data directory:

```bash
BRS_DATA_ROOT=/absolute/private/path pnpm dev
```

## Operating lifecycle

1. Create a project and upload a proposal or protocol if available, followed by the manuscript, registration, analysis plan, dictionary, outputs, tables, figures, supplements, journal instructions, reference library, and peer-review report.
2. Resolve direct-identifier quarantine before specialist processing.
3. Confirm the source hierarchy, extracted scope, reporting guideline, and bounded task plan (Gate A).
4. Approve the evidence basis and explicit limitations (Gate B).
5. Review safety, integrity, statistics, citation, privacy, and consistency findings; select remediation (Gate C).
6. Approve exact manuscript or reviewer-response wording (Gate D).
7. Review final checks, manifest, and open limitations; approve release (Gate E).
8. Document Production emits the clean and tracked-change DOCX plus provenance manifest.

No UI action bypasses the same server-side release assessment.

## Privacy boundary

- Source bytes and project state remain under `BRS_DATA_ROOT`.
- Originals are stored by generated artifact ID and SHA-256 and are never overwritten.
- A deterministic local screen detects common email, phone, Social Security number, and medical-record-number patterns. Flagged files enter `sources/quarantine` and generate a blocking finding.
- The detector is deliberately conservative and is not proof of deidentification. Human privacy review remains required.
- PubMed searches and DOI health checks are explicit, dated, and recorded. Query strings are screened for common direct identifiers before they leave the server.
- Google Scholar is a user-opened search handoff only; the suite does not scrape or silently persist Scholar result pages.
- Public hosting must use per-user OAuth and tenant/project authorization. Do not expose the local unauthenticated server directly to the internet.

## Architecture

- `server/`: Fastify API, additive SQLite migrations, governed services, literature/reference connectors, deterministic review checks, and OOXML production.
- `app/`: semantic, keyboard-accessible local browser interface.
- `shared/schemas/`: versioned contracts and controlled vocabulary.
- `shared/policies/`: safety and state-transition policy.
- `skills/`: Senior Investigator plus bounded specialist Codex skills.
- `tests/`: safety, privacy, provenance, release, and OOXML invariants.

See [BUILD_PLAN.md](./BUILD_PLAN.md), [REPOSITORY_MAP.md](./REPOSITORY_MAP.md), and [docs/architecture.md](./docs/architecture.md).

## Test and verification

```bash
pnpm build
pnpm test
pnpm test:a11y
```

The core suite covers fabricated/unverified citation handling, metadata versus claim support, clinical/statistical significance, causal overreach, table-text mismatch, identifier quarantine, stable claim IDs, exact evidence passages, retraction signals, EndNote deduplication, DOCX preflight, approval blocking, safety blocking, authentic tracked changes, and manifest inputs.

## Source packages

The specification names three archives, now recorded in [the import manifest](./imported-sources/manifest.json):

- `research-manuscript-writer (1).zip`
- `research-manuscript-writer (2).zip`
- `audit-medical-data.zip`

The originals remain unchanged in `/Users/norwood/Downloads`. The two writer archives contain identical payload entries and are adapted once. The audit checklist, schema, icon, skill metadata, and hardened deterministic interface builder are integrated under the governed Studio skill. See [the source map](./docs/source-package-map.md), [writer adaptation](./docs/writer-source-adaptation.md), and [audit adaptation](./docs/audit-source-adaptation.md).

## Release procedure

1. Confirm the selected immutable source version and approved revision IDs.
2. Confirm gates A–E and no unresolved safety `FAIL`, privacy quarantine, or critical/major finding.
3. Run build, core tests, browser accessibility tests, OOXML inspection, and visual rendering.
4. Generate artifacts only through Document Production.
5. Verify output SHA-256 values and `w:author="Dalton Norwood"` mappings in the manifest.
6. Report any unsupported source construct or unverified external evidence as a limitation; never mask it with polished prose.

## License

Personal, private project. No redistribution license is granted.
