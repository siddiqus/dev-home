import { requireSettings } from "../http/credentials";
import { ApiError } from "../http/errors";
import { githubGraphql, githubRest } from "../http/github";
import { refusal } from "./approve";
import { ORG_TEAMS_QUERY, TEAM_MEMBERS_QUERY } from "./queries";

interface MembersPage {
  nodes: { login: string }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/**
 * Ask people and teams to review a PR. Asking someone who already reviewed
 * re-requests their review. Teams go by slug and must have access to the repo.
 */
export async function requestReviewers(args: {
  owner: string;
  repo: string;
  number: number;
  reviewers: string[];
  teamReviewers: string[];
}): Promise<void> {
  const { owner, repo, number, reviewers, teamReviewers } = args;
  const res = await githubRest().post(
    `/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`,
    {
      ...(reviewers.length ? { reviewers } : {}),
      ...(teamReviewers.length ? { team_reviewers: teamReviewers } : {}),
    },
    // Read refusals here: the shared error only keeps `message`, which for a 422 is "Unprocessable Entity".
    { validateStatus: () => true },
  );
  if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, refusal(res.data));
}

/**
 * Teams in the configured org that the token can see, by name, each with its
 * members' logins (child teams' members included). One call per 100 teams; a
 * team with more than 100 members pages the rest. Listing teams needs org read
 * access (read:org, or a fine-grained token's Members: read); without it GitHub
 * may return no teams rather than an error.
 */
export async function getOrgTeams(): Promise<{
  teams: { slug: string; name: string; members: string[] }[];
}> {
  const org = requireSettings().githubOrg;
  if (!org) return { teams: [] };

  const teams: { slug: string; name: string; members: string[] }[] = [];
  let after: string | null = null;
  do {
    const result: {
      organization: {
        teams: {
          nodes: { slug: string; name: string | null; members: MembersPage }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    } = await githubGraphql(ORG_TEAMS_QUERY, { org, after });
    const { nodes, pageInfo } = result.organization.teams;
    for (const t of nodes) {
      const members = t.members.nodes.map((m) => m.login);
      let page = t.members.pageInfo;
      while (page.hasNextPage) {
        const more: { organization: { team: { members: MembersPage } } } = await githubGraphql(
          TEAM_MEMBERS_QUERY,
          { org, slug: t.slug, after: page.endCursor },
        );
        members.push(...more.organization.team.members.nodes.map((m) => m.login));
        page = more.organization.team.members.pageInfo;
      }
      teams.push({ slug: t.slug, name: t.name || t.slug, members });
    }
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);

  teams.sort((a, b) => a.name.localeCompare(b.name));
  return { teams };
}
