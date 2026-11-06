import React, { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { GitHubPR } from "../types";
import type { MergeMethod, MergeOptions } from "../api/github";
import { toApiError } from "../api/http/errors";
import { approvePR, fetchMergeOptions, mergePR, requestPRReviewers } from "../services/github";
import { Toast, useToast } from "../components/Toast";
import { RequestReviewModal, type PickedReviewer } from "../components/RequestReviewModal";
import { readyToMerge, reviewStep, type ReviewStep } from "../utils/prAction";
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
  /**
   * PRs with reviews requested from here this session: URL → the PR's
   * `updated_at` then, so "Requested" only shows until fresh data arrives.
   */
  reviewRequested: ReadonlyMap<string, string>;
  /** Opens the reviewer picker for one of my PRs. */
  openReviewRequest(pr: GitHubPR): void;
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

/** Why GitHub refused a review write, except a token without the permission gets pointed at Settings. */
function reviewFailureReason(err: unknown, cant: string): string {
  const apiError = toApiError(err);
  if (apiError.status === 403 && /not accessible/i.test(apiError.message))
    return `your GitHub token can't ${cant} here. It needs Pull requests: write (see Settings)`;
  return apiError.message;
}

/** "abu", "abu and Frontend", "abu, rkhan and Frontend", "abu, rkhan and 2 others". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/**
 * GitHub writes for every Merge, Approve and Request review button: one session
 * record of what was done (so a button that re-renders before the refresh can't
 * do it twice), one bottom toast, one reviewer picker, and a refresh after each
 * success: `onMerged` (the open PRs), `onApproved` (the reviews) or
 * `onReviewRequested` (the open PRs).
 */
export function MergeProvider({
  onMerged,
  onApproved,
  onReviewRequested,
  children,
}: {
  onMerged?: () => void;
  onApproved?: () => void;
  onReviewRequested?: () => void;
  children: ReactNode;
}) {
  const [done, setDone] = useState<ReadonlyMap<string, MergeOutcome>>(() => new Map());
  const [approved, setApproved] = useState<ReadonlySet<string>>(() => new Set());
  const [reviewRequested, setReviewRequested] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  // The PR the reviewer picker is for; `seq` remounts the picker per open, so it starts fresh.
  const [picker, setPicker] = useState<{ pr: GitHubPR; open: boolean; seq: number } | null>(null);
  const toast = useToast(3000);
  const { show } = toast;
  const onMergedRef = useRef(onMerged);
  onMergedRef.current = onMerged;
  const onApprovedRef = useRef(onApproved);
  onApprovedRef.current = onApproved;
  const onReviewRequestedRef = useRef(onReviewRequested);
  onReviewRequestedRef.current = onReviewRequested;

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
        show(`Couldn't approve ${repoRef(pr)}: ${reviewFailureReason(err, "review")}`, {
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

  const requestReview = useCallback(
    async (pr: GitHubPR, picked: PickedReviewer[]) => {
      const ids = (kind: PickedReviewer["kind"]) =>
        picked.filter((p) => p.kind === kind).map((p) => p.id);
      try {
        await requestPRReviewers(pr, { users: ids("user"), teams: ids("team") });
      } catch (err) {
        // The picker stays open and says why: a toast behind a modal is hidden from screen readers.
        return reviewFailureReason(err, "request reviews");
      }
      setReviewRequested((prev) => new Map(prev).set(pr.html_url, pr.updated_at));
      show(`Requested a review from ${nameList(picked.map((p) => p.label))} on ${repoRef(pr)}`);
      onReviewRequestedRef.current?.();
      return null;
    },
    [show],
  );

  const openReviewRequest = useCallback(
    (pr: GitHubPR) => setPicker((prev) => ({ pr, open: true, seq: (prev?.seq ?? 0) + 1 })),
    [],
  );
  const closeReviewRequest = useCallback(
    () => setPicker((prev) => prev && { ...prev, open: false }),
    [],
  );

  const api = useMemo(
    () => ({ done, prepare, merge, approved, approve, reviewRequested, openReviewRequest }),
    [done, prepare, merge, approved, approve, reviewRequested, openReviewRequest],
  );
  return (
    <MergeContext.Provider value={api}>
      {children}
      {picker && (
        <RequestReviewModal
          key={picker.seq}
          pr={picker.pr}
          show={picker.open}
          onHide={closeReviewRequest}
          onSubmit={(picked) => requestReview(picker.pr, picked)}
        />
      )}
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

/**
 * Whether my PR's next step is asking for a review, so its chip becomes the
 * Request review button: "request" (nobody asked yet) or "rerequest" (reviewed
 * and nobody asked now). Null otherwise, and outside a MergeProvider.
 */
export function useReviewStep(pr: GitHubPR): ReviewStep | null {
  const api = useContext(MergeContext);
  const viewer = useContext(ViewerLoginContext);
  if (!api || !viewer || pr.user.login.toLowerCase() !== viewer.toLowerCase()) return null;
  if (pr.state !== "open" || pr.merged_at) return null;
  return reviewStep(pr);
}
