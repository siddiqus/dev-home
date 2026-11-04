import { describe, it, expect, beforeEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { saveSettings, type AppSettings } from "../../services/config";
import { approvePr } from "./approve";

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
const respond = (data: any, status = 200) => {
  adapter = vi.fn(async () => {
    if (status >= 400) throw { response: { status, data } };
    return { data, status };
  });
  httpMock.adapter = adapter as any;
};
const sent = () => adapter.mock.calls[0][0];

beforeEach(() => {
  localStorage.clear();
  saveSettings(SETTINGS);
});

describe("approvePr", () => {
  it("submits an approving review, pinned to the head the list showed", async () => {
    respond({ id: 1, state: "APPROVED" });
    await approvePr({ owner: "o", repo: "app", number: 12, commitId: "abc123" });
    expect(sent().method).toBe("post");
    expect(sent().url).toBe("/repos/o/app/pulls/12/reviews");
    expect(JSON.parse(sent().data)).toEqual({ event: "APPROVE", commit_id: "abc123" });
  });

  it("approves the latest head when the list didn't load one", async () => {
    respond({ id: 1, state: "APPROVED" });
    await approvePr({ owner: "o", repo: "app", number: 12 });
    expect(JSON.parse(sent().data)).toEqual({ event: "APPROVE" });
  });

  it("refuses with GitHub's reason, not just 'Unprocessable Entity'", async () => {
    respond(
      { message: "Unprocessable Entity", errors: ["Can not approve your own pull request"] },
      422,
    );
    await expect(approvePr({ owner: "o", repo: "app", number: 12 })).rejects.toMatchObject({
      status: 422,
      message: "Can not approve your own pull request",
    });
  });

  it("falls back to GitHub's message when it lists no errors", async () => {
    respond({ message: "Resource not accessible by personal access token" }, 403);
    await expect(approvePr({ owner: "o", repo: "app", number: 12 })).rejects.toMatchObject({
      status: 403,
      message: "Resource not accessible by personal access token",
    });
  });
});
