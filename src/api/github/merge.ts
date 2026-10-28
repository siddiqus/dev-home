import { ApiError } from "../http/errors";
import { githubGraphql } from "../http/github";
import { ENQUEUE_PR_MUTATION, MERGE_OPTIONS_QUERY, MERGE_PR_MUTATION } from "./queries";

/** GitHub's PullRequestMergeMethod. */
export type MergeMethod = "MERGE" | "SQUASH" | "REBASE";

export interface MergeOptions {
  /** The PR's GraphQL node id, which the mutations take. */
  pullRequestId: string;
  /** The base branch merges through a queue, which picks the method. */
  queue: boolean;
  /** Methods the repo allows: the viewer's default first, then GitHub's order. */
  methods: MergeMethod[];
}

/** github.com's merge-box order, and the repo flag that allows each method. */
const METHOD_FLAGS: [MergeMethod, string][] = [
  ["MERGE", "mergeCommitAllowed"],
  ["SQUASH", "squashMergeAllowed"],
  ["REBASE", "rebaseMergeAllowed"],
];

/** Merge method, queue and node id for one PR (MERGE_OPTIONS_QUERY). */
export async function getMergeOptions(args: {
  owner: string;
  repo: string;
  number: number;
}): Promise<MergeOptions> {
  const { repository: repo } = await githubGraphql<{ repository: any }>(MERGE_OPTIONS_QUERY, args);
  const pr = repo?.pullRequest;
  if (!pr) throw new ApiError(404, "Pull request not found");
  const allowed = METHOD_FLAGS.filter(([, flag]) => repo[flag]).map(([method]) => method);
  const preferred = allowed.filter((m) => m === repo.viewerDefaultMergeMethod);
  return {
    pullRequestId: pr.id,
    queue: !!pr.isMergeQueueEnabled,
    methods: [...preferred, ...allowed.filter((m) => m !== repo.viewerDefaultMergeMethod)],
  };
}

/** Merge a PR; refused (with GitHub's reason) when its head moved past `expectedHeadOid`. */
export async function mergePr(args: {
  pullRequestId: string;
  method: MergeMethod;
  expectedHeadOid?: string;
}): Promise<void> {
  await githubGraphql(MERGE_PR_MUTATION, args);
}

/** Add a PR to its merge queue; refused when its head moved past `expectedHeadOid`. */
export async function enqueuePr(args: {
  pullRequestId: string;
  expectedHeadOid?: string;
}): Promise<void> {
  await githubGraphql(ENQUEUE_PR_MUTATION, args);
}
