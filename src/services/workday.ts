import type { DoneTicket, GitHubPR, OffSprintTicket, ReviewedPR, SprintTicket } from "../types";
import { getDoneSince, getOffSprintTickets, getSprintTickets } from "../api/jira/workday";
import { getMergedPrs, getReviewedSince } from "../api/github";
import { SETTINGS_EVENT } from "./config";

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
  merged: Part<GitHubPR[]>;
  reviewed: Part<ReviewedPR[]>;
  /** My PRs merged in the last TICKET_MERGED_DAYS, listed under their deck tickets. */
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

/**
 * How far back the deck looks for merged PRs to list under open tickets: long
 * enough to cover a ticket that stays open well after its PRs merged.
 */
export const TICKET_MERGED_DAYS = 60;
/** GitHub's per-search maximum. */
const TICKET_MERGED_MAX = 100;

type StableParts = Pick<WorkdayExtras, "sprint" | "offSprint" | "ticketMerged">;
type SinceParts = Pick<WorkdayExtras, "doneTickets" | "merged" | "reviewed">;

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
 * Sprint membership, off-sprint tickets and my merged PRs for the deck's open
 * tickets; independent of the lookback.
 */
export async function fetchWorkdayStable(
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<StableParts> {
  const since = new Date(now.getTime() - TICKET_MERGED_DAYS * 24 * 60 * 60 * 1000);
  const [sprint, offSprint, ticketMerged] = await Promise.all([
    part(async () => (await getSprintTickets(signal)).tickets),
    part(async () => (await getOffSprintTickets(signal)).issues),
    part(
      async () =>
        (await getMergedPrs({ scope: "user", since, first: TICKET_MERGED_MAX })).prs as GitHubPR[],
    ),
  ]);
  return { sprint, offSprint, ticketMerged };
}

/** "Done since" pieces; refetched when the lookback changes. */
export async function fetchWorkdaySince(since: Date, signal?: AbortSignal): Promise<SinceParts> {
  const [doneTickets, merged, reviewed] = await Promise.all([
    part(async () => (await getDoneSince(since, signal)).tickets),
    part(async () => (await getMergedPrs({ scope: "user", since })).prs as GitHubPR[]),
    part(async () => (await getReviewedSince(since)).reviews),
  ]);
  return { doneTickets, merged, reviewed };
}
