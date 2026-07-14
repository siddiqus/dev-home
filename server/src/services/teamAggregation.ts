/**
 * Pure aggregation helpers for the team dashboard. No I/O — given raw Jira
 * issues + GitHub PRs (already fetched), produce the composed dashboard shapes.
 */

import {
  extractTicketKey as extractTicketKeyShared,
  projectOfKey as projectOfKeyShared,
  type TicketSource,
} from "../../../shared/tickets";

/** Re-export the shared ticket parser. */
export { extractTicketKey, projectOfKey, type TicketSource } from "../../../shared/tickets";

/** Convert a RawPR to a TicketSource for the parser. */
export function prSource(pr: RawPR): TicketSource {
  return { title: pr.title, branch: pr.head_ref, body: pr.body };
}

export interface RawPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  state: string;
  checks_status: string | null;
  author: string;
  created_at: string;
  // --- cockpit enrichment (populated by the fetch layer) ---
  merged_at?: string | null;
  /** ISO timestamp of the first review submitted on the PR, if any. */
  first_review_at?: string | null;
  /** Rollup: APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | COMMENTED | null */
  review_state?: string | null;
  /** True when the PR has requested reviewers (review has been asked for). */
  review_requested?: boolean;
  /** PR head branch name, for ticket-key extraction. */
  head_ref?: string;
  /** PR body, for ticket-key extraction. */
  body?: string;
}

export interface RawIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string; // "new" | "indeterminate" | "done"
  assigneeAccountId: string | null;
  assigneeName: string | null;
  epicKey: string | null;
  epicName: string | null;
  // --- cockpit enrichment (populated by the fetch layer) ---
  createdAt?: string | null;
  updatedAt?: string | null;
  dueDate?: string | null;
  storyPoints?: number | null;
}

export interface RosterEntry {
  accountId: string;
  displayName: string;
  githubUsername: string;
}

/**
 * Partition PRs into "off-board": PRs whose ticket key is NOT in the sprint
 * issue set (includes PRs with no ticket, and tickets from other projects).
 * `sprintKeys` is the set of issue keys currently in scope.
 */
export function partitionOffBoardPRs(prs: RawPR[], sprintKeys: Set<string>) {
  const offBoard = [];
  for (const pr of prs) {
    const key = extractTicketKeyShared(prSource(pr));
    if (key && sprintKeys.has(key)) continue; // in-sprint, skip
    offBoard.push({
      number: pr.number,
      title: pr.title,
      repo_full_name: pr.repo_full_name,
      html_url: pr.html_url,
      author: pr.author,
      state: pr.state,
      ticketKey: key,
      ticketProject: key ? projectOfKeyShared(key) : null,
    });
  }
  return offBoard;
}

/**
 * Group issues by epic. Issues with no epic roll into a synthetic bucket
 * with key=null, name="No epic". `staleKeys`, when provided, is the set of
 * issue keys currently considered stalled — used to surface a per-epic risk chip.
 */
export function groupByEpic(issues: RawIssue[], staleKeys?: Set<string>) {
  const map = new Map<
    string | null,
    {
      key: string | null;
      name: string;
      total: number;
      done: number;
      stalled: number;
      issueKeys: string[];
    }
  >();
  for (const issue of issues) {
    const epicKey = issue.epicKey ?? null;
    const bucketKey = epicKey;
    let bucket = map.get(bucketKey);
    if (!bucket) {
      bucket = {
        key: epicKey,
        name: epicKey ? issue.epicName || epicKey : "No epic",
        total: 0,
        done: 0,
        stalled: 0,
        issueKeys: [],
      };
      map.set(bucketKey, bucket);
    }
    bucket.total += 1;
    if (issue.statusCategory === "done") bucket.done += 1;
    if (staleKeys?.has(issue.key)) bucket.stalled += 1;
    bucket.issueKeys.push(issue.key);
  }
  // Real epics first (by total desc), "No epic" last.
  return [...map.values()].sort((a, b) => {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return b.total - a.total;
  });
}

export type StatusBucket = "new" | "indeterminate" | "inReview" | "done";

/**
 * Classify an issue into a display bucket. Jira only exposes 3 status
 * *categories* (new / indeterminate / done), but we split the in-progress
 * category into "In Review" (any status whose name contains "review") and the
 * rest, so the bars can show To Do / In Progress / In Review / Done.
 */
export function classifyStatus(issue: RawIssue): StatusBucket {
  if (issue.statusCategory === "done") return "done";
  if (issue.statusCategory === "indeterminate") {
    return /review/i.test(issue.status) ? "inReview" : "indeterminate";
  }
  return /review/i.test(issue.status) ? "inReview" : "new";
}
