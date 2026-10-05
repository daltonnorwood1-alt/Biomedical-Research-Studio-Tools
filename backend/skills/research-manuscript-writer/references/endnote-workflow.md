# EndNote-compatible reference workflow

This reference supports citation work at studio gates B–E. Citation changes remain substantive changes requiring human approval under the governance contract.

Use this mode when the author supplies an EndNote export, asks to reconcile citations with an EndNote library, or wants a bibliography returned in an EndNote-compatible format.

## Connection boundary

Do not claim direct control of the EndNote desktop application or a live `.enl` library unless an actual connector is available. Prefer file exchange:

1. EndNote XML for the richest metadata;
2. RIS for broad compatibility;
3. BibTeX, CSV, or a formatted bibliography when those are the only exports available.

Ask the author for the export plus the manuscript. If record numbers, custom fields, groups, attachments, or Cite While You Write fields must survive, ask which elements are essential before transformation.

## Intake and reconciliation

Inventory each record using available identifiers and fields: EndNote record number, PMID, DOI, title, authors, year, journal, volume, issue, pages or article number, publication type, URL, abstract, and notes. Normalize text for matching without silently changing the displayed bibliographic record.

Reconcile in this order:

1. exact PMID;
2. exact DOI after normalization;
3. exact or near-exact title plus year and first author;
4. manual author confirmation for ambiguous records.

For every in-text citation and reference-list entry, assign one status: matched, missing from library, uncited library record, duplicate candidate, conflicting metadata, unverifiable, or excluded by the author's evidence rule. Never merge records or replace a citation solely because two titles look similar.

Verify biomedical records against PubMed when a PMID is claimed. Verify DOI resolution and claim support separately; bibliographic existence does not prove that a reference supports the manuscript statement.

## Cite While You Write safety

Treat Word documents containing live EndNote field codes as structured documents. Do not flatten, delete, or rewrite citation fields unintentionally. When safe field-aware editing is unavailable, edit surrounding prose and return a citation insertion/replacement map for the author to apply in EndNote. Ask whether the author uses formatted citations or temporary citations and which output style governs.

Do not hand-format a bibliography that the author intends EndNote to regenerate. Preserve stable record identifiers where the export format permits it.

## Outputs

Return, as requested:

- a citation-to-record reconciliation table;
- a duplicate/conflict report requiring author decisions;
- verified missing-reference queries;
- an RIS or EndNote XML exchange file when supported;
- a clean reference list only after the target journal style is confirmed;
- an audit log of added, removed, replaced, merged, and unresolved records.

Never fabricate missing metadata. Leave unavailable fields blank and flag them.
