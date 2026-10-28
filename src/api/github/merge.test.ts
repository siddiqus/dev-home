import { describe, it, expect, beforeEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { saveSettings, type AppSettings } from "../../services/config";
import { enqueuePr, getMergeOptions, mergePr } from "./merge";

useFetchAdapter();

const SETTINGS: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "user@example.com",
  jiraApiToken: "jira-token",
  githubToken: "gh-token",
  githubUsername: "testuser",
  githubOrg: "test-org",
  hiddenTabs: [],
};

let adapter: ReturnType<typeof vi.fn>;
const respond = (data: any) => {
  adapter = vi.fn(async () => ({ data }));
  httpMock.adapter = adapter as any;
};
const sentBody = () => JSON.parse(adapter.mock.calls[0][0].data);

function repository(overrides: Record<string, unknown> = {}) {
  return {
    viewerDefaultMergeMethod: "SQUASH",
    squashMergeAllowed: true,
    rebaseMergeAllowed: true,
    mergeCommitAllowed: true,
    pullRequest: { id: "PR_node", isMergeQueueEnabled: false },
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveSettings(SETTINGS);
});

describe("getMergeOptions", () => {
  it("asks for the PR's repo and number", async () => {
    respond({ data: { repository: repository() } });
    await getMergeOptions({ owner: "o", repo: "app", number: 12 });
    expect(sentBody().variables).toEqual({ owner: "o", repo: "app", number: 12 });
  });

  it("puts the viewer's default first, then the rest in GitHub's order", async () => {
    respond({ data: { repository: repository({ viewerDefaultMergeMethod: "REBASE" }) } });
    await expect(getMergeOptions({ owner: "o", repo: "app", number: 12 })).resolves.toEqual({
      pullRequestId: "PR_node",
      queue: false,
      methods: ["REBASE", "MERGE", "SQUASH"],
    });
  });

  it("lists only the methods the repo allows", async () => {
    respond({
      data: { repository: repository({ mergeCommitAllowed: false, rebaseMergeAllowed: false }) },
    });
    const options = await getMergeOptions({ owner: "o", repo: "app", number: 12 });
    expect(options.methods).toEqual(["SQUASH"]);
  });

  it("drops a default the repo no longer allows", async () => {
    respond({
      data: {
        repository: repository({ viewerDefaultMergeMethod: "MERGE", mergeCommitAllowed: false }),
      },
    });
    const options = await getMergeOptions({ owner: "o", repo: "app", number: 12 });
    expect(options.methods).toEqual(["SQUASH", "REBASE"]);
  });

  it("flags a base branch with a merge queue", async () => {
    respond({
      data: {
        repository: repository({ pullRequest: { id: "PR_node", isMergeQueueEnabled: true } }),
      },
    });
    const options = await getMergeOptions({ owner: "o", repo: "app", number: 12 });
    expect(options.queue).toBe(true);
  });

  it("throws when the PR isn't found", async () => {
    respond({ data: { repository: repository({ pullRequest: null }) } });
    await expect(getMergeOptions({ owner: "o", repo: "app", number: 12 })).rejects.toThrow(
      "Pull request not found",
    );
  });
});

describe("mergePr", () => {
  it("merges with the chosen method, pinned to the head commit the list showed", async () => {
    respond({ data: { mergePullRequest: { pullRequest: { id: "PR_node" } } } });
    await mergePr({ pullRequestId: "PR_node", method: "REBASE", expectedHeadOid: "abc123" });
    const body = sentBody();
    expect(body.query).toContain("mergePullRequest");
    expect(body.variables).toEqual({
      pullRequestId: "PR_node",
      method: "REBASE",
      expectedHeadOid: "abc123",
    });
  });

  it("surfaces GitHub's reason when the merge is refused", async () => {
    respond({
      data: null,
      errors: [{ type: "UNPROCESSABLE", message: "Head branch was modified" }],
    });
    await expect(
      mergePr({ pullRequestId: "PR_node", method: "SQUASH", expectedHeadOid: "abc123" }),
    ).rejects.toThrow("Head branch was modified");
  });
});

describe("enqueuePr", () => {
  it("adds the PR to its merge queue, pinned to the head commit", async () => {
    respond({ data: { enqueuePullRequest: { mergeQueueEntry: { id: "MQE" } } } });
    await enqueuePr({ pullRequestId: "PR_node", expectedHeadOid: "abc123" });
    const body = sentBody();
    expect(body.query).toContain("enqueuePullRequest");
    expect(body.variables).toEqual({ pullRequestId: "PR_node", expectedHeadOid: "abc123" });
  });
});
