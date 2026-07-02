/**
 * Derive "manager mode" insight cards from the assembled aggregates.
 * Pure. Each insight is an actionable one-liner (Behind Pace, Stale Work,
 * Review Bottleneck, Uneven Load, Hidden Work, Epic Drift, Done Mismatch,
 * Scope Increased).
 *
 * STUB: implement rules with TDD per spec §5.
 */
import type {
  Insight,
  LoadBalance,
  NeedsAttention,
  PrFlow,
  ScopeChange,
  SprintPace,
} from "./types";

export interface InsightInput {
  pace: SprintPace;
  scope: ScopeChange;
  needsAttention: NeedsAttention;
  prFlow: PrFlow;
  loadBalance: LoadBalance;
}

export function buildInsights(_input: InsightInput): Insight[] {
  // TODO(BE-pace): emit insight cards from thresholds; order by severity.
  return [];
}
