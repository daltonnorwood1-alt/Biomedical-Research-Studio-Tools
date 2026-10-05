# Direct statistical-output audit

This reference supports studio gate C. Preserve source conflicts and use the governance claim labels; do not silently select the more plausible output.

Use this mode to trace manuscript claims back to actual statistical output. This is an audit, not a substitute for statistical analysis or expert review.

## Minimum inputs

Request the stable aims, Methods/statistical analysis plan, Results, tables and figures, plus the most direct available output. Common inputs include R console/model summaries, R Markdown or Quarto output, Stata logs, SAS output, SPSS exports, spreadsheets, delimited files, PDFs, Word documents, screenshots, and analysis code. Prefer aggregate model or table output over participant-level data.

If the only evidence is a screenshot or manually transcribed table, label provenance and transcription verification as limited. Do not infer values hidden by truncation or rounding.

## Provenance matrix

Build one row for every manuscript result:

| Claim ID | Manuscript location | Aim/outcome | Source file | Output object/table/model | Analysis population and n | Estimate | Interval/SE | p value | Units/scale | Adjustment/reference | Status | Issue |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

Statuses are verified, rounding-only difference, ambiguous, missing source, transcription mismatch, method mismatch, or critical discrepancy.

## Audit checks

Check, when applicable:

- analysis population, exclusions, group labels, denominators, events, person-time, and missingness;
- variable coding, units, transformations, contrasts, reference categories, outcome timepoints, and model direction;
- estimate type and scale, standard errors, confidence/credible intervals, test statistics, degrees of freedom, exact p values, and rounding;
- unadjusted versus adjusted models and the complete covariate set;
- clustering, repeated measures, survey weights, matching, stratification, imputation, censoring, competing risks, interactions, nonlinearity, and multiplicity;
- model convergence, diagnostics, assumption checks, sparse cells, separation, influential observations, and sensitivity analyses when reported by the output;
- consistency among prose, abstract, tables, figures, supplements, Methods, and code/output labels;
- whether every reported analysis is described in Methods and every primary planned analysis appears in Results.

Recalculate only deterministic display quantities needed to verify transcription, such as a rounded value or percentage from an explicit numerator and denominator. Do not fit a new model, alter exclusions, choose a different test, or repair an analysis unless the author separately authorizes reanalysis and supplies suitable data.

## Findings and escalation

For each discrepancy, quote the manuscript claim, cite the exact source location, explain the mismatch, and classify severity and likely impact. Never silently choose between conflicting values. Critical issues include a different effect direction, analysis population, outcome, model, or materially different estimate; unsupported primary results; impossible counts; or evidence that the reported model is not the stated model.

Return a corrected-value proposal only when the source is unambiguous. Otherwise create an author/statistician query. The final verdict is pass, conditional pass, or fail, with all unverified claims listed.
