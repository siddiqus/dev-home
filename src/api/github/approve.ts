import { ApiError } from "../http/errors";
import { githubRest } from "../http/github";

/** GitHub's reason for refusing a review: its `errors` (e.g. "Can not approve your own pull request"), else its message. */
function refusal(body: any): string {
  const errors: unknown[] = Array.isArray(body?.errors) ? body.errors : [];
  const reasons = errors
    .map((e) => (typeof e === "string" ? e : (e as { message?: string })?.message))
    .filter(Boolean);
  if (reasons.length) return reasons.join("; ");
  return body?.message || "Request failed";
}

/**
 * Submit an approving review. `commitId` (the head the list showed) pins the
 * approval to the code that was shown; without it GitHub approves the latest head.
 */
export async function approvePr(args: {
  owner: string;
  repo: string;
  number: number;
  commitId?: string;
}): Promise<void> {
  const { owner, repo, number, commitId } = args;
  const res = await githubRest().post(
    `/repos/${owner}/${repo}/pulls/${number}/reviews`,
    { event: "APPROVE", ...(commitId ? { commit_id: commitId } : {}) },
    // Read refusals here: the shared error only keeps `message`, which for a 422 is "Unprocessable Entity".
    { validateStatus: () => true },
  );
  if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, refusal(res.data));
}
