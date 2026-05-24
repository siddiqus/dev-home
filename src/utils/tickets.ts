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
 * Groups are ordered by the most recently updated PR in each group.
 * PRs without a ticket are each placed in their own group.
 */
export function groupByTicket(prs: GitHubPR[]): { ticket: string | null; prs: GitHubPR[] }[] {
  const sorted = [...prs].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  // Collect all PRs for each ticket key; null-ticket PRs stay individual
  const ticketMap = new Map<string, GitHubPR[]>();
  const nullTicketPRs: GitHubPR[] = [];

  for (const pr of sorted) {
    const ticket = extractTicket(pr.title);
    if (ticket === null) {
      nullTicketPRs.push(pr);
    } else {
      const existing = ticketMap.get(ticket);
      if (existing) {
        existing.push(pr);
      } else {
        ticketMap.set(ticket, [pr]);
      }
    }
  }

  // Build groups ordered by the most recently updated PR in each group.
  // Since `sorted` is already in updated_at DESC order, we can use insertion order
  // of the Map to maintain that ordering for ticket groups.
  const groups: { ticket: string | null; prs: GitHubPR[] }[] = [];

  // Interleave ticket groups and null-ticket PRs in their original sorted position.
  // Track which tickets we've already emitted.
  const emitted = new Set<string>();
  let nullIdx = 0;

  for (const pr of sorted) {
    const ticket = extractTicket(pr.title);
    if (ticket === null) {
      // Emit this individual null-ticket PR
      if (nullIdx < nullTicketPRs.length && nullTicketPRs[nullIdx] === pr) {
        groups.push({ ticket: null, prs: [pr] });
        nullIdx++;
      }
    } else if (!emitted.has(ticket)) {
      // Emit the entire ticket group at the position of its first (most recent) PR
      emitted.add(ticket);
      groups.push({ ticket, prs: ticketMap.get(ticket)! });
    }
  }

  return groups;
}
