# Medical Data Integrity Audit Source Adaptation

## Source

- Archive: `/Users/norwood/Downloads/audit-medical-data.zip`
- SHA-256: `ed18e784b35534ed8140a725bc7a21d6ab3a974cb977671b5c185ad251a3ff7d`
- Original plugin: `medical-data-integrity-reviewer` version `2.0.0+codex.20260805044209`
- Handling: inspected as untrusted evidence; original archive remains unchanged.

Archive validation found seven ordinary files, no absolute or parent-traversal paths, no symbolic links, no nested archives, no duplicate or case-colliding entries, no encryption, and no suspicious command/network execution constructs.

## Mapping

| Source | Integrated destination | Adaptation |
| --- | --- | --- |
| `skills/audit-medical-data/SKILL.md` | `skills/medical-data-integrity-audit/SKILL.md` | Kept the publication-grade review workflow while making Studio governance, A–E approvals, and Document Production authoritative. |
| `references/audit-checklist.md` | Same skill references | Preserved design-specific data, table, figure, methods-fit, reconciliation, and severity checks. |
| `references/review-schema.md` | Same skill references | Preserved the version 2 two-panel review contract; artifact verdict remains separate from safety/release verdict. |
| `scripts/build_review_interface.py` | Same skill scripts | Preserved the deterministic portable HTML renderer and added project-root containment, size/row limits, active-SVG rejection, output symlink rejection, and restrictive CSP. |
| `assets/icon.svg` | Same skill assets | Preserved as skill presentation metadata; not treated as review evidence. |
| `agents/openai.yaml` | Same skill agents | Adapted the display name and invocation prompt to the integrated governed skill. |

## Deliberate differences

- The archive accepted arbitrary filesystem image and output paths. The integrated builder requires `--allowed-root` and confines review JSON, images, and HTML output to that project artifact tree.
- The archive embedded SVG. The integrated builder rejects SVG because active SVG content is unsuitable for an evidence artifact without sanitization or rasterization.
- The integrated builder caps review JSON at 5 MiB, images at 10 MiB, tables at 100 columns and 10,000 rows, and adds a restrictive Content Security Policy.
- Builder output is a sensitive derived artifact. It must be hashed, linked to source artifact IDs, and governed; it does not authorize manuscript revision or release.
- The archive's MIT declaration lacks a bundled `LICENSE` file. Licensing provenance remains unresolved for redistribution beyond this personal plugin.
