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
  sprint: SprintInfo | null,
  now: Date,
  config: CockpitConfig,
): SprintPace {
  const totalCount = issues.length;
  const doneCount = issues.filter((i) => i.statusCategory === "done").length;
  const remainingCount = totalCount - doneCount;
  const donePct = totalCount ? doneCount / totalCount : 0;

  let sprintLength = 0;
  let dayOfSprint = 0;
  let elapsedPct = 0;

  if (sprint?.startDate && sprint?.endDate) {
    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const lengthMs = end.getTime() - start.getTime();
      sprintLength = Math.max(1, Math.floor(lengthMs / (1000 * 60 * 60 * 24)));

      const elapsedMs = now.getTime() - start.getTime();
      dayOfSprint = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
      dayOfSprint = Math.min(dayOfSprint, sprintLength);

      const rawElapsedPct = lengthMs > 0 ? elapsedMs / lengthMs : 0;
      elapsedPct = Math.max(0, Math.min(1, rawElapsedPct));
    }
  }

  const behindPace = donePct < elapsedPct - config.behindPaceTolerance;

  // Optional story points
  const hasSP = issues.some((i) => i.storyPoints !== null);
  const result: SprintPace = {
    dayOfSprint,
    sprintLength,
    elapsedPct,
    totalCount,
    doneCount,
    remainingCount,
    donePct,
    behindPace,
  };

  if (hasSP) {
    result.committedSP = issues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
    result.doneSP = issues
      .filter((i) => i.statusCategory === "done")
      .reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
  }

  return result;
}

export function computeScope(issues: EnrichedIssue[], _sprint: SprintInfo | null): ScopeChange {
  const addedIssues = issues.filter((i) => i.flags.addedAfterStart);
  const addedCount = addedIssues.length;

  const hasSP = addedIssues.some((i) => i.storyPoints !== null);
  const result: ScopeChange = { addedCount };

  if (hasSP) {
    result.addedSP = addedIssues.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
  }

  return result;
}
