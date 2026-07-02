/**
 * Derive "manager mode" insight cards from the assembled aggregates.
 * Pure. Each insight is an actionable one-liner (Behind Pace, Stale Work,
 * Review Bottleneck, Uneven Load, Hidden Work, Epic Drift, Done Mismatch,
 * Scope Increased).
 *
 * STUB: implement rules with TDD per spec §5.
 */
import type {
  Hygiene,
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
  hygiene?: Hygiene;
}

export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  // Behind pace
  if (input.pace.behindPace) {
    const elapsedPct = Math.round(input.pace.elapsedPct * 100);
    const donePct = Math.round(input.pace.donePct * 100);
    insights.push({
      key: "behind-pace",
      severity: "warn",
      title: "Behind Pace",
      detail: `${elapsedPct}% elapsed, ${donePct}% of tickets done`,
    });
  }

  // Stale work
  if (input.needsAttention.stale.length > 0) {
    insights.push({
      key: "stale-work",
      severity: "critical",
      title: "Stale Work",
      detail: `${input.needsAttention.stale.length} tickets with no movement`,
    });
  }

  // Review bottleneck
  if (input.needsAttention.waitingReview.length > 0) {
    insights.push({
      key: "review-bottleneck",
      severity: "warn",
      title: "Review Bottleneck",
      detail: `${input.needsAttention.waitingReview.length} PRs waiting for review`,
    });
  }

  // Uneven load
  if (input.loadBalance.imbalance >= 3) {
    insights.push({
      key: "uneven-load",
      severity: "warn",
      title: "Uneven Load",
      detail: `Imbalance of ${input.loadBalance.imbalance} tickets across team`,
    });
  }

  // Hidden work
  if (input.needsAttention.offBoard.length > 0) {
    insights.push({
      key: "hidden-work",
      severity: "info",
      title: "Hidden Work",
      detail: `${input.needsAttention.offBoard.length} off-board PRs`,
    });
  }

  // Epic drift
  if (input.needsAttention.noEpic.length > 0) {
    insights.push({
      key: "epic-drift",
      severity: "info",
      title: "Epic Drift",
      detail: `${input.needsAttention.noEpic.length} tickets without epic`,
    });
  }

  // Done mismatch — PRs merged but the Jira ticket isn't marked done
  if (input.hygiene && input.hygiene.mergedNotDone.length > 0) {
    insights.push({
      key: "done-mismatch",
      severity: "warn",
      title: "Done Mismatch",
      detail: `${input.hygiene.mergedNotDone.length} merged PRs with Jira not marked done`,
    });
  }

  // Scope increased
  if (input.scope.addedCount > 0) {
    insights.push({
      key: "scope-increased",
      severity: "info",
      title: "Scope Increased",
      detail: `${input.scope.addedCount} tickets added after sprint start`,
    });
  }

  // Sort by severity: critical, warn, info
  const severityOrder: Record<string, number> = { critical: 0, warn: 1, info: 2 };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return insights;
}
