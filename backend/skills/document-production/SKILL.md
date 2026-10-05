---
name: document-production
description: Produce approved clean and authentic tracked-change Word documents, response letters, checklists, and manifests after all release gates pass.
---

# Document Production

This is the only workflow authorized to emit final deliverables. Accept only immutable source versions and exact approved revision records. Confirm gates A–E, no unresolved blocking finding, and gate D approval for every revision.

For tracked changes use genuine WordprocessingML `w:ins` and `w:del` with unique IDs, ISO 8601 UTC dates, and `w:author="Dalton Norwood"`. Preserve unchanged content, styles, sections, tables, figures, captions, headers/footers, footnotes, citations, and existing revisions as far as source structure permits. Never simulate revisions with color, highlighting, strikeout, or comments. Never accept or flatten existing revisions without express approval.

If a construct cannot be revised reliably, stop; only produce an approved clean copy accompanied by a limitation and proposed-revision report. Inspect OOXML structure and render visually with a Word-compatible renderer. Map every revision and output hash into the artifact manifest.

Before any source-DOCX round-trip attempt, run `brs_inspect_docx_compatibility`. Block editing when macros, digital signatures, ActiveX, embedded OLE objects, or altChunk content are present. Comments, tracked changes, and media require explicit review of the reported source version.

Read [the governance contract](../../docs/skill-governance.md).
