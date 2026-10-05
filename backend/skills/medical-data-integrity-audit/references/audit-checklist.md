# Medical research integrity checklist

Select checks based on the supplied study design and evidence. Record `not assessable` when required inputs are absent.

## Source data and provenance

- Confirm file versions, sheet names, row/column counts, variable definitions, observation unit, keys, and analysis population.
- Check duplicate identifiers, duplicate observations, conflicting records, invalid category codes, impossible or out-of-range values, unit inconsistencies, and date chronology.
- Quantify missingness overall and by group/time point; distinguish true missing values from coded values, structural absence, and below-detection-limit values.
- Check joins for one-to-many or many-to-many expansion and confirm that exclusions reproduce the stated analysis population.
- Reconcile participant/observation flow and all denominators.

## Tables

- Recalculate totals, percentages, means, medians, dispersion, rates, effect estimates, confidence intervals, and p-values when possible.
- Check that subgroup counts reconcile with totals and that percentages use the stated denominator.
- Check precision and rounding, including percentages that legitimately sum to 99.9% or 100.1%.
- Verify units, time points, reference groups, effect-measure direction, footnotes, missing counts, and analysis population.
- Verify that confidence intervals and p-values are directionally and numerically coherent.

## Figures

- Verify axes, scales, units, labels, legends, sample sizes, time points, error-bar definitions, transformations, and panel/caption mapping.
- Compare plotted coordinates or summaries with the underlying table/data when possible.
- Check truncation, nonlinear scales, smoothing, interpolation, overplotting, omitted groups, duplicated panels, and visual encodings that could mislead.
- For survival plots, check number-at-risk tables, censoring marks, follow-up, event counts, and time origin.
- For flow diagrams, reconcile every transition and exclusion with Methods, Results, and analysis counts.

## Methods-data compatibility

- Match outcome scale and distribution to the model and summary statistics.
- Confirm independence assumptions or account for pairing, repeated measures, multilevel clustering, and site effects.
- Check analysis population, eligibility, exposure/outcome definitions, time zero, follow-up, censoring, and estimand.
- Check covariate selection, confounding control, nonlinearity, interactions, model convergence, and influential observations as applicable.
- Check missing-data assumptions and implementation; compare complete-case, imputation, weighting, or sensitivity analyses to the stated method.
- Check multiplicity across outcomes, groups, time points, and interim looks.
- Check sample-size or power inputs against the design and primary analysis.
- Favor effect sizes and uncertainty over significance-only interpretation.

### Design-specific prompts

- Randomized trials: allocation, concealment, stratification, intention-to-treat/per-protocol definitions, protocol deviations, attrition, and CONSORT flow.
- Observational studies: selection, temporality, confounding, immortal-time bias, measurement error, missingness, and causal-language limits.
- Diagnostic studies: reference standard, spectrum, threshold selection, paired sensitivity/specificity denominators, verification bias, and calibration.
- Prediction models: leakage, train/test separation, optimism correction, calibration, discrimination, class imbalance, and external validation.
- Time-to-event studies: time origin, censoring, proportional hazards, competing risks, risk sets, and follow-up distribution.
- Meta-analysis: effect harmonization, dependency, heterogeneity, model choice, influence, small-study effects, and certainty claims.
- Omics/high-dimensional studies: preprocessing, normalization, batch effects, feature filtering, multiplicity/FDR, leakage, and validation.

## Manuscript reconciliation

- Map each primary and key secondary endpoint from Methods to its Results sentence and display.
- Compare values, signs, units, populations, denominators, time points, interval levels, and p-values.
- Check abstract, main text, tables, figures, supplements, and conclusions for conflicting versions of the same result.
- Check that significance, equivalence, noninferiority, interaction, subgroup, and causal claims follow from the stated analysis.
- Flag outcome switching, unexplained analyses, omitted prespecified outcomes, and inconsistent terminology without inferring intent.

## Severity calibration

- Critical: may reverse a central conclusion, invalidate the primary analysis, signal serious integrity concern, or create a material safety/ethics issue.
- Major: materially affects interpretation, reproducibility, or an important method/result.
- Minor: localized error with limited impact, such as a label, footnote, rounding, or isolated transcription problem.
- Note: clarity or robustness improvement; not demonstrated to be an error.
