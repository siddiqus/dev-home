import type { GitHubPR } from "../../types";
import type { DeckData } from "./types";
import { normalizeNoteRef } from "../../utils/prNotes";

export type LinkTarget =
  | { kind: "pr"; repo: string; number: number; url: string }
  | { kind: "ticket"; key: string };

export interface SearchResult {
  ticketId: string | null;
  pr: GitHubPR | null;
  ticketKey: string | null;
  label: string;
  sub: string;
  closed: boolean;
  score: number;
  external?: LinkTarget;
}

/**
 * Parse a link from a query string. Returns a LinkTarget if the query is a
 * GitHub PR URL (via normalizeNoteRef), a Jira URL, or a bare Jira key.
 */
export function parseLink(query: string): LinkTarget | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // GitHub PR URL - try an extended pattern that handles sub-paths like /files, /commits
  // Pattern: https://github.com/owner/repo/pull/123[/anything][?query][#hash]
  const githubExtendedPattern =
    /^https?:\/\/github\.com\/([^\s/]+)\/([^\s/]+)\/pull\/(\d+)(?:\/[^\s?#]*)?(?:\?[^#]*)?(?:#.*)?$/i;
  const githubMatch = trimmed.match(githubExtendedPattern);
  if (githubMatch) {
    const [, owner, repo, numStr] = githubMatch;
    const repoFullName = `${owner}/${repo}`;
    return {
      kind: "pr",
      repo: repoFullName,
      number: parseInt(numStr, 10),
      url: `https://github.com/${repoFullName}/pull/${numStr}`,
    };
  }

  // Also try normalizeNoteRef for canonical forms like "owner/repo#123"
  const normalized = normalizeNoteRef(trimmed);
  if (normalized) {
    // normalized is "owner/repo#number"
    const match = normalized.match(/^([^/]+\/[^#]+)#(\d+)$/);
    if (match) {
      const [, repo, numStr] = match;
      return {
        kind: "pr",
        repo,
        number: parseInt(numStr, 10),
        url: `https://github.com/${repo}/pull/${numStr}`,
      };
    }
  }

  // Jira URLs: /browse/KEY or ?selectedIssue=KEY
  const browseMatch = trimmed.match(/\/browse\/([A-Z]+-\d+)/i);
  if (browseMatch) {
    return { kind: "ticket", key: browseMatch[1].toUpperCase() };
  }

  const selectedIssueMatch = trimmed.match(/[?&]selectedIssue=([A-Z]+-\d+)/i);
  if (selectedIssueMatch) {
    return { kind: "ticket", key: selectedIssueMatch[1].toUpperCase() };
  }

  // Bare Jira key: PROJECT-123
  if (/^[A-Z]+-\d+$/i.test(trimmed)) {
    return { kind: "ticket", key: trimmed.toUpperCase() };
  }

  return null;
}

/**
 * Fuzzy search over the deck. Returns results sorted by score (highest first).
 * Exact key or PR number matches rank first. Closed tabs are included with
 * `closed: true`. A parsed link not in the deck returns a single result with
 * `external` set.
 */
export function searchDeck(query: string, deck: DeckData): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Check if the query is a link
  const linkTarget = parseLink(trimmed);

  // Collect all searchable items
  const allTickets = [...deck.current, ...deck.open, ...deck.closed];
  const results: SearchResult[] = [];

  for (const ticket of allTickets) {
    const isClosed = deck.closed.includes(ticket);

    // For each ticket, we can match on:
    // - ticket key
    // - ticket title
    // For each PR on the ticket:
    // - PR number (#1199, 1199, repo#1199)
    // - PR title
    // - author login
    // - requested reviewers
    // - repo name
    // - branch name

    // Check for ticket-level match
    const ticketScore = fuzzyMatch(trimmed, [ticket.key || "", ticket.title]);

    // Check each PR
    for (const deckPR of ticket.prs) {
      const pr = deckPR.pr;

      // PR number matches - these should rank highest
      const prNumberScore = fuzzyMatch(trimmed, [
        `#${pr.number}`,
        `${pr.number}`,
        `${pr.repo_full_name.split("/")[1]}#${pr.number}`, // repo#123
      ]);

      // Other PR fields
      const prOtherScore = fuzzyMatch(trimmed, [
        pr.repo_full_name,
        pr.title,
        pr.user.login,
        pr.head.ref,
        ...(pr.requested_reviewers || []),
      ]);

      // Boost PR number matches to rank higher than title/other matches
      const prScore = prNumberScore > 0 ? prNumberScore + 10000 : prOtherScore;
      const score = Math.max(ticketScore, prScore);

      if (score > 0) {
        results.push({
          ticketId: ticket.id,
          pr: pr,
          ticketKey: ticket.key,
          label: `#${pr.number} ${pr.title}`,
          sub: ticket.key ? `${ticket.key} · ${ticket.title}` : "",
          closed: isClosed,
          score,
        });
      }
    }

    // If the ticket has no PRs but matches, include it
    if (ticket.prs.length === 0 && ticketScore > 0) {
      results.push({
        ticketId: ticket.id,
        pr: null,
        ticketKey: ticket.key,
        label: ticket.title,
        sub: ticket.key || "",
        closed: isClosed,
        score: ticketScore,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // If we have a link target, check if it's in the results
  if (linkTarget) {
    const foundIndex = results.findIndex((r) => {
      if (linkTarget.kind === "pr" && r.pr) {
        return r.pr.repo_full_name === linkTarget.repo && r.pr.number === linkTarget.number;
      }
      if (linkTarget.kind === "ticket" && r.ticketKey) {
        return r.ticketKey === linkTarget.key;
      }
      return false;
    });

    if (foundIndex === -1) {
      // Not in the deck - return only the external result
      return [
        {
          ticketId: null,
          pr: null,
          ticketKey: linkTarget.kind === "ticket" ? linkTarget.key : null,
          label:
            linkTarget.kind === "pr" ? `${linkTarget.repo}#${linkTarget.number}` : linkTarget.key,
          sub: linkTarget.kind === "pr" ? linkTarget.url : "",
          closed: false,
          score: Infinity,
          external: linkTarget,
        },
      ];
    } else {
      // Found in deck - boost it to the top but don't mark as external
      results[foundIndex].score = Infinity;
      results.sort((a, b) => b.score - a.score);
    }
  }

  return results;
}

/**
 * Fuzzy subsequence match: check if the query appears as a subsequence in any
 * of the targets (case-insensitive). Returns a score: higher is better.
 * Exact matches score highest.
 */
function fuzzyMatch(query: string, targets: string[]): number {
  const lowerQuery = query.toLowerCase();

  for (const target of targets) {
    const lowerTarget = target.toLowerCase();

    // Exact match
    if (lowerTarget === lowerQuery) {
      return 1000;
    }

    // Exact substring match (query contains target OR target contains query)
    if (lowerTarget.includes(lowerQuery) || lowerQuery.includes(lowerTarget)) {
      return 500;
    }

    // Subsequence match
    if (isSubsequence(lowerQuery, lowerTarget)) {
      return 100;
    }
  }

  return 0;
}

/**
 * Check if `query` is a subsequence of `target`.
 */
function isSubsequence(query: string, target: string): boolean {
  let queryIndex = 0;
  for (let i = 0; i < target.length && queryIndex < query.length; i++) {
    if (target[i] === query[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === query.length;
}
