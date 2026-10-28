import React, { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { GitHubPR } from "../types";
import type { MergeMethod, MergeOptions } from "../api/github";
import { toApiError } from "../api/http/errors";
import { fetchMergeOptions, mergePR } from "../services/github";
import { Toast, useToast } from "../components/Toast";
import { readyToMerge } from "../utils/prAction";
import { repoRef } from "../views/workday/prState";
import { ViewerLoginContext } from "./ViewerLoginContext";

export type MergeOutcome = "merged" | "queued";

interface MergeApi {
  /** PRs merged or queued from here this session, by URL, until a refresh drops them. */
  done: ReadonlyMap<string, MergeOutcome>;
  /** The PR's merge options (cached), or null after toasting why they didn't load. */
  prepare(pr: GitHubPR): Promise<MergeOptions | null>;
  /** Merge (or enqueue) a PR, toasting the outcome; true once GitHub took it. */
  merge(pr: GitHubPR, options: MergeOptions, method: MergeMethod): Promise<boolean>;
}

export const MergeContext = React.createContext<MergeApi | null>(null);

/** Why GitHub refused, in its words, except a read-only token gets pointed at Settings. */
function failureReason(err: unknown): string {
  const errors: { type?: string; message?: string }[] | undefined = (err as any)?.graphqlErrors;
  if (errors?.some((e) => e.type === "FORBIDDEN"))
    return "your GitHub token can't merge here. It needs write access (see Settings)";
  if (errors?.length) return errors.map((e) => e.message).join("; ");
  return toApiError(err).message;
}

/**
 * Merging for every Merge button: one session record of what was merged (so a
 * row that re-renders before the refresh can't merge twice), one bottom toast,
 * and `onMerged` (refresh the open PRs) after each success.
 */
export function MergeProvider({
  onMerged,
  children,
}: {
  onMerged?: () => void;
  children: ReactNode;
}) {
  const [done, setDone] = useState<ReadonlyMap<string, MergeOutcome>>(() => new Map());
  const toast = useToast(3000);
  const { show } = toast;
  const onMergedRef = useRef(onMerged);
  onMergedRef.current = onMerged;

  const fail = useCallback(
    (pr: GitHubPR, err: unknown) =>
      show(`Couldn't merge ${repoRef(pr)}: ${failureReason(err)}`, {
        tone: "danger",
        durationMs: 6000,
      }),
    [show],
  );

  const prepare = useCallback(
    async (pr: GitHubPR) => {
      try {
        return await fetchMergeOptions(pr);
      } catch (err) {
        fail(pr, err);
        return null;
      }
    },
    [fail],
  );

  const merge = useCallback(
    async (pr: GitHubPR, options: MergeOptions, method: MergeMethod) => {
      try {
        await mergePR(pr, options, method);
      } catch (err) {
        fail(pr, err);
        return false;
      }
      setDone((prev) => new Map(prev).set(pr.html_url, options.queue ? "queued" : "merged"));
      show(options.queue ? `Added ${repoRef(pr)} to the merge queue` : `Merged ${repoRef(pr)}`);
      onMergedRef.current?.();
      return true;
    },
    [fail, show],
  );

  const api = useMemo(() => ({ done, prepare, merge }), [done, prepare, merge]);
  return (
    <MergeContext.Provider value={api}>
      {children}
      <Toast message={toast.message} visible={toast.visible} tone={toast.tone} />
    </MergeContext.Provider>
  );
}

/** Whether a PR gets the Merge button: my own, open and ready to merge, under a MergeProvider. */
export function useCanMerge(pr: GitHubPR): boolean {
  const api = useContext(MergeContext);
  const viewer = useContext(ViewerLoginContext);
  return (
    !!api &&
    !!viewer &&
    pr.user.login.toLowerCase() === viewer.toLowerCase() &&
    pr.state === "open" &&
    !pr.merged_at &&
    readyToMerge(pr)
  );
}
