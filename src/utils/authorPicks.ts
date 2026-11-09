/**
 * All PRs' author picks: people by login, and GitHub teams as `team:<slug>`
 * (a login can't contain ":"), kept side by side in one list so saved filters
 * and the search cache store them as they are. A team is searched as its
 * members at search time, so a saved team follows its membership.
 */

const TEAM_PREFIX = "team:";

/** The pick value for a team. */
export const teamValue = (slug: string) => `${TEAM_PREFIX}${slug}`;

/** The team slug a pick stands for, or null for a person. */
export function teamSlugOf(value: string): string | null {
  return value.startsWith(TEAM_PREFIX) ? value.slice(TEAM_PREFIX.length) : null;
}

interface TeamLike {
  slug: string;
  name: string;
  members: string[];
}

/**
 * Logins to search for the picks: people as they are, teams as their members,
 * first appearance kept and repeats (any case) dropped. A team that isn't in
 * `teams` (deleted, or not visible to the token) adds no one.
 */
export function expandAuthors(values: string[], teams: TeamLike[]): string[] {
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  const seen = new Set<string>();
  const logins: string[] = [];
  const add = (login: string) => {
    const key = login.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    logins.push(login);
  };
  for (const v of values) {
    const slug = teamSlugOf(v);
    if (slug === null) add(v);
    else bySlug.get(slug)?.members.forEach(add);
  }
  return logins;
}

/** Whether any pick is a team. */
export const hasTeamPick = (values: string[]) => values.some((v) => teamSlugOf(v) !== null);

/** A pick's display name: a team's name (its slug until teams load), else the login. */
export function pickName(value: string, teams: TeamLike[]): string {
  const slug = teamSlugOf(value);
  if (slug === null) return value;
  return teams.find((t) => t.slug === slug)?.name ?? slug;
}

/**
 * The picker's label when a team is picked: "CMP Frontend", or "CMP Frontend + 2"
 * with more picks (teams first). Null without a team, for the default label.
 */
export function teamPicksLabel(values: string[], teams: TeamLike[]): string | null {
  const firstTeam = values.find((v) => teamSlugOf(v) !== null);
  if (firstTeam === undefined) return null;
  const name = pickName(firstTeam, teams);
  return values.length > 1 ? `${name} + ${values.length - 1}` : name;
}
