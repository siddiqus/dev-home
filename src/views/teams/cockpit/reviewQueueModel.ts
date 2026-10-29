import type { ReviewQueueEntry, ReviewQueueState } from "../../../types/teams";

/** Most urgent first. Colors match the LoadDistribution palette; only the dot carries them. */
export const REVIEW_STATES: { state: ReviewQueueState; label: string; color: string }[] = [
  { state: "needsReviewer", label: "Needs a reviewer", color: "#dc3545" },
  { state: "waitingReview", label: "Waiting for review", color: "#e0a458" },
  { state: "readyToMerge", label: "Ready to merge", color: "#50c878" },
  { state: "withAuthor", label: "Back with author", color: "#4c8dff" },
  { state: "draft", label: "Draft", color: "#6e7781" },
];

/** Entries per state, in REVIEW_STATES order, empty states dropped. Keeps the server's order within a state. */
export function groupByState(entries: ReviewQueueEntry[]) {
  return REVIEW_STATES.map((s) => ({
    ...s,
    entries: entries.filter((e) => e.state === s.state),
  })).filter((g) => g.entries.length > 0);
}

/** How long the PR has waited on whoever holds it: "45m", "5h", "3d". */
export function waitedFor(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const minutes = Math.max(0, Math.floor((now - t) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** "cmp-server#123". */
export function prLabel(e: ReviewQueueEntry): string {
  return `${e.repo_full_name.split("/").pop()}#${e.number}`;
}

/** True when someone on the team opened the PR. */
export function isTeamPR(e: ReviewQueueEntry, teamLogins: Set<string>): boolean {
  return teamLogins.has(e.author.toLowerCase());
}

/** Case-insensitive match on title, repo#number, author or any reviewer. */
export function matchesSearch(e: ReviewQueueEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [e.title, e.repo_full_name, prLabel(e), `#${e.number}`, e.author, ...e.reviewers].some(
    (field) => field.toLowerCase().includes(q),
  );
}
