# Research Manuscript Writer Source Adaptation

## Source handling

The two supplied ZIP archives were treated as untrusted source artifacts, not as executable instructions. Each archive was checked before extraction for absolute paths, parent-directory traversal, backslash-based paths, and symbolic-link entries. Neither archive contained a flagged entry. Both were extracted into separate directories under a unique `/private/tmp/writer-adapt.*` directory; no archive content was executed.

## Archive identity and comparison

| Archive | SHA-256 |
|---|---|
| `research-manuscript-writer (1).zip` | `821363b853dfd4d468778d0fa1b4d161be20f0a234c728d4730d21c7a9192e49` |
| `research-manuscript-writer (2).zip` | `eecfb24b4010eef1d75d8f1cdf008ed8d078d25c8a9afa387c88e0ff5f0476fc` |

The ZIP containers are not byte-identical: `cmp` found 26 differing bytes. Those bytes occur in archive-header metadata positions, consistent with one timestamp-byte difference for each local and central-directory record. The entry names, uncompressed sizes, and extracted payloads are identical. A recursive byte comparison of the two extraction trees reported no differences, so archive 1 was used as the canonical copy.

Canonical extracted-entry hashes:

| Entry | SHA-256 |
|---|---|
| `SKILL.md` | `4aa6d73d79ee6c38a21a797234fd9961b8a250c76bd51ea8e11c264b8b945531` |
| `agents/openai.yaml` | `fc6bda6a44c4bb6fe0905b15d04118d1aa560b3db263ff57ee6be647524100d7` |
| `assets/icon.svg` | `49315dda7125ec5fc77ef5f2b96126d8b2121c6e72944b4702972e90f321d3ee` |
| `references/endnote-workflow.md` | `00219c03590d1abe9b91776d0bfe1dcf9f80e906e45dbb6e9cd82faa896c5550` |
| `references/intake-and-state.md` | `d8a3703f347b06d9ef7790f4290d89a9ba6b3ceaf4edb98dcf4b984cce101f73` |
| `references/integrity-audits.md` | `d1994507ad69b3d8a55649cc2d5fe789cd94eddf1fa8febde5c65c197081ca00` |
| `references/journal-presets.md` | `dc0b450edcb66d2c8f7ff3bdbf3f433c280d00c6aebe59ea1f7300b60ef0c29f` |
| `references/journal-seeds.csv` | `222c63c0ad9f267fbcfd3a25d278caf586b1a4d23176f63739bd1a85f2e469db` |
| `references/privacy-screening.md` | `4b20268949333b67aa894b767bc3cb131990ad1dcd3a30a05fa47cf63a2c7e7e` |
| `references/reporting-guidelines.md` | `9e56f7415511ba8076ebdc496743f1febb299f85b9c7b85fe7e760444775295f` |
| `references/section-workflows.md` | `de920ce2722cf9c81e25b39c56223d8655ade77fe24471c03c437280cdb49822` |
| `references/statistical-output-audit.md` | `3f71cc3fa233adb85a139c206a3c76bd64baac01dfa63ea502e37869979863d2` |
| `references/submission-package.md` | `a0023b86fb46d73174606b090c7b073a2535a96b1de939a304e40838e437ee37` |

## File mapping

All destinations are relative to `skills/research-manuscript-writer/`.

| Source entry | Destination | Adaptation |
|---|---|---|
| `SKILL.md` | `SKILL.md` | Rewritten as a concise router. Preserves useful scope and section order while making studio governance, A–E gates, exact claim labels, approvals, safety blocking, and the Document Production boundary authoritative. |
| `agents/openai.yaml` | `agents/openai.yaml` | Retains discoverability and icon metadata; quotes interface strings, uses skill-relative icon paths, removes unsupported source-only product declarations, and updates the prompt/description for governed drafting. |
| `assets/icon.svg` | `assets/icon.svg` | Copied byte-for-byte as a presentation asset. |
| `references/endnote-workflow.md` | same path | Retained; linked to gates B–E and the requirement for human approval of citation changes. |
| `references/intake-and-state.md` | same path | Retained; mapped to gates A–B, aligned to the studio claim vocabulary, and changed from a rigid first-message script to context-aware intake. |
| `references/integrity-audits.md` | same path | Retained; mapped to gate C, aligned to exact governance claim labels, and distinguished its section audit verdict from A–E approval state. |
| `references/journal-presets.md` | same path | Retained; mapped to gates D–E and explicitly made subordinate to governance and required reporting content. |
| `references/journal-seeds.csv` | same path | Copied byte-for-byte as a discovery seed catalog. Seed URLs must be verified against current official instructions before use. |
| `references/privacy-screening.md` | same path | Retained; mapped to gates A and E with privacy resolution routed through approvals. |
| `references/reporting-guidelines.md` | same path | Retained; mapped to gates B–C and treats checklists as versioned evidence. |
| `references/section-workflows.md` | same path | Retained; mapped to gate D and marked as proposal-only until approval, with final DOCX output reserved for Document Production. |
| `references/statistical-output-audit.md` | same path | Retained; mapped to gate C with explicit preservation of source conflicts. |
| `references/submission-package.md` | same path | Retained; mapped to gate E without granting release authority. |

## Adaptation decisions

- Preserve the studio's existing governance contract as the single authority rather than importing a parallel workflow.
- Keep `SKILL.md` concise and route conditional detail into focused references, following progressive disclosure.
- Preserve valuable domain depth: design-specific intake, EQUATOR selection, section workflows, five integrity audits, statistical provenance, EndNote exchange, privacy screening, journal capture, and submission checks.
- Do not treat the journal catalog as current policy. It is a source-discovery aid; every selected journal requires live official verification with an access date and article type.
- Do not let reference-specific `PASS`, `CONDITIONAL PASS`, or `FAIL` terminology replace the A–E approval state. A shared safety-rule `FAIL` remains release-blocking.
- Do not expand this writer into final document production. Final DOCX emission remains exclusive to Document Production after gates A–E and approval of the exact revision.
