/**
 * Review Queue: per open PR, decide whose court the ball is in and why.
 * Pure — no I/O. Lean model: "engaged" means a person submitted a review
 * (comments are not fetched); the author's last action is their last commit.
 * Bots (__typename "Bot") and Team review requests never count as a reviewer.
 */
import type { RawPR, RawReview, RawReviewRequest } from "../teamAggregation";
import type { ReviewQueueEntry } from "./types";

/** v1 ignore list. Bots are excluded structurally via __typename, not by login. */
const IGNORED_LOGINS = new Set<string>();

function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function isPersonReview(r: RawReview, author: string): boolean {
  return r.typename === "User" && r.login !== author && !IGNORED_LOGINS.has(r.login);
}

function buildReviewers(personReviews: RawReview[], personRequests: RawReviewRequest[]): string[] {
  const reviewed = [...personReviews]
    .sort((a, b) => (ms(b.submittedAt) || 0) - (ms(a.submittedAt) || 0))
    .map((r) => r.login);
  const uniqueReviewed = [...new Set(reviewed)];
  const reviewedSet = new Set(uniqueReviewed);
  const pending = [...new Set(personRequests.map((q) => q.login))].filter((l) => !reviewedSet.has(l));
  return [...uniqueReviewed, ...pending];
}

function toEntry(pr: RawPR): ReviewQueueEntry {
  const author = pr.author;
  const reviews = pr.reviews ?? [];
  const requests = pr.requestedReviewers ?? [];
  const personReviews = reviews.filter((r) => isPersonReview(r, author));
  const personRequests = requests.filter((q) => q.typename === "User");

  const engaged = personReviews.length > 0;
  const hasReviewer = engaged || personRequests.length > 0;

  const reviewerLastActedAt = personReviews.reduce<number>((max, r) => {
    const t = ms(r.submittedAt);
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, -Infinity);
  const authorCreated = ms(pr.created_at);
  const authorCommit = ms(pr.lastCommitAt);
  const authorLastActedAt = Math.max(
    Number.isNaN(authorCommit) ? -Infinity : authorCommit,
    Number.isNaN(authorCreated) ? -Infinity : authorCreated,
  );
  const approved = pr.reviewDecision === "APPROVED";

  let state: ReviewQueueEntry["state"];
  let reason: string;
  if (pr.isDraft) {
    state = "author";
    reason = "draft";
  } else if (!hasReviewer) {
    state = "none";
    reason = "no reviewer assigned";
  } else if (pr.reviewDecision === "CHANGES_REQUESTED") {
    state = "author";
    reason = "changes requested";
  } else if (engaged && reviewerLastActedAt > authorLastActedAt) {
    state = "author";
    reason = approved ? "approved — ready to merge" : "reviewer reviewed, awaiting author";
  } else if (approved) {
    state = "author";
    reason = "approved — ready to merge";
  } else if (engaged) {
    state = "reviewer";
    reason = "author responded, awaiting re-review";
  } else {
    state = "reviewer";
    reason = "awaiting first review";
  }

  return {
    number: pr.number,
    repo_full_name: pr.repo_full_name,
    title: pr.title,
    html_url: pr.html_url,
    author,
    state,
    reason,
    reviewers: buildReviewers(personReviews, personRequests),
    checks_status: pr.checks_status,
    createdAt: pr.created_at ?? null,
    updatedAt: pr.updatedAt ?? null,
  };
}

export function computeReviewQueue(prs: RawPR[]): ReviewQueueEntry[] {
  return prs
    .filter((p) => p.state === "open")
    .map(toEntry)
    .sort((a, b) => (ms(a.updatedAt) || 0) - (ms(b.updatedAt) || 0));
}
