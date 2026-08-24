/**
 * Pure mapping helpers for the member-PR GraphQL fetch. Kept out of the route
 * file so they can be unit-tested without importing Express/DB/graphql clients.
 */
import type { RawPR, RawReview, RawReviewRequest } from "../teamAggregation";

/** Map a GraphQL PullRequest node to RawPR (new fields + preserved legacy scalars). */
export function mapPullRequestNode(n: any, fallbackLogin: string): RawPR {
  const reviewNodes: any[] = n.reviews?.nodes || [];
  const reviews: RawReview[] = reviewNodes.map((r) => ({
    login: r.author?.login || "",
    typename: r.author?.__typename || "",
    state: r.state || "",
    submittedAt: r.submittedAt || null,
  }));

  // Legacy scalars — risk.ts / prFlow.ts still read these.
  let first_review_at: string | null = null;
  let review_state: string | null = null;
  if (reviewNodes.length > 0) {
    const sorted = [...reviewNodes].sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    );
    first_review_at = sorted[0].submittedAt;
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
    author: n.author?.login || fallbackLogin,
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
