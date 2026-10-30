import { useSyncExternalStore } from "react";
import type { GitHubPR } from "../types";

type PRRef = Pick<GitHubPR, "repo_full_name" | "number">;

/**
 * When the viewer last opened each PR's Comments tab, persisted in
 * localStorage and shared by every view (deck, PR lists, the modal). Keyed by
 * `${repo_full_name}#${number}`. A PR never opened reads as the store's start
 * time, recorded on first use, so comments from before this feature shipped
 * don't all count as new. Entries older than 90 days are pruned on write, and
 * the start time moves up to that cutoff with them, so a pruned PR never reads
 * as older than its lost marker.
 */

export const COMMENTS_READ_KEY = "devhome.commentsRead.v1";
export const COMMENTS_READ_TTL_MS = 90 * 24 * 60 * 60 * 1000;

interface CommentsRead {
  /** The store's start time: what a never-opened PR reads as. */
  since: string;
  /** PR key → when its Comments tab was last opened. */
  read: Record<string, string>;
}

const listeners = new Set<() => void>();
/** Parsed once per page load; reset when another tab writes. */
let cache: CommentsRead | null = null;

const notify = () => listeners.forEach((listener) => listener());

// Always listening, not just while subscribed: a tab sitting on another view
// must still drop its stale copy. Another tab's write (or clear, key null).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== COMMENTS_READ_KEY) return;
    cache = null;
    notify();
  });
}

const keyOf = (pr: PRRef) => `${pr.repo_full_name}#${pr.number}`;
const time = (iso: string) => new Date(iso).getTime();
const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(time(v));
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The saved store, tolerating missing/garbled JSON and dropping wrong-shape entries. */
function readSaved(): Partial<CommentsRead> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COMMENTS_READ_KEY) || "null");
    if (!isRecord(parsed)) return {};
    const read: Record<string, string> = {};
    if (isRecord(parsed.read)) {
      for (const [k, v] of Object.entries(parsed.read)) if (isTime(v)) read[k] = v;
    }
    return { since: isTime(parsed.since) ? parsed.since : undefined, read };
  } catch {
    return {};
  }
}

/** Write to localStorage, swallowing quota errors (the cache still holds it). */
function write(store: CommentsRead): void {
  try {
    localStorage.setItem(COMMENTS_READ_KEY, JSON.stringify(store));
  } catch {
    /* quota exceeded */
  }
}

/** The store, recording its start time on first use. */
function load(): CommentsRead {
  if (cache) return cache;
  const saved = readSaved();
  cache = { since: saved.since ?? new Date().toISOString(), read: saved.read ?? {} };
  if (!saved.since) write(cache);
  return cache;
}

/** ISO time the viewer last opened `pr`'s comments, else the store's start time. */
export function commentsReadAt(pr: PRRef): string {
  const { since, read } = load();
  const at = read[keyOf(pr)];
  return at && time(at) > time(since) ? at : since;
}

/** Record that the viewer opened `pr`'s comments at `at` (default now); never moves backwards. */
export function markCommentsRead(pr: PRRef, at?: string): void {
  const t = at === undefined ? Date.now() : time(at);
  // The module's storage listener keeps the cache in step with other tabs; it's
  // also all there is when storage can't be written, so don't drop it here.
  if (Number.isNaN(t) || t <= time(commentsReadAt(pr))) return;

  const cutoff = Date.now() - COMMENTS_READ_TTL_MS;
  const { since, read } = load();
  const kept: Record<string, string> = {};
  for (const [k, v] of Object.entries(read)) if (time(v) >= cutoff) kept[k] = v;
  kept[keyOf(pr)] = new Date(t).toISOString();
  cache = {
    since: time(since) < cutoff ? new Date(cutoff).toISOString() : since,
    read: kept,
  };
  write(cache);
  notify();
}

/** Listen for any marker change (this tab or another); returns an unsubscribe. */
export function subscribeCommentsRead(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** `commentsReadAt(pr)`, re-rendering when it changes; null without a PR. */
export function useCommentsReadAt(pr: PRRef | null | undefined): string | null {
  // A string snapshot, so unrelated PRs' markers don't re-render this one.
  return useSyncExternalStore(subscribeCommentsRead, () => (pr ? commentsReadAt(pr) : null));
}
