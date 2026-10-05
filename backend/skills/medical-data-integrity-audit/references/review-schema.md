# Evidence and revision review record — version 2

Create UTF-8 JSON using this shape. Use plain text; the builder escapes all supplied content. Use an empty list or string when a field is unavailable. Never include direct patient identifiers.

```json
{
  "title": "Review of Figure 2",
  "reviewed_at": "2026-08-04T15:30:00-05:00",
  "scope": "Figure 2, its caption, Statistical Analysis, and the primary-outcome Results paragraph",
  "source_files": ["manuscript-v8.docx", "analysis-final.csv"],
  "artifact": {
    "label": "Figure 2",
    "type": "figure",
    "source_path": "/absolute/path/to/rendered-figure-2.png",
    "caption": "Submitted caption",
    "table": {
      "columns": [],
      "rows": []
    }
  },
  "interpretation": {
    "headline": "The intervention curve separates from control after week 4",
    "summary": "The figure indicates a sustained between-group difference through week 12, with uncertainty increasing late in follow-up.",
    "key_points": [
      "The largest displayed difference occurs at week 12.",
      "The error-bar definition is not stated in the caption."
    ]
  },
  "results": {
    "location": "Results > Primary outcome, paragraph 1",
    "excerpt": "Exact relevant Results text"
  },
  "verdict": {
    "status": "needs modifications",
    "summary": "The direction is consistent, but the reported magnitude does not match the figure.",
    "modifications": [
      "Verify the week-12 source estimate.",
      "Correct either the figure or the Results sentence.",
      "Define the error bars in the caption."
    ]
  },
  "methods": {
    "location": "Methods > Statistical analysis, paragraph 2",
    "excerpt": "Exact relevant Methods text"
  },
  "methods_assessment": {
    "status": "needs clarification",
    "summary": "The repeated-measures model is appropriate in principle, but the covariance structure and missing-data assumptions are not specified."
  },
  "overall_confidence": "high",
  "revisions": [
    {
      "id": "R-001",
      "source_location": "Results > Primary outcome, paragraph 1",
      "original": "At week 12, mean change was -2.4 units in the intervention group.",
      "interpretation": "The figure displays -4.2 units for the same group and time point.",
      "suggested_change": "Confirm the source estimate and align the Results sentence with the verified value.",
      "proposed_replacement": "At week 12, mean change was -4.2 units in the intervention group."
    }
  ],
  "findings": [
    {
      "id": "F-001",
      "severity": "major",
      "confidence": "high",
      "status": "confirmed discrepancy",
      "category": "figure-results consistency",
      "location": "Figure 2 at week 12; Results paragraph 1",
      "observed": "Figure shows -4.2 units",
      "comparator": "Results reports -2.4 units",
      "evidence": "Values differ by 1.8 units; both refer to the same population and time point.",
      "consequence": "The magnitude of the primary effect is ambiguous.",
      "recommendation": "Verify the source estimate and correct the figure or Results sentence."
    }
  ],
  "checks": [
    {
      "check": "Analysis population matches Methods",
      "status": "pass",
      "evidence": "Both specify the modified intention-to-treat population (n=214)."
    }
  ],
  "limitations": [
    "Source-level estimate could not be recalculated because analysis code was not supplied."
  ]
}
```

## Artifact rules

For a table, set `artifact.type` to `table`, leave `source_path` empty, and populate `artifact.table.columns` and `artifact.table.rows`. Every row must have the same number of values as `columns`.

Use absolute image paths. The builder embeds PNG, JPEG, GIF, WebP, and SVG images in the HTML so the report remains portable. Render a PDF page or unsupported image format to PNG before building the interface.

## Controlled values

- verdict status: `correct`, `needs modifications`, `completely incorrect`, `not assessable`
- methods assessment status: `appropriate`, `needs clarification`, `not appropriate`, `not assessable`
- finding severity: `critical`, `major`, `minor`, `note`
- finding confidence: `high`, `moderate`, `low`
- finding status: `confirmed discrepancy`, `probable discrepancy`, `needs clarification`, `not assessable`
- check status: `pass`, `fail`, `warning`, `not assessable`

Use `correct` only for agreement within the stated review scope. Use `not assessable` when the necessary evidence is absent. Do not draft a replacement value that has not been verified; state the required verification in `proposed_replacement` instead.

## Revision pathway

Create one `revisions` entry for each actionable text or display change:

1. Copy `original` text exactly or identify the original displayed value.
2. Explain what the evidence means in `interpretation` without adding unsupported claims.
3. State the action in `suggested_change` and distinguish wording edits from reanalysis.
4. Supply publication-ready `proposed_replacement` text only when supported by the reviewed evidence.
