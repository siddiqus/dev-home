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
  const page = (logins: string[], endCursor: string | null = null) => ({
    nodes: logins.map((login) => ({ login })),
    pageInfo: { hasNextPage: endCursor !== null, endCursor },
  });
  const body = (i: number) => {
    const c = adapter.mock.calls[i][0];
    return typeof c.data === "string" ? JSON.parse(c.data) : c.data;
  };

  it("pages the org's teams over GraphQL with their members, sorted by name", async () => {
    respond(
      {
        data: {
          data: {
            organization: {
              teams: {
                nodes: [{ slug: "web", name: "Web", members: page(["abu", "rkhan"]) }],
                pageInfo: { hasNextPage: true, endCursor: "t1" },
              },
            },
          },
        },
      },
      {
        data: {
          data: {
            organization: {
              teams: {
                nodes: [{ slug: "alpha", name: null, members: page([]) }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      },
    );
    const { teams } = await getOrgTeams();
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(String(sent().url)).toMatch(/\/graphql$/);
    expect(body(0).variables).toMatchObject({ org: "test-org", after: null });
    expect(body(1).variables).toMatchObject({ org: "test-org", after: "t1" });
    expect(teams).toEqual([
      { slug: "alpha", name: "alpha", members: [] },
      { slug: "web", name: "Web", members: ["abu", "rkhan"] },
    ]);
  });

  it("pages the rest of a team with more than 100 members", async () => {
    respond(
      {
        data: {
          data: {
            organization: {
              teams: {
                nodes: [{ slug: "eng", name: "Eng", members: page(["a"], "m1") }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      },
      { data: { data: { organization: { team: { members: page(["b"]) } } } } },
    );
    const { teams } = await getOrgTeams();
    expect(body(1).variables).toEqual({ org: "test-org", slug: "eng", after: "m1" });
    expect(teams[0].members).toEqual(["a", "b"]);
  });

  it("returns nothing without an org", async () => {
    saveSettings({ ...SETTINGS, githubOrg: "" });
    respond({ data: [] });
    expect(await getOrgTeams()).toEqual({ teams: [] });
    expect(adapter).not.toHaveBeenCalled();
  });
});
