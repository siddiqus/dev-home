import { parseLink } from "../workday/deckSearch";

export interface PRLink {
  /** owner/repo */
  repo: string;
  number: number;
}

/**
 * A PR pasted into PR search: a full GitHub PR URL (any tab, query or anchor),
 * the same without `https://` or `github.com/`, or `owner/repo#123`. Null for
 * anything else, which PR search treats as search text.
 */
export function parsePRLink(text: string): PRLink | null {
  const t = text.trim();
  const rest = t.replace(/^(https?:\/\/)?(www\.)?(github\.com\/)?/i, "");
  const target = parseLink(t) ?? parseLink(`https://github.com/${rest}`);
  return target?.kind === "pr" ? { repo: target.repo, number: target.number } : null;
}
