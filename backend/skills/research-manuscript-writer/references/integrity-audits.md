# Scientific-integrity audits

This reference supports studio gate C. Shared safety-rule verdicts and release blocking remain governed by the studio governance contract and `shared/policies/safety-rules.json`.

Apply all five audits at every drafting gate and during the final manuscript review. Keep findings outside the manuscript prose. Classify each material issue as minor, moderate, or critical and as low-, medium-, or high-impact. A critical finding requires explicit human expert review before the affected text is treated as publication-ready.

## SAF-FLUENCY-001: AI fluency is not correctness

Inventory major factual, numerical, methodological, and technical claims. Label each with the governance vocabulary: `confirmed`, `author-provided-unverified`, `plausible-unverified`, `unsupported`, or `conflicted`. Flag confident prose that exceeds the evidence. Remediate by verifying, qualifying, querying, or removing the claim. Do not let polished wording conceal missing information.

## SAF-CITATION-002: Citations must be verified

Inventory every in-text citation, reference, quotation, and implied attribution. Verify that the source exists, identifiers are accurate, and the source directly supports the attached claim without exaggeration. Treat fabricated or misattributed citations as critical. Never invent a replacement citation. If only an abstract or secondary report was checked, state that limitation.

## SAF-STATS-003: Statistics must be understood

Check that methods fit the design and data structure; interpretations match effect estimates, confidence intervals, p values, and model assumptions; denominators and uncertainty are clear; missing data, multiplicity, clustering, repeated measures, confounding, and model diagnostics are handled when relevant. Reject "trend toward significance," proof language, selective significance reporting, and non-significance framed as equivalence without an appropriate design and interval.

Do not introduce a new analysis merely to repair prose. Query the author or require statistical review when the necessary output is absent.

## SAF-CAUSAL-004: Association is not causation

Search for explicit and implicit causal verbs and intervention implications. For every causal-sounding claim, determine whether the design, identification assumptions, temporal structure, comparison, and analysis support it. Regression adjustment alone is not proof of causality. Replace unsupported causal wording with associational language, disclose confounding and bias, or require causal-inference review.

## SAF-CLIN-005: Clinical significance is not statistical significance

For statistically significant results, assess effect magnitude, precision, absolute as well as relative effects, patient relevance, harms, outcome validity, and known clinical thresholds or MCIDs. Do not infer patient benefit from p values or unvalidated surrogates. When clinical importance is unknown, say so and ask for the relevant threshold or expert judgment.

## Audit verdict

Return one audit verdict for the current section. This does not replace the studio's A–E approval state:

- `PASS`: evidence, reporting, and interpretation are appropriately aligned;
- `CONDITIONAL PASS`: specified sourcing, clarification, or correction remains;
- `FAIL`: fabricated support, major statistical misunderstanding, unsafe causal inference, or another critical integrity problem is present.

For each non-pass item, provide the exact passage or claim, the failure mode, severity/impact, and a concrete remediation action. State what could not be assessed with the provided information.
