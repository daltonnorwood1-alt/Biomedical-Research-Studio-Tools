# Intake and manuscript state

This reference elaborates studio gates A and B. Use the claim labels and approval requirements in the studio governance contract; the ledger fields below are supporting detail, not a separate state system.

Use this reference for the opening intake and stage gates. Ask only questions not already answered by conversation or uploaded materials, but ask every currently material unknown.

## Opening intake

If the available context does not already answer it, ask whether the author has a proposal or protocol to upload. Invite, without requiring, the registration, statistical analysis plan, ethics approval summary, data dictionary, journal instructions, manuscript draft, tables, figures, supplements, and analysis output. Do not make the upload question a rigid conversational blocker when the user has already supplied enough context to establish scope safely.

## Aim and research-question gate

Confirm:

- working topic/title and intended manuscript type;
- primary aim and research question in Population/Problem, Exposure or Intervention, Comparator, Outcome, Time, and Setting terms when applicable;
- secondary and exploratory aims;
- directional or null hypotheses, if prespecified;
- intended audience, clinical/public-health/policy/mechanistic emphasis, and at least one target journal if known;
- what was prespecified, what changed after data inspection, and why.

Do not force a PICO structure on qualitative, methodological, descriptive, or other designs where a different framework fits better.

## Methods gate: common core

Resolve the following when applicable:

- exact study design; prospective/retrospective status; single/multicenter status; setting and country;
- study dates for recruitment, exposure, follow-up, data extraction, and analysis;
- source population, sampling frame, recruitment/identification, eligibility, exclusions, comparison groups, and participant flow;
- intervention/exposure/predictor and comparator definitions, timing, assignment, fidelity, contamination, and co-interventions;
- primary, secondary, safety, and exploratory outcomes; operational definitions; measurement timepoints; instruments; validation; assessors; blinding;
- covariates/confounders/effect modifiers, their rationale, coding, transformations, and data sources;
- data collection, linkage, preprocessing, quality control, duplicate handling, and provenance;
- sample-size or power calculation, assumptions, feasibility basis, and any changes;
- analysis population, estimand where relevant, descriptive and inferential methods, model specification, assumptions/diagnostics, multiplicity, interactions, clustering/repeated measures, missing data, sensitivity/subgroup analyses, software and versions;
- ethics body and identifier, consent/waiver, privacy safeguards, registration, protocol access, data/code availability, funding, conflicts, and patient/public involvement;
- deviations from protocol, registration, or analysis plan.

## Design-specific branches

Add questions required by the selected guideline, including as applicable:

- **Randomized trial:** sequence generation, allocation concealment, implementation roles, blinding, trial registration, protocol, intervention details, adherence, harms, stopping rules, DSMB, and participant-flow diagram.
- **Observational study:** bias controls, source and measurement comparability, confounding strategy, quantitative-variable handling, loss to follow-up, matching/weighting, and sensitivity analyses.
- **Diagnostic accuracy:** index test, reference standard, thresholds, test readers, blinding, indeterminate results, timing, and participant spectrum.
- **Prediction model:** outcome horizon, predictor handling, sample-size rationale, model development/validation, performance metrics, calibration, optimism/overfitting, missing data, and model availability.
- **Systematic/scoping review:** protocol/registration, eligibility framework, databases and full reproducible searches, dates, deduplication, screening and extraction roles, automation, risk of bias, synthesis, heterogeneity, certainty, reporting bias, and excluded full texts.
- **Qualitative study:** paradigm, researcher characteristics/reflexivity, sampling, setting/context, consent, data generation, saturation/information power, coding, analytic approach, trustworthiness, and participant quotations.
- **Quality improvement:** local problem, rationale, context, intervention, iterative cycles, measures, analysis over time, ethical considerations, and unintended consequences.
- **Economic evaluation:** perspective, comparators, time horizon, discounting, resources/costs, outcomes, model, assumptions, currency/price date, heterogeneity, and uncertainty analyses.
- **Case report/series:** timeline, diagnostic assessment, intervention, follow-up/outcomes, adverse events, patient perspective, and consent.
- **Animal/preclinical:** species/strain, experimental unit, inclusion/exclusion, randomization, blinding, sample size, husbandry, procedures, humane endpoints, and approvals.
- **AI/ML:** data provenance and splits, leakage prevention, ground truth, model/version, training and tuning, external validation, subgroup/fairness analyses, performance with uncertainty, human-AI interaction, and availability.

## Results-package gate

Request the most direct evidence available, preferably tables, figures, statistical output, and a data dictionary rather than narrative alone. Confirm:

- participant/unit flow and exclusions at each stage;
- analysis denominators and missingness for every primary result;
- baseline/descriptive results appropriate to the design;
- every primary, secondary, safety, subgroup, sensitivity, and exploratory result, including null results;
- effect estimate, uncertainty interval, test statistic or p value as appropriate, units, reference category, model adjustment set, and timepoint;
- harms/adverse events and unintended effects where applicable;
- intended table/figure order, captions, abbreviations, and supplemental placement;
- discrepancies from planned analyses and reasons;
- whether any value is derived, rounded, transformed, suppressed, or provisional.

Do not infer unreported results from significance statements. Do not recompute or introduce new analyses unless the author explicitly asks and supplies suitable data.

## State ledger

Maintain these fields throughout the project:

- `Confirmed`: fact labeled `confirmed`, source, date/version, manuscript destination.
- `Claim status`: `confirmed`, `author-provided-unverified`, `plausible-unverified`, `unsupported`, or `conflicted`.
- `Conflict`: competing statements labeled `conflicted`, sources, resolution owner.
- `Open query`: unique ID, question, why it matters, blocking/nonblocking, date asked, status.
- `Decision`: choice, rationale, author confirmation, affected sections.
- `Deviation`: protocol/planned approach, actual approach, reason, disclosure destination.
- `Evidence`: claim, supporting source, identifier/link, verification status.
- `Checklist`: guideline item, status, evidence/location, query ID.

At each iteration, close answered queries, add newly exposed questions, and never silently overwrite a confirmed decision.
