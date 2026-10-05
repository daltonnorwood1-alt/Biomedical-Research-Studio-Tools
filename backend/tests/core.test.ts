import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { openDatabase } from "../server/db.js";
import { createFinding, createProject, createRevision, ingestSource, recordApproval, releaseAssessment, stableFindingId } from "../server/core.js";
import { produceDocuments } from "../server/docx.js";
import { assessCausalLanguage, assessCitation, assessClinicalSignificance, compareReportedValue } from "../server/review.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "brs-"));
  const db = openDatabase(join(root, "studio.sqlite"));
  const project = createProject(db, { title: "Synthetic study", project_type: "manuscript revision", article_type: "Original research", study_design: "observational", sensitivity: "sensitive" }) as { id: string };
  return { root, db, project };
}

describe("safety acceptance criteria", () => {
  it("blocks a fabricated DOI and separates metadata from claim support", () => {
    expect(assessCitation({ citation: "10.9999/fabricated", authoritativeLookupCompleted: true, exists: false }).verdict).toBe("FAIL");
    const realWrongClaim = assessCitation({ citation: "10.1000/real", authoritativeLookupCompleted: true, exists: true, claimSupportReviewed: true, supportsClaim: false });
    expect(realWrongClaim.metadata).toBe("verified");
    expect(realWrongClaim.claim_support).toBe("failed");
  });

  it("flags statistically significant but clinically trivial effects", () => {
    expect(assessClinicalSignificance({ pValue: 0.001, effect: 0.2, mcid: 1, patientRelevantOutcome: true })).toMatchObject({ verdict: "FAIL", human_review_required: true });
  });

  it("flags causal wording in observational research", () => {
    expect(assessCausalLanguage("Exposure X reduces mortality.", "observational")).toMatchObject({ verdict: "FAIL", suggested_mode: "associational" });
  });

  it("reports a table-text mismatch without inventing a replacement", () => {
    const result = compareReportedValue({ artifactLocation: "Table 2 row 4", artifactValue: "18.2%", manuscriptLocation: "Results paragraph 3", manuscriptValue: "28.2%" });
    expect(result).toMatchObject({ severity: "major", proposedReplacement: null, human_review_required: true });
  });
});

describe("governed state and document production", () => {
  it("quarantines a direct-identifier fixture", () => {
    const { root, db, project } = setup();
    const source = ingestSource(db, root, project.id, "identifiers.txt", "text/plain", Buffer.from("Patient email is patient@example.org and MRN: ABC12345")) as Record<string, unknown>;
    expect(source.processing_status).toBe("quarantined");
    expect(releaseAssessment(db, project.id).blocking_finding_ids).toHaveLength(1);
  });

  it("reproduces stable finding IDs", () => {
    const a = stableFindingId("p1", "SAF-STATS-003", ["Table 1"], "n mismatch");
    const b = stableFindingId("p1", "SAF-STATS-003", ["Table 1"], "n mismatch");
    expect(a).toBe(b);
  });

  it("blocks unapproved redlines and emits authentic approved revisions", () => {
    const { root, db, project } = setup();
    const source = ingestSource(db, root, project.id, "source.txt", "text/plain", Buffer.from("Exposure X caused outcome Y.")) as { id: string };
    const revision = createRevision(db, { project_id: project.id, source_artifact_ids: [source.id], section: "Discussion", original_text: "Exposure X caused outcome Y.", proposed_text: "Exposure X was associated with outcome Y.", rationale: "Observational design does not establish causation.", substantive_domains: ["causal-language", "conclusions"] }) as { id: string };
    expect(() => produceDocuments(db, root, project.id, revision.id)).toThrow(/Release blocked/);
    for (const gate of ["A", "B", "C", "D", "E"] as const) {
      recordApproval(db, { project_id: project.id, gate, subject_type: gate === "D" ? "ManuscriptRevision" : "Gate", subject_id: gate === "D" ? revision.id : `gate-${gate}`, decision: "approved", exact_proposed_wording: gate === "D" ? "Exposure X was associated with outcome Y." : `Approve gate ${gate}`, selected_source_version: source.id, open_finding_ids: [], scientific_consequence: "Reviewed and accepted within scope.", resulting_artifacts: gate === "E" ? ["clean DOCX", "redline DOCX", "manifest"] : [], approver: "Dalton Norwood", rationale: "Synthetic fixture approval." });
    }
    const output = produceDocuments(db, root, project.id, revision.id);
    const redline = readFileSync(output.redlinePath);
    const documentXml = new PizZip(redline).file("word/document.xml")?.asText() ?? "";
    expect(documentXml).toContain("<w:ins");
    expect(documentXml).toContain("<w:del");
    expect(documentXml).toContain('w:author="Dalton Norwood"');
    expect(output.manifest.inputs).toEqual([source.id]);
  });

  it("blocks release when a safety failure exists", () => {
    const { db, project } = setup();
    createFinding(db, { project_id: project.id, source_artifact_ids: [], rule_id: "SAF-CITATION-002", severity: "critical", confidence: "high", audit_status: "confirmed discrepancy", source_locations: ["Reference 7"], observed: "DOI does not resolve", comparator: "Authoritative lookup returned no record", reproducible_evidence: "Lookup record fixture", scientific_consequence: "Unsupported evidence claim", recommendation: "Remove or verify; do not invent a replacement", safety_verdict: "FAIL" });
    expect(releaseAssessment(db, project.id).releasable).toBe(false);
  });

  it("blocks unresolved major discrepancies even without an explicit safety FAIL", () => {
    const { db, project } = setup();
    const finding = createFinding(db, { project_id: project.id, source_artifact_ids: [], rule_id: "DATA-MISMATCH", severity: "major", confidence: "high", audit_status: "confirmed discrepancy", source_locations: ["Table 2"], observed: "Reported denominator differs", comparator: "Validated analysis output", reproducible_evidence: "Synthetic comparison", scientific_consequence: "Effect estimate may be misstated", recommendation: "Resolve against the authoritative output", safety_verdict: "CONDITIONAL PASS" }) as { id: string };
    expect(releaseAssessment(db, project.id).blocking_finding_ids).toContain(finding.id);
  });
});
