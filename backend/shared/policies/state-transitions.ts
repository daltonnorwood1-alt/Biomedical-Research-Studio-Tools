export const gates = ["A", "B", "C", "D", "E"] as const;
export type Gate = (typeof gates)[number];

export const allowedGateTransitions: Record<string, readonly string[]> = {
  not_started: ["awaiting_input", "in_review"],
  awaiting_input: ["in_review", "blocked"],
  in_review: ["approved", "rejected", "blocked", "awaiting_input"],
  blocked: ["awaiting_input", "in_review"],
  rejected: ["superseded", "in_review"],
  approved: ["superseded"],
  superseded: []
};

export function assertGateTransition(from: string, to: string): void {
  if (!allowedGateTransitions[from]?.includes(to)) {
    throw new Error(`Invalid gate transition: ${from} -> ${to}`);
  }
}

export function requiresSubstantiveApproval(domains: readonly string[]): boolean {
  return domains.some((domain) => domain !== "editorial");
}
