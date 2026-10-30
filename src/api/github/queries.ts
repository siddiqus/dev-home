/**
 * GraphQL query strings for the GitHub API operations in ./index.ts.
 */

/**
 * Shared GraphQL selection for a commit's check rollup. We fetch each context's
 * timestamps so mapGraphQLPr can dedupe to the newest run per check name (GitHub
 * keeps stale re-runs attached to the commit — see ./checks). Kept
 * as one constant so all PR queries stay in lockstep.
 */
export const PR_CHECKS_ROLLUP = `statusCheckRollup {
  state
  contexts(first: 100) {
    nodes {
      ... on CheckRun { name conclusion status detailsUrl startedAt completedAt }
      ... on StatusContext { context state targetUrl createdAt }
    }
  }
}`;

/**
 * Fields every PR query selects; mapGraphQLPr reads these for the base shape.
 * Omits the markdown `body`: lists don't render it, so it's fetched on demand
 * (PR_BODY_QUERY) when a description modal opens.
 */
const PR_BASE_FIELDS = `databaseId
  number
  title
  url
  state
  isDraft
  createdAt
  updatedAt
  author { login avatarUrl ... on User { name } }
  headRefName
  baseRefName
  additions
  deletions
  changedFiles
  repository { nameWithOwner }
  labels(first: 10) { nodes { name color } }`;

/**
 * Merge-readiness fields for open-PR queries (conflicts, queue, review, CI).
 * Deliberately omits `mergeStateStatus`: GitHub evaluates it per PR on read,
 * adding ~2s to a search, and nothing renders it. The head commit's
 * `committedDate` lets deriveViewerReview flag new commits since a review;
 * `headRefOid` (stored, so free) pins the Merge button to the head shown.
 */
const PR_STATUS_FIELDS = `mergeable
  headRefOid
  mergeQueueEntry { id }
  reviewDecision
  commits(last: 1) {
    nodes {
      commit {
        committedDate
        ${PR_CHECKS_ROLLUP}
      }
    }
  }`;

/**
 * One review-plate search (review requested, reviewed by, or commented on).
 * getReviews runs the three as parallel requests rather than aliases of one
 * query: GitHub resolves aliased searches one after another, so a single
 * request costs the sum of the three instead of the slowest. Reviews carry
 * submittedAt + author so deriveViewerReview can find the viewer's latest one;
 * comment authors complete the participants list (deriveParticipants).
 * Comment totals, times and authors (with __typename, which catches app bots)
 * feed the comment chips (deriveCommentData); threads take only that, a few
 * comments each and no isResolved, to keep this search light (review PRs show
 * no thread state).
 */
export const REVIEW_SEARCH_QUERY = `
  query ReviewPRs($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          ${PR_BASE_FIELDS}
          ${PR_STATUS_FIELDS}
          reviews(last: 20) {
            nodes {
              state
              submittedAt
              author { login }
            }
          }
          comments(last: 20) {
            totalCount
            nodes { createdAt author { __typename login } }
          }
          reviewThreads(last: 30) {
            totalCount
            nodes {
              comments(last: 2) {
                totalCount
                nodes { createdAt author { __typename login } }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Query for the user's own open PRs. Comment/thread selections are limited to
 * what mapGraphQLPr reads (timestamps + authors for "your turn" and the comment
 * chips, __typename to drop app bots, totalCounts for the chips' totals,
 * isResolved for the unresolved count); comment bodies are fetched separately by OWN_PR_COMMENTS_QUERY for
 * the Mentions view, keeping this list query light.
 */
export const SEARCH_MY_PRS_QUERY = `
  query SearchMyPRs($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          ${PR_BASE_FIELDS}
          ${PR_STATUS_FIELDS}
          reviews(last: 20) {
            nodes {
              state
              submittedAt
              author { login }
            }
          }
          comments(last: 20) {
            totalCount
            nodes {
              createdAt
              author { __typename login }
            }
          }
          reviewThreads(last: 50) {
            totalCount
            nodes {
              isResolved
              comments(last: 3) {
                totalCount
                nodes {
                  createdAt
                  author { __typename login }
                }
              }
            }
          }
          reviewRequests(first: 10) {
            nodes {
              requestedReviewer {
                ... on User { login }
                ... on Team { name }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Recent comments (issue + review-thread) on the user's own open PRs, with
 * bodies, for merging into GitHub mentions (see extractOwnPRComments).
 */
export const OWN_PR_COMMENTS_QUERY = `
  query OwnPRComments($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          number
          title
          state
          repository { nameWithOwner }
          comments(last: 50) {
            nodes {
              databaseId
              url
              body
              createdAt
              updatedAt
              author { login avatarUrl }
            }
          }
          reviewThreads(last: 50) {
            nodes {
              comments(last: 10) {
                nodes {
                  databaseId
                  url
                  body
                  createdAt
                  updatedAt
                  author { login avatarUrl }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * GraphQL query for org PRs with cursor-based pagination.
 */
export const SEARCH_ORG_PRS_QUERY = `
  query SearchOrgPRs($query: String!, $first: Int!, $after: String) {
    search(query: $query, type: ISSUE, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          ${PR_BASE_FIELDS}
          ${PR_STATUS_FIELDS}
          reviews(last: 20) {
            nodes {
              state
              author { login }
            }
          }
        }
      }
    }
  }
`;

/**
 * Lightweight GraphQL query for recently merged PRs (no checks needed). Takes
 * each reviewer's latest decisive review, not the full history, for "approved
 * by"; it's aliased off `reviews` so merged rows don't grow a participants list.
 */
export const SEARCH_MERGED_PRS_QUERY = `
  query SearchMergedPRs($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          ${PR_BASE_FIELDS}
          mergedAt
          mergedBy { login }
          latestOpinionatedReviews(first: 20) {
            nodes { state author { login } }
          }
        }
      }
    }
  }
`;

export const SINGLE_PR_QUERY = `
  query SinglePR($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        ${PR_BASE_FIELDS}
        body
        ${PR_STATUS_FIELDS}
        reviews(last: 20) {
          nodes { state author { login } }
        }
      }
    }
  }
`;

/** Just a PR's markdown description, lazy-loaded when its modal opens. */
export const PR_BODY_QUERY = `
  query PRBody($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        body
      }
    }
  }
`;

/**
 * A review thread's state and what the viewer may do to it (see threadStatus);
 * the comments query and the resolve mutations both select it.
 */
const THREAD_STATUS_FIELDS = `id isResolved isOutdated viewerCanResolve viewerCanUnresolve`;

export const RESOLVE_THREAD_MUTATION = `
  mutation ResolveThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { ${THREAD_STATUS_FIELDS} }
    }
  }
`;

export const UNRESOLVE_THREAD_MUTATION = `
  mutation UnresolveThread($threadId: ID!) {
    unresolveReviewThread(input: { threadId: $threadId }) {
      thread { ${THREAD_STATUS_FIELDS} }
    }
  }
`;

/**
 * A PR's review threads and conversation, lazy-loaded when its modal's Comments
 * tab opens (see mapPrComments). Takes the newest 100 of each: every thread
 * reply adds an empty review, so `first` would push out recent verdicts. Thread
 * comments stay oldest first, since a thread's opening matters most. pageInfo
 * only flags truncation.
 */
export const PR_COMMENTS_QUERY = `
  query PRComments($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(last: 100) {
          pageInfo { hasPreviousPage }
          nodes {
            ${THREAD_STATUS_FIELDS}
            path
            line
            originalLine
            comments(first: 50) {
              pageInfo { hasNextPage }
              nodes {
                databaseId
                body
                createdAt
                url
                diffHunk
                author { __typename login avatarUrl }
              }
            }
          }
        }
        comments(last: 100) {
          pageInfo { hasPreviousPage }
          nodes {
            databaseId
            body
            createdAt
            url
            author { __typename login avatarUrl }
          }
        }
        reviews(last: 100) {
          pageInfo { hasPreviousPage }
          nodes {
            databaseId
            state
            body
            submittedAt
            url
            author { __typename login avatarUrl }
          }
        }
      }
    }
  }
`;

/**
 * PRs the viewer reviewed (Workday "Done since"). Reviews carry submittedAt so
 * the caller can keep only the viewer's reviews inside the window.
 */
export const REVIEWED_SINCE_QUERY = `
  query ReviewedSince($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          ${PR_BASE_FIELDS}
          reviews(last: 30) {
            nodes {
              state
              submittedAt
              author { login }
            }
          }
        }
      }
    }
  }
`;

/**
 * What the Merge button needs, fetched on its first click: the PR's node id
 * (the mutations take it), whether its base branch merges through a queue, and
 * the merge methods the repo allows plus the one github.com preselects for the
 * viewer (their last used, else the repo default).
 */
export const MERGE_OPTIONS_QUERY = `
  query MergeOptions($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      viewerDefaultMergeMethod
      squashMergeAllowed
      rebaseMergeAllowed
      mergeCommitAllowed
      pullRequest(number: $number) {
        id
        isMergeQueueEnabled
      }
    }
  }
`;

/** Merge a PR; GitHub refuses when the head moved past `expectedHeadOid`. */
export const MERGE_PR_MUTATION = `
  mutation MergePR($pullRequestId: ID!, $method: PullRequestMergeMethod!, $expectedHeadOid: GitObjectID) {
    mergePullRequest(input: { pullRequestId: $pullRequestId, mergeMethod: $method, expectedHeadOid: $expectedHeadOid }) {
      pullRequest { id }
    }
  }
`;

/** Add a PR to its base branch's merge queue, which picks the merge method. */
export const ENQUEUE_PR_MUTATION = `
  mutation EnqueuePR($pullRequestId: ID!, $expectedHeadOid: GitObjectID) {
    enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid }) {
      mergeQueueEntry { id }
    }
  }
`;
