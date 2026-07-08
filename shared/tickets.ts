/**
 * Canonical ticket-key parser, shared by the frontend (`src/`) and the server
 * (`server/src/`). This is the single source of truth — do not re-implement the
 * regex elsewhere; import from here instead.
 *
 * A "ticket key" is a Jira-style key: a project part (a letter followed by one or
 * more letters/digits, e.g. `PROJ`, `ABC2`) then `-` then a number, e.g.
 * `PROJ-123`. Keys are matched case-insensitively and returned upper-cased.
 */

export interface TicketSource {
  /** PR / issue title. */
  title?: string | null;
  /** PR head branch name, e.g. `feature/PROJ-123-add-sso`. */
  branch?: string | null;
  /** PR / issue body. */
  body?: string | null;
}

/**
 * A bare ticket key, matched anywhere in a string (word-bounded). Exported so
 * note/text detection can reuse the exact same definition. Not global — safe to
 * share across `.match`/`.test`/`.exec` without `lastIndex` surprises.
 */
export const TICKET_KEY_REGEX = /\b([A-Za-z][A-Za-z0-9]+-\d+)\b/;

/** Return the leftmost key in a single string, upper-cased, or null. */
function fromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(TICKET_KEY_REGEX);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Extract a ticket key from a bare string, or from a {@link TicketSource}.
 *
 * - String input: returns the leftmost key found (or null).
 * - Source input: tries `title`, then `branch`, then `body`, returning the first
 *   source that yields a key.
 *
 * The result is always upper-cased. Returns null when nothing matches.
 */
export function extractTicketKey(input: string | TicketSource | null | undefined): string | null {
  if (input == null) return null;
  if (typeof input === "string") return fromText(input);
  return fromText(input.title) ?? fromText(input.branch) ?? fromText(input.body);
}

/** Project-key portion of a key, e.g. "CCP-12" -> "CCP". Empty string if not a key. */
export function projectOfKey(key: string): string {
  const match = key.match(/^([A-Za-z][A-Za-z0-9]+)-\d+$/);
  return match ? match[1].toUpperCase() : "";
}
