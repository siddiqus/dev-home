import type { GitHubPR } from "../../types";
import type { DeckData, DeckTicket } from "./deckTypes";
import { normalizeNoteRef } from "../../utils/prNotes";
import { repoRef } from "./prState";
import { TICKET_KEY_REGEX } from "../../../shared/tickets";
import { hasTag, noteText } from "../../utils/noteTags";
import type { Note } from "../../types";

/** The shared ticket-key pattern (digits allowed in the project, e.g. AB2-12), unanchored. */
const KEY = TICKET_KEY_REGEX.source.replace(/\\b/g, "");
const BROWSE_RE = new RegExp(`/browse/${KEY}`, "i");
const SELECTED_ISSUE_RE = new RegExp(`[?&]selectedIssue=${KEY}`, "i");
const BARE_KEY_RE = new RegExp(`^${KEY}$`, "i");

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
  const browseMatch = trimmed.match(BROWSE_RE);
  if (browseMatch) {
    return { kind: "ticket", key: browseMatch[1].toUpperCase() };
  }

  const selectedIssueMatch = trimmed.match(SELECTED_ISSUE_RE);
  if (selectedIssueMatch) {
    return { kind: "ticket", key: selectedIssueMatch[1].toUpperCase() };
  }

  // Bare Jira key: PROJECT-123
  if (BARE_KEY_RE.test(trimmed)) {
    return { kind: "ticket", key: trimmed.toUpperCase() };
  }

  return null;
}

/** A `#tag` query (a letter after the #, so `#1199` stays a PR number) and any text after it. */
function parseTagQuery(query: string): { tag: string; rest: string } | null {
  const m = query.match(/^#([a-z][\w-]*)(?:\s+(.*))?$/i);
  return m ? { tag: m[1], rest: (m[2] ?? "").trim() } : null;
}

/** The #todo notes a tab carries: the note itself on a note tab, else its `todos`. */
const tabNotes = (t: DeckTicket): Note[] => (t.noteItem ? [t.noteItem] : t.todos);

/** 500 when any note's title or text contains the query (no subsequence match: bodies are long). */
function notesMatch(query: string, notes: Note[]): number {
  const q = query.toLowerCase();
  return notes.some((n) => `${n.title}\n${noteText(n.content)}`.toLowerCase().includes(q))
    ? 500
    : 0;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One result for a whole tab: a note tab, or a ticket with no PR picked. */
function tabResult(t: DeckTicket, closed: boolean, score: number, sub?: string): SearchResult {
  return {
    ticketId: t.id,
    pr: null,
    ticketKey: t.key,
    label: t.noteItem ? `📝 ${t.title}` : t.key ? `${t.key} ${t.title}` : t.title,
    sub: sub ?? (t.noteItem ? t.status : (t.key ?? "")),
    closed,
    score,
  };
}

/**
 * `#tag [text]`: tabs carrying a note with that tag (note tabs and tickets
 * with #todo notes), narrowed by the text when given, in deck order.
 */
function searchTag(tag: string, rest: string, deck: DeckData): SearchResult[] {
  const results: SearchResult[] = [];
  for (const t of [...deck.current, ...deck.open, ...deck.closed]) {
    const tagged = tabNotes(t).filter((n) => hasTag(n, tag));
    if (tagged.length === 0) continue;
    const score = rest
      ? Math.max(
          fuzzyMatch(rest, [t.key ?? "", t.title, ...t.prs.map((p) => p.pr.title)]),
          notesMatch(rest, tagged),
        )
      : 1;
    if (score === 0) continue;
    const sub = t.noteItem ? undefined : plural(tagged.length, `#${tag.toLowerCase()} note`);
    results.push(tabResult(t, deck.closed.includes(t), score, sub));
  }
  return results.sort((a, b) => b.score - a.score);
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

  const tagQuery = parseTagQuery(trimmed);
  if (tagQuery) return searchTag(tagQuery.tag, tagQuery.rest, deck);

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
    // A pasted Jira link or key for this ticket pins it to the top.
    const ticketLinked =
      linkTarget?.kind === "ticket" && ticket.key?.toUpperCase() === linkTarget.key;
    // A tab's #todo notes match on their text too.
    const ticketScore = ticketLinked
      ? Infinity
      : Math.max(
          fuzzyMatch(trimmed, [ticket.key ?? "", ticket.title]),
          notesMatch(trimmed, tabNotes(ticket)),
        );

    // Check each PR
    for (const deckPR of ticket.prs) {
      const pr = deckPR.pr;

      // PR number matches rank highest: exact `1199`, `#1199` or `repo#1199` only,
      // so a short number never matches inside a longer query.
      const lowerQuery = trimmed.toLowerCase();
      const repoName = (pr.repo_full_name.split("/")[1] ?? "").toLowerCase();
      const prNumberScore = [`#${pr.number}`, `${pr.number}`, `${repoName}#${pr.number}`].includes(
        lowerQuery,
      )
        ? 1000
        : 0;

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
      // A pasted PR link for this PR pins it to the top.
      const prLinked =
        linkTarget?.kind === "pr" &&
        pr.repo_full_name.toLowerCase() === linkTarget.repo.toLowerCase() &&
        pr.number === linkTarget.number;
      const score = prLinked ? Infinity : Math.max(ticketScore, prScore);

      if (score > 0) {
        results.push({
          ticketId: ticket.id,
          pr: pr,
          ticketKey: ticket.key,
          label: `${repoRef(pr)} ${pr.title}`,
          sub: ticket.key ? `${ticket.key} · ${ticket.title}` : "",
          closed: isClosed,
          score,
        });
      }
    }

    // If the ticket has no PRs but matches, include it
    if (ticket.prs.length === 0 && ticketScore > 0) {
      results.push({
        ...tabResult(ticket, isClosed, ticketScore),
        label: ticket.noteItem ? `📝 ${ticket.title}` : ticket.title,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // A link that isn't in the deck: only the external result.
  if (linkTarget && !results.some((r) => r.score === Infinity)) {
    return [
      {
        ticketId: null,
        pr: null,
        ticketKey: linkTarget.kind === "ticket" ? linkTarget.key : null,
        label:
          linkTarget.kind === "pr"
            ? `${linkTarget.repo.split("/").pop()}#${linkTarget.number}`
            : linkTarget.key,
        sub: linkTarget.kind === "pr" ? linkTarget.url : "",
        closed: false,
        score: Infinity,
        external: linkTarget,
      },
    ];
  }

  return results;
}

/**
 * Fuzzy match of the query against each target (case-insensitive); the best
 * target wins. Exact 1000, target contains the query 500, query is a
 * subsequence of the target 100. Empty targets never match.
 */
function fuzzyMatch(query: string, targets: string[]): number {
  const lowerQuery = query.toLowerCase();
  let best = 0;
  for (const target of targets) {
    if (!target) continue;
    const lowerTarget = target.toLowerCase();
    const score =
      lowerTarget === lowerQuery
        ? 1000
        : lowerTarget.includes(lowerQuery)
          ? 500
          : isSubsequence(lowerQuery, lowerTarget)
            ? 100
            : 0;
    if (score > best) best = score;
  }
  return best;
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
