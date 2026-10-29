import type { TeamDashboard } from "../types/teams";

/**
 * Browser cache for team dashboards: the last few team + sprint results, kept
 * until the user hits Refresh. Each entry carries a signature of what produced
 * it (see dashboardSignature in teams.ts); a read with a different signature
 * misses, so editing a team never shows the old configuration's data.
 *
 * Kept outside the `dev-home:db:` prefix so backups don't carry it.
 */
const PREFIX = "dev-home-team-dashboard:";
const INDEX_KEY = `${PREFIX}index`;
/** localStorage is shared with the app's own data, so only a few are kept. */
export const MAX_CACHED_DASHBOARDS = 6;

interface Entry {
  signature: string;
  dashboard: TeamDashboard;
}

function slotKey(teamId: number, sprintId: number | null): string {
  return `${PREFIX}${teamId}:${sprintId ?? "active"}`;
}

/** Slot keys, most recently used first. */
function readIndex(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeIndex(index: string[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // A full quota only costs the recency order.
  }
}

export function readDashboardCache(
  teamId: number,
  sprintId: number | null,
  signature: string,
): TeamDashboard | null {
  const slot = slotKey(teamId, sprintId);
  let entry: Entry;
  try {
    const raw = localStorage.getItem(slot);
    if (!raw) return null;
    entry = JSON.parse(raw);
  } catch {
    return null;
  }
  if (entry?.signature !== signature || !entry.dashboard) return null;
  writeIndex([slot, ...readIndex().filter((k) => k !== slot)]);
  return entry.dashboard;
}

export function writeDashboardCache(
  teamId: number,
  sprintId: number | null,
  signature: string,
  dashboard: TeamDashboard,
): void {
  const slot = slotKey(teamId, sprintId);
  const value = JSON.stringify({ signature, dashboard } satisfies Entry);
  const index = [slot, ...readIndex().filter((k) => k !== slot)];
  for (const stale of index.splice(MAX_CACHED_DASHBOARDS)) localStorage.removeItem(stale);

  // On a full quota, give up the least recently used entries, then this one.
  for (;;) {
    try {
      localStorage.setItem(slot, value);
      break;
    } catch {
      const oldest = index.length > 1 ? index.pop() : undefined;
      if (!oldest) {
        localStorage.removeItem(slot);
        writeIndex([]);
        return;
      }
      localStorage.removeItem(oldest);
    }
  }
  writeIndex(index);
}
