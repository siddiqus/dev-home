import React, { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { GitHubPR } from "../types";
import type { MergeMethod, MergeOptions } from "../api/github";
import { toApiError } from "../api/http/errors";
import { approvePR, fetchMergeOptions, mergePR } from "../services/github";
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
  /** PRs approved from here this session, by URL, until a refresh shows the approval. */
  approved: ReadonlySet<string>;
  /** Approve a PR, toasting the outcome; true once GitHub took it. */
  approve(pr: GitHubPR): Promise<boolean>;
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

/** Why GitHub refused a review, except a token without the permission gets pointed at Settings. */
function approveFailureReason(err: unknown): string {
  const apiError = toApiError(err);
  if (apiError.status === 403 && /not accessible/i.test(apiError.message))
    return "your GitHub token can't review here. It needs Pull requests: write (see Settings)";
  return apiError.message;
}

/**
 * GitHub writes for every Merge and Approve button: one session record of what
 * was merged or approved (so a button that re-renders before the refresh can't
 * do it twice), one bottom toast, and a refresh after each success: `onMerged`
 * (the open PRs) or `onApproved` (the reviews).
 */
export function MergeProvider({
  onMerged,
  onApproved,
  children,
}: {
  onMerged?: () => void;
  onApproved?: () => void;
  children: ReactNode;
}) {
  const [done, setDone] = useState<ReadonlyMap<string, MergeOutcome>>(() => new Map());
  const [approved, setApproved] = useState<ReadonlySet<string>>(() => new Set());
  const toast = useToast(3000);
  const { show } = toast;
  const onMergedRef = useRef(onMerged);
  onMergedRef.current = onMerged;
  const onApprovedRef = useRef(onApproved);
  onApprovedRef.current = onApproved;

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

  const approve = useCallback(
    async (pr: GitHubPR) => {
      try {
        await approvePR(pr);
      } catch (err) {
        show(`Couldn't approve ${repoRef(pr)}: ${approveFailureReason(err)}`, {
          tone: "danger",
          durationMs: 6000,
        });
        return false;
      }
      setApproved((prev) => new Set(prev).add(pr.html_url));
      show(`Approved ${repoRef(pr)}`);
      onApprovedRef.current?.();
      return true;
    },
    [show],
  );

  const api = useMemo(
    () => ({ done, prepare, merge, approved, approve }),
    [done, prepare, merge, approved, approve],
  );
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

/**
 * Whether a PR gets the Approve button: someone else's open, non-draft PR that
 * my latest review hasn't approved, under a MergeProvider. Not limited to PRs
 * naming me as reviewer: a request to one of my teams names only the team.
 */
export function useCanApprove(pr: GitHubPR): boolean {
  const api = useContext(MergeContext);
  const viewer = useContext(ViewerLoginContext);
  return (
    !!api &&
    !!viewer &&
    pr.user.login.toLowerCase() !== viewer.toLowerCase() &&
    pr.state === "open" &&
    !pr.merged_at &&
    !pr.draft &&
    pr.viewer_review_state !== "APPROVED"
  );
}
