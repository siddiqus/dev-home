/** A team whose dashboard was opened, and when it was last shown. */
export interface RecentTeam {
  id: number;
  /** Epoch ms of the latest visit. */
  at: number;
}

export const MAX_RECENT_TEAMS = 5;

/**
 * The recent-teams list after showing team `id` at `at`. Teams keep their place
 * so the sidebar doesn't reshuffle on every click: a revisit only updates its
 * time, a new team goes at the bottom, and a full list first drops the team
 * visited longest ago.
 */
export function visitRecentTeam(
  list: RecentTeam[],
  id: number,
  at: number,
  max = MAX_RECENT_TEAMS,
): RecentTeam[] {
  if (list.some((t) => t.id === id)) {
    return list.map((t) => (t.id === id ? { id, at } : t));
  }
  let kept = list;
  if (list.length >= max) {
    const oldest = list.reduce((a, b) => (b.at < a.at ? b : a));
    kept = list.filter((t) => t !== oldest);
  }
  return [...kept, { id, at }];
}
