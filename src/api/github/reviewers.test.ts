import { describe, it, expect, beforeEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { saveSettings, type AppSettings } from "../../services/config";
import { getOrgTeams, requestReviewers } from "./reviewers";

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
const respond = (...pages: { data: any; status?: number }[]) => {
  let call = 0;
  adapter = vi.fn(async () => {
    const { data, status = 200 } = pages[Math.min(call++, pages.length - 1)]!;
    if (status >= 400) throw { response: { status, data } };
    return { data, status };
  });
  httpMock.adapter = adapter as any;
};
const sent = (i = 0) => adapter.mock.calls[i][0];

beforeEach(() => {
  localStorage.clear();
  saveSettings(SETTINGS);
});

describe("requestReviewers", () => {
  it("asks people and teams in one call", async () => {
    respond({ data: {}, status: 201 });
    await requestReviewers({
      owner: "o",
      repo: "app",
      number: 12,
      reviewers: ["abu"],
      teamReviewers: ["frontend"],
    });
    expect(sent().method).toBe("post");
    expect(sent().url).toBe("/repos/o/app/pulls/12/requested_reviewers");
    expect(JSON.parse(sent().data)).toEqual({ reviewers: ["abu"], team_reviewers: ["frontend"] });
  });

  it("leaves out an empty list", async () => {
    respond({ data: {}, status: 201 });
    await requestReviewers({
      owner: "o",
      repo: "app",
      number: 12,
      reviewers: [],
      teamReviewers: ["frontend"],
    });
    expect(JSON.parse(sent().data)).toEqual({ team_reviewers: ["frontend"] });
  });

  it("refuses with GitHub's reason, not just 'Unprocessable Entity'", async () => {
    respond({
      data: {
        message: "Unprocessable Entity",
        errors: ["Reviews may only be requested from collaborators."],
      },
      status: 422,
    });
    await expect(
      requestReviewers({
        owner: "o",
        repo: "app",
        number: 12,
        reviewers: ["x"],
        teamReviewers: [],
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Reviews may only be requested from collaborators.",
    });
  });
});

describe("getOrgTeams", () => {
  it("pages through the org's teams, sorted by name", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      slug: `t${String(i).padStart(3, "0")}`,
      name: `Team ${String(i).padStart(3, "0")}`,
    }));
    respond({ data: full }, { data: [{ slug: "alpha", name: "Alpha" }] });
    const { teams } = await getOrgTeams();
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(sent().url).toBe("/orgs/test-org/teams");
    expect(teams).toHaveLength(101);
    expect(teams[0]).toEqual({ slug: "alpha", name: "Alpha" });
  });

  it("returns nothing without an org", async () => {
    saveSettings({ ...SETTINGS, githubOrg: "" });
    respond({ data: [] });
    expect(await getOrgTeams()).toEqual({ teams: [] });
    expect(adapter).not.toHaveBeenCalled();
  });
});
