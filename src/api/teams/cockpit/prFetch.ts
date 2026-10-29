/**
 * Pure mapping helpers for the member-PR GraphQL fetch. Kept out of the route
 * file so they can be unit-tested without importing Express/DB/graphql clients.
 */
import type { RawPR, RawReview, RawReviewRequest } from "../aggregation";
import { isPersonReview } from "./reviewQueue";

/** Map a GraphQL PullRequest node to RawPR (new fields + preserved legacy scalars). */
export function mapPullRequestNode(n: any, fallbackLogin: string): RawPR {
  const reviewNodes: any[] = n.reviews?.nodes || [];
  const reviews: RawReview[] = reviewNodes.map((r) => ({
    login: r.author?.login || "",
    typename: r.author?.__typename || "",
    state: r.state || "",
    submittedAt: r.submittedAt || null,
  }));

  const author = n.author?.login || fallbackLogin;

  // Legacy scalars — risk.ts still reads these. The first review is
  // the first by a person other than the author: bots answer within minutes
  // and an author replying in a thread files a review of their own.
  const first_review_at =
    reviews
      .filter((r) => r.submittedAt && isPersonReview(r, author))
      .map((r) => r.submittedAt!)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
  let review_state: string | null = null;
  if (reviewNodes.length > 0) {
    const hasChanges = reviewNodes.some((r) => r.state === "CHANGES_REQUESTED");
    const hasApproved = reviewNodes.some((r) => r.state === "APPROVED");
    review_state = hasChanges ? "CHANGES_REQUESTED" : hasApproved ? "APPROVED" : "COMMENTED";
  } else if ((n.reviewRequests?.totalCount || 0) > 0) {
    review_state = "REVIEW_REQUIRED";
  }

  const requestedReviewers: RawReviewRequest[] = (n.reviewRequests?.nodes || []).map((rr: any) => {
    const rev = rr.requestedReviewer || {};
    return { typename: rev.__typename || "", login: rev.login || rev.name || "" };
  });

  return {
    number: n.number,
    title: n.title,
    repo_full_name: n.repository?.nameWithOwner || "",
    html_url: n.url,
    state: (n.state || "").toLowerCase(),
    checks_status: n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state || null,
    author,
    created_at: n.createdAt,
    updatedAt: n.updatedAt || null,
    merged_at: n.mergedAt || null,
    isDraft: !!n.isDraft,
    reviewDecision: n.reviewDecision || null,
    lastCommitAt: n.commits?.nodes?.[0]?.commit?.committedDate || null,
    first_review_at,
    review_state,
    review_requested: (n.reviewRequests?.totalCount || 0) > 0,
    reviews,
    requestedReviewers,
    head_ref: n.headRefName || "",
    body: n.body || "",
  };
}

/** Union PRs, keeping the first occurrence per repo_full_name#number. */
export function dedupePRs(prs: RawPR[]): RawPR[] {
  const seen = new Map<string, RawPR>();
  for (const pr of prs) {
    const k = `${pr.repo_full_name}#${pr.number}`;
    if (!seen.has(k)) seen.set(k, pr);
  }
  return [...seen.values()];
}
