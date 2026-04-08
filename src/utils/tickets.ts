import { GitHubPR } from "../types";

/**
 * Extract a Jira ticket key from a PR title.
 * Matches "PROJ-123 ..." at the start or "[PROJ-123]" anywhere in the title.
 */
export function extractTicket(title: string): string | null {
  const startMatch = title.match(/^([A-Z]+-\d+)/i);
  if (startMatch) return startMatch[1].toUpperCase();
  const bracketMatch = title.match(/\[([a-zA-Z]+-\d+)\]/i);
  if (bracketMatch) return bracketMatch[1].toUpperCase();
  return null;
}

/**
 * Group PRs by their Jira ticket key, preserving updated_at DESC order.
 */
export function groupByTicket(prs: GitHubPR[]): { ticket: string | null; prs: GitHubPR[] }[] {
  const sorted = [...prs].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  const groups: { ticket: string | null; prs: GitHubPR[] }[] = [];
  for (const pr of sorted) {
    const ticket = extractTicket(pr.title);
    const last = groups[groups.length - 1];
    if (last && last.ticket === ticket) {
      last.prs.push(pr);
    } else {
      groups.push({ ticket, prs: [pr] });
    }
  }

  return groups;
}
