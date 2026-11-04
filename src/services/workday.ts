import type {
  DoneTicket,
  GitHubPR,
  JiraIssue,
  OffSprintTicket,
  ReviewedPR,
  SprintTicket,
} from "../types";
import { getDoneSince } from "../api/jira/workday";
import { getReviewedSince } from "../api/github";
import { SETTINGS_EVENT } from "./config";
import { fetchMyMergedPRs } from "./github";

/** One independently-fetched piece: data and error are both null while loading. */
export interface Part<T> {
  data: T | null;
  error: string | null;
}

/** The Workday page's own data, on top of the shared dashboard sources. */
export interface WorkdayExtras {
  sprint: Part<SprintTicket[]>;
  offSprint: Part<OffSprintTicket[]>;
  doneTickets: Part<DoneTicket[]>;
  /** My PRs merged since the lookback, filtered from `ticketMerged` (no request of its own). */
  merged: Part<GitHubPR[]>;
  reviewed: Part<ReviewedPR[]>;
  /** My PRs merged in the last MY_MERGED_DAYS (services/github), listed under their deck tickets. */
  ticketMerged: Part<GitHubPR[]>;
}

const LOADING = { data: null, error: null };

export const EMPTY_EXTRAS: WorkdayExtras = {
  sprint: LOADING,
  offSprint: LOADING,
  doneTickets: LOADING,
  merged: LOADING,
  reviewed: LOADING,
  ticketMerged: LOADING,
};

type StableParts = Pick<WorkdayExtras, "ticketMerged">;
type SinceParts = Pick<WorkdayExtras, "doneTickets" | "reviewed">;

/**
 * How long a loaded group is reused. The view remounts on every tab switch, so
 * without this every visit refetches everything (My PRs' merged list does the same).
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fully loaded groups, stamped with the refreshKey they were loaded under: any
 * refresh (the top-bar Refresh, a merge) bumps it app-wide, so a bump while the
 * view is unmounted still forces a refetch on the next visit. Cleared on
 * settings change.
 */
const groupCache = new Map<string, { at: number; refreshKey: number; parts: object }>();

if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, () => groupCache.clear());
}

function readGroup<T>(key: string, refreshKey: number): T | null {
  const hit = groupCache.get(key);
  if (!hit || hit.refreshKey !== refreshKey || Date.now() - hit.at >= CACHE_TTL_MS) return null;
  return hit.parts as T;
}

/** A group with a failed part isn't kept, so the next visit retries it. */
function writeGroup(key: string, refreshKey: number, parts: Record<string, Part<unknown>>): void {
  if (Object.values(parts).some((p) => p.error !== null)) return;
  groupCache.set(key, { at: Date.now(), refreshKey, parts });
}

const sinceKey = (since: Date) => `since:${since.getTime()}`;

export const cachedWorkdayStable = (refreshKey: number) =>
  readGroup<StableParts>("stable", refreshKey);
export const rememberWorkdayStable = (refreshKey: number, parts: StableParts) =>
  writeGroup("stable", refreshKey, parts);
export const cachedWorkdaySince = (since: Date, refreshKey: number) =>
  readGroup<SinceParts>(sinceKey(since), refreshKey);
export const rememberWorkdaySince = (since: Date, refreshKey: number, parts: SinceParts) =>
  writeGroup(sinceKey(since), refreshKey, parts);

/** Test helper: forget every cached group. */
export function clearWorkdayCache(): void {
  groupCache.clear();
}

/** Settle one request into a Part so a failure stays local to its section. */
async function part<T>(load: () => Promise<T>): Promise<Part<T>> {
  try {
    return { data: await load(), error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

/**
 * My merged PRs for the deck's open tickets: the shared list My PRs reads too
 * (fetchMyMergedPRs). Not aborted with the view, since another view may share
 * the request. Sprint and off-sprint come from sprintParts, not a fetch.
 */
export async function fetchWorkdayStable(
  refreshKey: number,
  now: Date = new Date(),
): Promise<StableParts> {
  return { ticketMerged: await part(() => fetchMyMergedPRs(refreshKey, now)) };
}

/** "Done since" pieces; refetched when the lookback changes. Merged PRs are derived, not fetched. */
export async function fetchWorkdaySince(since: Date, signal?: AbortSignal): Promise<SinceParts> {
  const [doneTickets, reviewed] = await Promise.all([
    part(async () => (await getDoneSince(since, signal)).tickets),
    part(async () => (await getReviewedSince(since)).reviews),
  ]);
  return { doneTickets, reviewed };
}

/** Off-sprint tickets are the ones touched in this window. */
const OFF_SPRINT_DAYS = 60;

/** The assigned-issues source, which sprint and off-sprint are split from. */
export interface AssignedIssues {
  issues: JiraIssue[];
  /**
   * The source has fetched this session. A list cached from before the sprint
   * fields were requested would otherwise split every ticket off-sprint.
   */
  loaded: boolean;
  error: string | null;
}

/**
 * Workday's sprint and off-sprint parts, split from the assigned-issues list
 * (each ticket carries its open sprint) rather than two queries of their own.
 */
export function sprintParts(
  assigned: AssignedIssues | undefined,
  now: Date,
): Pick<WorkdayExtras, "sprint" | "offSprint"> {
  if (!assigned?.loaded) {
    const pending = { data: null, error: assigned?.error ?? null };
    return { sprint: pending, offSprint: pending };
  }
  const cutoff = now.getTime() - OFF_SPRINT_DAYS * 24 * 60 * 60 * 1000;
  const sprint: SprintTicket[] = [];
  const offSprint: OffSprintTicket[] = [];
  for (const i of assigned.issues) {
    if (i.openSprint) {
      sprint.push({
        key: i.key,
        summary: i.summary,
        status: { name: i.status.name, categoryKey: i.status.statusCategory.key ?? "new" },
        sprintName: i.openSprint,
        points: i.points ?? null,
        flagged: i.flagged ?? false,
      });
    } else if (new Date(i.updated).getTime() >= cutoff) {
      offSprint.push({ ...i, flagged: i.flagged ?? false });
    }
  }
  return { sprint: { data: sprint, error: null }, offSprint: { data: offSprint, error: null } };
}
