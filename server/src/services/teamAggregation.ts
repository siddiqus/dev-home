/**
 * Pure aggregation helpers for the team dashboard. No I/O — given raw Jira
 * issues + GitHub PRs (already fetched), produce the composed dashboard shapes.
 */

/** Extract a Jira key from a PR title: "PROJ-123 ..." or "[PROJ-123]". */
export function extractTicketKey(title: string): string | null {
  const startMatch = title.match(/^([A-Z]+-\d+)/i);
  if (startMatch) return startMatch[1].toUpperCase();
  const bracketMatch = title.match(/\[([a-zA-Z]+-\d+)\]/i);
  if (bracketMatch) return bracketMatch[1].toUpperCase();
  return null;
}

/** Project key portion of a Jira key, e.g. "CCP-12" -> "CCP". */
export function projectOfKey(key: string): string {
  const m = key.match(/^([A-Z]+)-\d+$/i);
  return m ? m[1].toUpperCase() : "";
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
}

export interface RosterEntry {
  accountId: string;
  displayName: string;
  githubUsername: string;
}

/**
 * Attach linked PRs to each issue. A PR links to an issue if the ticket key
 * parsed from its title equals the issue key.
 */
export function linkPRsToIssues(issues: RawIssue[], prs: RawPR[]) {
  const byKey = new Map<string, RawPR[]>();
  for (const pr of prs) {
    const key = extractTicketKey(pr.title);
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(pr);
    byKey.set(key, list);
  }
  return issues.map((issue) => ({
    ...issue,
    linkedPRs: (byKey.get(issue.key) || []).map((pr) => ({
      number: pr.number,
      title: pr.title,
      repo_full_name: pr.repo_full_name,
      html_url: pr.html_url,
      state: pr.state,
      checks_status: pr.checks_status,
      author: pr.author,
    })),
  }));
}

/**
 * Partition PRs into "off-board": PRs whose ticket key is NOT in the sprint
 * issue set (includes PRs with no ticket, and tickets from other projects).
 * `sprintKeys` is the set of issue keys currently in scope.
 */
export function partitionOffBoardPRs(prs: RawPR[], sprintKeys: Set<string>) {
  const offBoard = [];
  for (const pr of prs) {
    const key = extractTicketKey(pr.title);
    if (key && sprintKeys.has(key)) continue; // in-sprint, skip
    offBoard.push({
      number: pr.number,
      title: pr.title,
      repo_full_name: pr.repo_full_name,
      html_url: pr.html_url,
      author: pr.author,
      state: pr.state,
      ticketKey: key,
      ticketProject: key ? projectOfKey(key) : null,
    });
  }
  return offBoard;
}

/**
 * Group issues by epic. Issues with no epic roll into a synthetic bucket
 * with key=null, name="No epic".
 */
export function groupByEpic(issues: RawIssue[]) {
  const map = new Map<string | null, { key: string | null; name: string; total: number; done: number; issueKeys: string[] }>();
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
        issueKeys: [],
      };
      map.set(bucketKey, bucket);
    }
    bucket.total += 1;
    if (issue.statusCategory === "done") bucket.done += 1;
    bucket.issueKeys.push(issue.key);
  }
  // Real epics first (by total desc), "No epic" last.
  return [...map.values()].sort((a, b) => {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return b.total - a.total;
  });
}

/** Per-member ticket + PR counts and status breakdown. */
export function computeWorkload(roster: RosterEntry[], issues: RawIssue[], prs: RawPR[]) {
  return roster.map((r) => {
    const memberIssues = issues.filter((i) => i.assigneeAccountId === r.accountId);
    const byStatus = { new: 0, indeterminate: 0, done: 0 };
    for (const i of memberIssues) {
      if (i.statusCategory === "done") byStatus.done += 1;
      else if (i.statusCategory === "indeterminate") byStatus.indeterminate += 1;
      else byStatus.new += 1;
    }
    const prCount = prs.filter(
      (p) => p.author.toLowerCase() === r.githubUsername.toLowerCase(),
    ).length;
    return {
      accountId: r.accountId,
      displayName: r.displayName,
      githubUsername: r.githubUsername,
      ticketCount: memberIssues.length,
      prCount,
      byStatus,
    };
  });
}
