---
name: scholarly-retrieval
description: Run privacy-safe PubMed discovery and a user-opened Google Scholar handoff while preserving exact queries, retrieval dates, citation identity, and the boundary between finding a citation and verifying claim support.
---

# Scholarly Retrieval

Read [the governance contract](../../docs/skill-governance.md). Confirm the project and bounded evidence question before searching. Never place patient identifiers, unpublished row-level data, confidential reviewer text, or proprietary manuscript prose into an external query.

Use `brs_search_pubmed` for live biomedical discovery. Preserve the exact query, date, filters, PubMed identifiers, DOI when present, and source URL. Use `brs_create_google_scholar_search` only to give the user a search link; do not scrape or silently import Scholar results.

A retrieved citation is metadata-only. It cannot support a claim until an exact source passage and location are recorded with `brs_record_evidence_passage`, linked as a proposal, and reviewed under Gate B. Use `brs_check_citation_health` for update signals, but never describe a no-alert result as proof that a paper is valid.

End with a recommended next step: inspect the most relevant source and capture the exact supporting, contradicting, or contextualizing passage.
