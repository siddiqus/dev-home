import { describe, it, expect, beforeEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { saveSettings } from "../../services/config";
import { resetMyselfCache } from "./issues";
import { getDoneSince } from "./workday";

useFetchAdapter();

const body = (req: any) => JSON.parse(req.data);

beforeEach(() => {
  localStorage.clear();
  resetMyselfCache();
  saveSettings({
    jiraBaseUrl: "https://example.atlassian.net",
    jiraEmail: "me@example.com",
    jiraApiToken: "t",
    githubToken: "gh",
    githubUsername: "me",
    githubOrg: "org",
    hiddenTabs: [],
  });
});

describe("getDoneSince", () => {
  it("keeps my latest status change after `since`", async () => {
    const adapter = vi.fn(async (req: any) => {
      if (req.url === "/user/search") {
        return { data: [{ accountId: "me-1", displayName: "Me", emailAddress: "me@example.com" }] };
      }
      return {
        data: {
          issues: [
            {
              key: "WMU-402",
              fields: { summary: "Delete data" },
              changelog: {
                histories: [
                  {
                    author: { accountId: "me-1" },
                    created: "2026-10-07T10:00:00.000+0000",
                    items: [{ field: "status", toString: "In Progress" }],
                  },
                  {
                    author: { accountId: "me-1" },
                    created: "2026-10-08T09:00:00.000+0000",
                    items: [{ field: "status", toString: "Code Review" }],
                  },
                  {
                    author: { accountId: "other" },
                    created: "2026-10-08T11:00:00.000+0000",
                    items: [{ field: "status", toString: "Done" }],
                  },
                ],
              },
            },
            {
              key: "OLD-1",
              fields: { summary: "Old" },
              changelog: {
                histories: [
                  {
                    author: { accountId: "me-1" },
                    created: "2026-10-01T09:00:00.000+0000",
                    items: [{ field: "status", toString: "Done" }],
                  },
                ],
              },
            },
          ],
        },
      };
    });
    httpMock.adapter = adapter;

    const since = new Date("2026-10-08T00:00:00Z");
    const { tickets } = await getDoneSince(since);
    const calls = (adapter as any).mock.calls;
    const search = calls.map((c: any) => c[0]).find((r: any) => r.url === "/search/jql");
    expect(body(search).jql).toMatch(
      /^status CHANGED BY currentUser\(\) AFTER "\d{4}-\d{2}-\d{2} \d{2}:\d{2}" ORDER BY updated DESC$/,
    );
    expect(body(search).expand).toBe("changelog");
    expect(body(search).maxResults).toBe(50);
    expect(tickets).toEqual([
      {
        key: "WMU-402",
        summary: "Delete data",
        toStatus: "Code Review",
        changedAt: "2026-10-08T09:00:00.000+0000",
      },
    ]);
  });
});
