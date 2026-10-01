/**
 * Tunable thresholds for the sprint cockpit's risk/attention logic.
 * Centralized so the rules are easy to adjust and easy to reference in tests.
 */
export interface CockpitConfig {
  /** In-progress with no `updated` movement for more than this many days = stale. */
  staleDays: number;
  /** Due within this many days (or overdue) = dueSoon. */
  dueSoonDays: number;
  /** Open PR with no first review after this many hours = waitingReview. */
  waitingReviewHours: number;
  /** donePct must trail elapsedPct by more than this fraction to be "behind pace". */
  behindPaceTolerance: number;
}

export const DEFAULT_COCKPIT_CONFIG: CockpitConfig = {
  staleDays: 2,
  dueSoonDays: 2,
  waitingReviewHours: 24,
  behindPaceTolerance: 0.1,
};

/** Risk weights (blocked intentionally omitted for v1; stalled is the heavy term). */
export const RISK_WEIGHTS = {
  stale: 3,
  prFailingCI: 2,
  prWaitingReview: 2,
  unassigned: 1,
  noEpic: 1,
  inProgressNoPR: 1,
  dueSoon: 1,
  addedAfterStart: 1,
} as const;

/** score 0–2 normal · 3–4 attention · 5+ high */
export function riskLevelFor(score: number): "normal" | "attention" | "high" {
  if (score >= 5) return "high";
  if (score >= 3) return "attention";
  return "normal";
}
