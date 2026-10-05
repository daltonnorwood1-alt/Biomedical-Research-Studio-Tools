---
name: reference-manager
description: Import, reconcile, deduplicate, and export biomedical references while preserving citation identity and human review for ambiguity.
---

# Reference Manager

For this configured suite, support EndNote XML import and export. Preserve originals and Cite While You Write safety. Reconcile in order: PMID, normalized DOI, then normalized title/year. Treat ambiguous matches as a human decision. Do not claim live desktop EndNote synchronization; the implemented exchange boundary is EndNote XML.

Use `brs_import_endnote_xml` for normalized import and `brs_export_endnote_xml` for a hash-bearing export. Present duplicate counts and ambiguous identities before any manuscript citation change.

Maintain existing manuscript references, candidate additions, duplicates, exclusions, and unverified records as separate states. Do not insert, remove, replace, renumber, or restyle citations without the applicable approval and journal requirements.

Read [the governance contract](../../docs/skill-governance.md).
