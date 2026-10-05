export type Verdict = "PASS" | "CONDITIONAL PASS" | "FAIL";

export function assessCitation(input: { citation: string; authoritativeLookupCompleted: boolean; exists?: boolean; claimSupportReviewed?: boolean; supportsClaim?: boolean }) {
  if (!input.authoritativeLookupCompleted) return { metadata: "unverified", claim_support: "unverified", verdict: "FAIL" as Verdict, type: "unverifiable", severity: "critical" };
  if (!input.exists) return { metadata: "failed", claim_support: "not-assessable", verdict: "FAIL" as Verdict, type: "fabricated", severity: "critical" };
  if (!input.claimSupportReviewed) return { metadata: "verified", claim_support: "unverified", verdict: "CONDITIONAL PASS" as Verdict, type: "claim-support-pending", severity: "moderate" };
  if (!input.supportsClaim) return { metadata: "verified", claim_support: "failed", verdict: "FAIL" as Verdict, type: "misattributed", severity: "critical" };
  return { metadata: "verified", claim_support: "verified", verdict: "PASS" as Verdict, type: "none", severity: "note" };
}

export function assessClinicalSignificance(input: { pValue?: number; effect: number; mcid?: number; patientRelevantOutcome: boolean }) {
  const statisticallySignificant = input.pValue !== undefined && input.pValue < 0.05;
  const clinicallyTrivial = input.mcid !== undefined && Math.abs(input.effect) < Math.abs(input.mcid);
  if (statisticallySignificant && (clinicallyTrivial || !input.patientRelevantOutcome)) {
    return { verdict: "FAIL" as Verdict, severity: "major", type: "statistical-clinical-conflation", human_review_required: true };
  }
  if (statisticallySignificant && input.mcid === undefined) {
    return { verdict: "CONDITIONAL PASS" as Verdict, severity: "minor", type: "clinical-threshold-unknown", human_review_required: true };
  }
  return { verdict: "PASS" as Verdict, severity: "note", type: "none", human_review_required: false };
}

const causalTerms = /\b(causes?|caused|leads? to|led to|results? in|resulted in|drives?|reduces?|increases?|prevents?|improves?)\b/i;
export function assessCausalLanguage(text: string, design: "observational" | "randomized" | "quasi-experimental", causalMethods = false) {
  const matches = text.match(causalTerms) ?? [];
  const unsupported = matches.length > 0 && design === "observational" && !causalMethods;
  return { matches, verdict: unsupported ? "FAIL" as Verdict : "PASS" as Verdict, suggested_mode: unsupported ? "associational" : "as-written", human_review_required: unsupported };
}

export function compareReportedValue(input: { artifactLocation: string; artifactValue: string; manuscriptLocation: string; manuscriptValue: string }) {
  const matches = input.artifactValue.trim() === input.manuscriptValue.trim();
  return {
    matches,
    severity: matches ? "note" : "major",
    status: matches ? "consistent" : "confirmed discrepancy",
    observed: `${input.manuscriptLocation}: ${input.manuscriptValue}`,
    comparator: `${input.artifactLocation}: ${input.artifactValue}`,
    proposedReplacement: null,
    human_review_required: !matches
  };
}
