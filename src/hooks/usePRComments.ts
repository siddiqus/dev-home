import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubPR, PRComments, PRReviewThread, PRThreadStatus } from "../types";
import { fetchPRComments, setPRThreadResolved, withThreadStatus } from "../services/github";

export interface PRCommentsState {
  comments: PRComments | null;
  loading: boolean;
  error: boolean;
  /**
   * Resolve or unresolve a thread: shown at once, then settled by GitHub's
   * answer; put back to what GitHub last confirmed (and rejected) if it refuses.
   */
  setThreadResolved: (threadId: string, resolved: boolean) => Promise<void>;
}

const statusOf = ({ state, can_resolve, can_unresolve }: PRReviewThread): PRThreadStatus => ({
  state,
  can_resolve,
  can_unresolve,
});

/**
 * Review threads and conversation for an open PR modal, fetched once `enabled`
 * (the Comments tab is shown) and cached session-wide by fetchPRComments. Once
 * loaded for a PR, the result stays available even if `enabled` turns false, so
 * switching tabs neither drops it nor flashes a spinner.
 */
export function usePRComments(pr: GitHubPR | null | undefined, enabled: boolean): PRCommentsState {
  const key = pr ? `${pr.repo_full_name}#${pr.number}@${pr.updated_at}` : null;
  // `comments` is null when the fetch failed.
  const [loaded, setLoaded] = useState<{ key: string; comments: PRComments | null } | null>(null);
  const current = loaded?.key === key ? loaded.comments : null;

  // The latest comments, for writes started from an older render's callback
  // (the toast's Undo is created before the Resolve it undoes lands).
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
  });
  // Per `key|threadId`: the latest resolve/unresolve, which the next one waits
  // for (so an Undo can't reach GitHub before its Resolve), and the status
  // GitHub last confirmed, which a refused write goes back to.
  const pending = useRef(new Map<string, Promise<void>>());
  const confirmed = useRef(new Map<string, PRThreadStatus>());

  useEffect(() => {
    // Already loaded: don't reload the cache over a write that's in flight.
    if (!key || !pr || !enabled || latest.current) return;
    let cancelled = false;
    fetchPRComments(pr)
      .catch(() => null)
      .then((comments) => {
        if (!cancelled) setLoaded({ key, comments });
      });
    return () => {
      cancelled = true;
    };
    // `key` captures everything about `pr` that the fetch depends on.
  }, [key, enabled]);

  const setThreadResolved = useCallback(
    (threadId: string, resolved: boolean): Promise<void> => {
      const thread = latest.current?.threads.find((t) => t.id === threadId);
      if (!pr || !key || !thread) return Promise.resolve();
      const id = `${key}|${threadId}`;
      if (!confirmed.current.has(id)) confirmed.current.set(id, statusOf(thread));
      // Only ever patches this PR's comments, even if another PR has opened since.
      const patch = (status: Partial<PRThreadStatus>) =>
        setLoaded((l) =>
          l?.key === key && l.comments
            ? { key, comments: withThreadStatus(l.comments, threadId, status) }
            : l,
        );
      // An unresolved thread shows as open until GitHub says whether it's outdated.
      // Whoever may resolve a thread may unresolve it, so the reverse is offered too.
      patch(
        resolved
          ? { state: "resolved", can_unresolve: true }
          : { state: "open", can_resolve: true },
      );
      // Only the latest write for a thread touches what's shown; earlier answers
      // just record what GitHub confirmed.
      const isLatest = () => pending.current.get(id) === run;
      const run: Promise<void> = (pending.current.get(id) ?? Promise.resolve())
        .catch(() => {})
        .then(() => setPRThreadResolved(pr, threadId, resolved))
        .then(
          (status) => {
            confirmed.current.set(id, status);
            if (isLatest()) patch(status);
          },
          (err) => {
            if (isLatest()) patch(confirmed.current.get(id)!);
            throw err;
          },
        );
      pending.current.set(id, run);
      return run;
    },
    [pr, key],
  );

  if (!key) return { comments: null, loading: false, error: false, setThreadResolved };
  // Derived from whether the result matches the current key, so a cancelled
  // request can never leave a stuck spinner or show another PR's comments.
  if (loaded?.key === key) {
    return loaded.comments
      ? { comments: loaded.comments, loading: false, error: false, setThreadResolved }
      : { comments: null, loading: false, error: true, setThreadResolved };
  }
  return { comments: null, loading: enabled, error: false, setThreadResolved };
}
