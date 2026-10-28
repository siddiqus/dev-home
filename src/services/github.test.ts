import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GitHubPR } from "../types";
import { enqueuePr, getMergeOptions, mergePr, type MergeOptions } from "../api/github";
import { fetchMergeOptions, mergePR } from "./github";
import { SETTINGS_EVENT } from "./config";

vi.mock("../api/github", () => ({
  getMergeOptions: vi.fn(),
  mergePr: vi.fn(),
  enqueuePr: vi.fn(),
}));

function pr(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 12,
    title: "PR",
    html_url: "https://github.com/o/app/pull/12",
    state: "open",
    draft: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: "feature", sha: "abc123" },
    base: { ref: "main" },
    repo_full_name: "o/app",
    checks_status: "SUCCESS",
    checks: [],
    review_status: "APPROVED",
    ...overrides,
  };
}

const OPTIONS: MergeOptions = { pullRequestId: "PR_node", queue: false, methods: ["SQUASH"] };

beforeEach(() => {
  vi.mocked(getMergeOptions).mockReset();
  vi.mocked(mergePr).mockReset();
  vi.mocked(enqueuePr).mockReset();
  window.dispatchEvent(new Event(SETTINGS_EVENT));
});

describe("fetchMergeOptions", () => {
  it("looks the PR up once per session", async () => {
    vi.mocked(getMergeOptions).mockResolvedValue(OPTIONS);
    await expect(fetchMergeOptions(pr())).resolves.toBe(OPTIONS);
    await fetchMergeOptions(pr({ updated_at: "2026-10-03T00:00:00Z" }));
    expect(getMergeOptions).toHaveBeenCalledTimes(1);
    expect(getMergeOptions).toHaveBeenCalledWith({ owner: "o", repo: "app", number: 12 });
  });

  it("retries after a failed lookup", async () => {
    vi.mocked(getMergeOptions).mockRejectedValueOnce(new Error("down"));
    await expect(fetchMergeOptions(pr())).rejects.toThrow("down");
    vi.mocked(getMergeOptions).mockResolvedValue(OPTIONS);
    await expect(fetchMergeOptions(pr())).resolves.toBe(OPTIONS);
  });
});

describe("mergePR", () => {
  it("merges with the method, pinned to the head the list loaded", async () => {
    await mergePR(pr(), OPTIONS, "REBASE");
    expect(mergePr).toHaveBeenCalledWith({
      pullRequestId: "PR_node",
      method: "REBASE",
      expectedHeadOid: "abc123",
    });
    expect(enqueuePr).not.toHaveBeenCalled();
  });

  it("adds the PR to the merge queue when its base branch has one", async () => {
    await mergePR(pr(), { ...OPTIONS, queue: true }, "SQUASH");
    expect(enqueuePr).toHaveBeenCalledWith({ pullRequestId: "PR_node", expectedHeadOid: "abc123" });
    expect(mergePr).not.toHaveBeenCalled();
  });
});
