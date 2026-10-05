# Source Package Intake and Adaptation Map

## Governing prompt

- Intake file: `Pasted text.txt`
- SHA-256: `047a9113b66a03633d89d4736e2e39255791bf2aec878edb3d774c42e57ae013`
- Size at intake: 102,281 bytes; 3,049 lines.
- Role: governing product specification and source for the five safety policies, manuscript-section workflows, full-manuscript review, and literature evidence synthesis behavior.

## Referenced archives

| Archive | Intake status | Required mapping when supplied |
| --- | --- | --- |
| `research-manuscript-writer (1).zip` | Adapted | Canonical logical payload: `SKILL.md`, references, journal seeds, icon, and `agents/openai.yaml` |
| `research-manuscript-writer (2).zip` | Duplicate recorded | All 13 payload entries match archive 1 by path, length, and SHA-256; container timestamps differ |
| `audit-medical-data.zip` | Adapted and hardened | Plugin manifest mapped; audit checklist, review schema, icon, metadata, and two-panel HTML builder integrated |

## Safe import procedure

1. Copy each archive unchanged into a read-only intake location outside the application runtime.
2. Record SHA-256, size, received date, and original filename.
3. Inspect archive entries for path traversal, symlinks, nested archives, and unexpected executable content before extraction.
4. Extract to a uniquely named staging directory without overwriting prior versions.
5. Compare writer archives by entry path and content hash.
6. Map useful material to the integrated package; do not copy conflicting state authority or uncontrolled agent behavior.
7. Record every adapted source file, destination, transformation, and unresolved difference.
8. Re-run plugin, skill, schema, integration, OOXML, visual, and accessibility verification.
