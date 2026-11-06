import { requireSettings } from "../http/credentials";
import { ApiError } from "../http/errors";
import { githubRest } from "../http/github";
import { refusal } from "./approve";

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
 * Teams in the configured org that the token can see, by name. Listing them
 * needs org read access (read:org, or a fine-grained token's Members: read).
 */
export async function getOrgTeams(): Promise<{ teams: { slug: string; name: string }[] }> {
  const org = requireSettings().githubOrg;
  if (!org) return { teams: [] };

  const github = githubRest();
  const teams: { slug: string; name: string }[] = [];
  const perPage = 100;
  for (let page = 1; ; page++) {
    const { data } = await github.get(`/orgs/${org}/teams`, {
      params: { per_page: perPage, page },
    });
    for (const t of data) teams.push({ slug: t.slug, name: t.name || t.slug });
    if (data.length < perPage) break;
  }
  teams.sort((a, b) => a.name.localeCompare(b.name));
  return { teams };
}
