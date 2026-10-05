---
name: citation-verification
description: Verify biomedical citation identity, metadata, and direct claim support, keeping existence checks separate from evidentiary support.
---

# Citation Verification

Read [the governance contract](../../docs/skill-governance.md). Inventory in-text citations, bibliography entries, quotations, and implied attributions. Prefer PubMed for biomedical evidence; use authoritative sources appropriate to other claim types. Record retrieval date, source, normalized metadata, PMID/DOI, match confidence, linked claims, support status, discrepancies, access level, and limitations.

Verify existence and metadata separately from direct claim support. Distinguish metadata-only, abstract-level, and full-text review. Never fabricate or automatically replace a reference. Mark incomplete verification `[UNVERIFIED — REQUIRES MANUAL CHECK]`; it cannot support a substantive claim. Any addition, removal, substitution, or claim reassignment requires approval.

Use `brs_search_pubmed` for dated PubMed discovery. Use `brs_create_google_scholar_search` only as a user-opened discovery handoff; do not scrape Scholar. Record exact source wording with `brs_record_evidence_passage`, then use `brs_propose_claim_evidence_link`; proposals remain subject to Gate B. Use `brs_check_citation_health` for PubMed and Crossref update signals, and state that a clear check is not proof of validity.
