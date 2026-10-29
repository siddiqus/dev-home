import type { DashboardIssue, OffBoardPR, Ref } from "../../../types/teams";

/** The PR fields a cockpit row shows. */
export interface PRInfo {
  title: string;
  author: string;
  createdAt: string | null;
}

/**
 * Resolves the bare refs the cockpit panels carry to the records behind them:
 * sprint issues by key, and PRs (linked to a sprint issue, or off-board) by
 * repo + number. Everything comes from the dashboard payload already loaded.
 */
export interface RefLookup {
  issue(key: string): DashboardIssue | undefined;
  pr(repo: string, number: number): PRInfo | undefined;
}

export function buildRefLookup(issues: DashboardIssue[], offBoardPRs: OffBoardPR[]): RefLookup {
  const issuesByKey = new Map(issues.map((i) => [i.key, i]));
  const prs = new Map<string, PRInfo>();
  for (const issue of issues) {
    for (const pr of issue.linkedPRs) {
      prs.set(`${pr.repo_full_name}#${pr.number}`, {
        title: pr.title,
        author: pr.author,
        createdAt: pr.createdAt ?? null,
      });
    }
  }
  for (const pr of offBoardPRs) {
    const k = `${pr.repo_full_name}#${pr.number}`;
    if (!prs.has(k)) prs.set(k, { title: pr.title, author: pr.author, createdAt: null });
  }
  return {
    issue: (key) => issuesByKey.get(key),
    pr: (repo, number) => prs.get(`${repo}#${number}`),
  };
}

/** "PLAT-12" for an issue, "cmp-server#123" for a PR. */
export function refLabel(ref: Ref): string {
  return ref.kind === "issue" ? ref.key : `${ref.repo.split("/").pop()}#${ref.number}`;
}

/** Stable React key for a ref. */
export function refKey(ref: Ref): string {
  return ref.kind === "issue" ? ref.key : `${ref.repo}#${ref.number}`;
}
