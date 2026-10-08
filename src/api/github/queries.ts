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
  author { login avatarUrl }
  headRefName
  baseRefName
  additions
  deletions
  changedFiles
  repository { nameWithOwner }
  labels(first: 10) { nodes { name color } }`;

/** Merge-readiness fields for open-PR queries (conflicts, queue, review, CI). */
const PR_STATUS_FIELDS = `mergeable
  mergeQueueEntry { id }
  mergeStateStatus
  reviewDecision
  commits(last: 1) {
    nodes {
      commit {
        ${PR_CHECKS_ROLLUP}
      }
    }
  }`;

/**
 * PR node selection for each aliased search in REVIEWS_QUERY, defined once so
 * the three searches always return the same fields.
 */
const PR_SEARCH_NODE = `... on PullRequest {
  ${PR_BASE_FIELDS}
  ${PR_STATUS_FIELDS}
}`;

/**
 * The three review-plate searches (review requested, reviewed by, commented on)
 * as aliases of one query, so getReviews costs a single request.
 */
export const REVIEWS_QUERY = `
  query ReviewPRs(
    $requestedQuery: String!
    $reviewedQuery: String!
    $commentedQuery: String!
    $first: Int!
  ) {
    requested: search(query: $requestedQuery, type: ISSUE, first: $first) {
      nodes {
        ${PR_SEARCH_NODE}
      }
    }
    reviewedBy: search(query: $reviewedQuery, type: ISSUE, first: $first) {
      nodes {
        ${PR_SEARCH_NODE}
      }
    }
    commented: search(query: $commentedQuery, type: ISSUE, first: $first) {
      nodes {
        ${PR_SEARCH_NODE}
      }
    }
  }
`;

/**
 * Query for the user's own open PRs. Comment/thread selections are limited to
 * what mapGraphQLPr reads (timestamps + authors for "your turn", isResolved for
 * the unresolved count); comment bodies are fetched separately by
 * OWN_PR_COMMENTS_QUERY for the Mentions view, keeping this list query light.
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
            nodes {
              createdAt
              author { login }
            }
          }
          reviewThreads(last: 50) {
            nodes {
              isResolved
              comments(last: 3) {
                nodes {
                  createdAt
                  author { login }
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
 * Lightweight GraphQL query for recently merged PRs (no checks/reviews needed).
 */
export const SEARCH_MERGED_PRS_QUERY = `
  query SearchMergedPRs($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          ${PR_BASE_FIELDS}
          mergedAt
          mergedBy { login }
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
