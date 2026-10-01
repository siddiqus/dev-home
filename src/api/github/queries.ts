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
 * PR node selection shared by SEARCH_PRS_QUERY and REVIEWS_QUERY, so the
 * single-search and aliased-search variants always return the same fields.
 */
const PR_SEARCH_NODE = `... on PullRequest {
  databaseId
  number
  title
  url
  state
  isDraft
  createdAt
  updatedAt
  author { login avatarUrl }
  body
  headRefName
  baseRefName
  additions
  deletions
  changedFiles
  repository { nameWithOwner }
  labels(first: 10) { nodes { name color } }
  mergeQueueEntry { id }
  mergeStateStatus
  reviewDecision
  commits(last: 1) {
    nodes {
      commit {
        ${PR_CHECKS_ROLLUP}
      }
    }
  }
}`;

export const SEARCH_PRS_QUERY = `
  query SearchPRs($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ${PR_SEARCH_NODE}
      }
    }
  }
`;

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
 * Extended query for user's own PRs. Adds review state and recent comments
 * so we can show approval status and surface comments without extra REST calls.
 */
export const SEARCH_MY_PRS_QUERY = `
  query SearchMyPRs($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          state
          isDraft
          createdAt
          updatedAt
          author { login avatarUrl }
          body
          headRefName
          baseRefName
          additions
          deletions
          changedFiles
          repository { nameWithOwner }
          labels(first: 10) { nodes { name color } }
          commits(last: 1) {
            nodes {
              commit {
                ${PR_CHECKS_ROLLUP}
              }
            }
          }
          mergeable
          mergeQueueEntry { id }
          mergeStateStatus
          reviewDecision
          reviews(last: 20) {
            nodes {
              state
              submittedAt
              author { login }
            }
          }
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
              isResolved
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
          databaseId
          number
          title
          url
          state
          isDraft
          createdAt
          updatedAt
          author { login avatarUrl }
          body
          headRefName
          baseRefName
          additions
          deletions
          changedFiles
          repository { nameWithOwner }
          labels(first: 10) { nodes { name color } }
          mergeQueueEntry { id }
          mergeStateStatus
          reviewDecision
          commits(last: 1) {
            nodes {
              commit {
                ${PR_CHECKS_ROLLUP}
              }
            }
          }
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
          databaseId
          number
          title
          url
          state
          isDraft
          createdAt
          updatedAt
          mergedAt
          mergedBy { login }
          author { login avatarUrl }
          body
          headRefName
          baseRefName
          additions
          deletions
          changedFiles
          repository { nameWithOwner }
          labels(first: 10) { nodes { name color } }
        }
      }
    }
  }
`;

export const SINGLE_PR_QUERY = `
  query SinglePR($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        databaseId
        number
        title
        url
        state
        isDraft
        createdAt
        updatedAt
        author { login avatarUrl }
        body
        headRefName
        baseRefName
        additions
        deletions
        changedFiles
        repository { nameWithOwner }
        labels(first: 10) { nodes { name color } }
        mergeQueueEntry { id }
        mergeStateStatus
        reviewDecision
        commits(last: 1) {
          nodes {
            commit {
              ${PR_CHECKS_ROLLUP}
            }
          }
        }
        reviews(last: 20) {
          nodes { state author { login } }
        }
      }
    }
  }
`;
