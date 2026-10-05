# Specialist Handoff

Return JSON conforming to this logical shape before any governed state change:

```json
{
  "schema_version": "1.0.0",
  "project_id": "project_...",
  "workflow": "skill-name@version",
  "scope": "bounded review or drafting scope",
  "input_artifact_ids": ["source_..."],
  "evidence_boundary": "what was and was not assessed",
  "expected_output_type": "Finding | ManuscriptRevision | ...",
  "stop_condition": "condition requiring return to Senior Investigator",
  "known_facts": [],
  "unresolved_items": [],
  "findings": [],
  "proposed_changes": [],
  "limitations": [],
  "human_decision_required": "exact decision"
}
```

Free text may explain a handoff but cannot replace this structure for a state-changing action.
