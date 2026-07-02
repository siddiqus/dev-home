/**
 * Sprint completion vs elapsed time (TICKET-COUNT based) + scope change.
 * Pure — `now` is a parameter.
 *
 * STUB: implement elapsedPct/donePct/behindPace and scope-added counts with TDD.
 */
import type { EnrichedIssue, ScopeChange, SprintInfo, SprintPace } from "./types";
import type { CockpitConfig } from "./config";

export function computePace(
  issues: EnrichedIssue[],
  _sprint: SprintInfo | null,
  _now: Date,
  _config: CockpitConfig,
): SprintPace {
  // TODO(BE-pace): dayOfSprint/sprintLength/elapsedPct from sprint dates vs now;
  // donePct = doneCount/totalCount; behindPace when donePct < elapsedPct - tolerance.
  const totalCount = issues.length;
  const doneCount = issues.filter((i) => i.statusCategory === "done").length;
  return {
    dayOfSprint: 0,
    sprintLength: 0,
    elapsedPct: 0,
    totalCount,
    doneCount,
    remainingCount: totalCount - doneCount,
    donePct: totalCount ? doneCount / totalCount : 0,
    behindPace: false,
  };
}

export function computeScope(issues: EnrichedIssue[], _sprint: SprintInfo | null): ScopeChange {
  // TODO(BE-pace): count issues with flags.addedAfterStart (created > sprint start).
  void issues;
  return { addedCount: 0 };
}
