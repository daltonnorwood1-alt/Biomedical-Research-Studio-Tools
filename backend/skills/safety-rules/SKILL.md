---
name: safety-rules
description: Apply the versioned Biomedical Research Studio safety policy library to AI-generated, human-authored, or hybrid biomedical content.
---

# Safety Rules

Load `shared/policies/safety-rules.json` and apply every rule relevant to the bounded scope. Do not treat polished language as evidence. For each applied rule return: name and ID; compliance summary; exact violations or risks with passage/claim, type, severity, and impact; required remediation; limitations; and `PASS`, `CONDITIONAL PASS`, or `FAIL`.

A `FAIL` blocks publication-ready output. Remediation must not introduce unsupported claims, citations, or analyses. A fabricated or misattributed citation, critical statistical misunderstanding, critical causal overreach, critical clinical overinterpretation, or other critical misinformation requires human review.

Read [the governance contract](../../docs/skill-governance.md).
