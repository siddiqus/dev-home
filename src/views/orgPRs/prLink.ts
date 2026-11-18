import { parseLink } from "../workday/deckSearch";

export interface PRLink {
  /** owner/repo */
  repo: string;
  number: number;
}

/**
 * A PR pasted into PR search: a full GitHub PR URL (any tab, query or anchor),
 * the same without `https://` or `github.com/`, `owner/repo#123`, or, with an
 * `org`, `repo/pull/123` in that org. Null for anything else, which PR search
 * treats as search text.
 */
export function parsePRLink(text: string, org = ""): PRLink | null {
  const t = text.trim();
  const rest = t.replace(/^(https?:\/\/)?(www\.)?(github\.com\/)?/i, "");
  const target =
    parseLink(t) ??
    parseLink(`https://github.com/${rest}`) ??
    (org ? parseLink(`https://github.com/${org}/${rest}`) : null);
  return target?.kind === "pr" ? { repo: target.repo, number: target.number } : null;
}
