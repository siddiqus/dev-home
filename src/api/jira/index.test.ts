import { describe, it, expect, beforeEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { saveSettings } from "../../services/config";
import {
  getIssues,
  postIssuesBulk,
  getJiraMentions,
  postJqlSearch,
  getRemoteFilters,
  searchUsers,
  searchBoards,
  getBoardSprints,
} from "./index";
import { ApiError } from "../http/errors";
import { resetMyselfCache } from "./issues";
import { clearSprintCache } from "./teams";

useFetchAdapter();

describe("Jira API", () => {
  beforeEach(() => {
    localStorage.clear();
    clearSprintCache();
    saveSettings({
      jiraBaseUrl: "https://example.atlassian.net/",
      jiraEmail: "test@example.com",
      jiraApiToken: "token",
      githubToken: "gh",
      githubUsername: "user",
      githubOrg: "org",
      hiddenTabs: [],
    });
    resetMyselfCache();
  });

  describe("getIssues", () => {
    it("posts the expected JQL and maps issue shape", async () => {
      httpMock.adapter = vi.fn(async (config) => ({
        data: {
          issues: [
            {
              key: "TEST-1",
              fields: {
                summary: "Test issue",
                status: {
                  name: "In Progress",
                  statusCategory: { colorName: "blue" },
                },
                priority: {
                  name: "High",
                  iconUrl: "https://example.com/icon.png",
                },
                assignee: {
                  displayName: "John Doe",
                  avatarUrls: { "24x24": "https://example.com/avatar.png" },
                },
                project: {
                  key: "TEST",
                  name: "Test Project",
                },
                created: "2026-09-01T12:00:00Z",
                updated: "2026-09-02T12:00:00Z",
              },
            },
          ],
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      }));

      const result = await getIssues();
      expect(result).toHaveProperty("issues");
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        key: "TEST-1",
        summary: "Test issue",
        status: {
          name: "In Progress",
          statusCategory: { colorName: "blue" },
        },
        priority: {
          name: "High",
          iconUrl: "https://example.com/icon.png",
        },
      });

      const calls = (httpMock.adapter as any).mock.calls;
      const config = calls[calls.length - 1][0];
      expect(config.url).toBe("/search/jql");
      expect(config.method).toBe("post");
      const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      expect(data.jql).toContain("assignee = currentUser()");
      expect(data.jql).toContain("resolution = Unresolved");
    });
  });

  describe("postIssuesBulk", () => {
    it("returns empty issues with no HTTP call when keys is empty", async () => {
      const spy = vi.fn();
      httpMock.adapter = spy;
      const result = await postIssuesBulk({ keys: [] });
      expect(result).toEqual({ issues: [] });
      expect(spy).not.toHaveBeenCalled();
    });

    it("builds key IN JQL for multiple keys", async () => {
      httpMock.adapter = vi.fn(async (config) => ({
        data: {
          issues: [
            {
              key: "A-1",
              fields: {
                summary: "Issue A",
                status: { name: "Done", statusCategory: { colorName: "green" } },
                priority: { name: "Medium", iconUrl: "" },
                assignee: null,
                project: { key: "A", name: "Project A" },
                created: "2026-09-01T12:00:00Z",
                updated: "2026-09-02T12:00:00Z",
                description: {
                  type: "doc",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Test" }] }],
                },
                issuetype: { name: "Story", iconUrl: "" },
              },
            },
          ],
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      }));

      const result = await postIssuesBulk({ keys: ["A-1", "B-2"] });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].key).toBe("A-1");
      expect(result.issues[0].description).toContain("Test");

      const calls = (httpMock.adapter as any).mock.calls;
      const config = calls[calls.length - 1][0];
      const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      expect(data.jql).toContain('key IN ("A-1", "B-2")');
    });
  });

  describe("getJiraMentions", () => {
    it("filters comments mentioning email or username, sorted by updated DESC", async () => {
      let callCount = 0;
      httpMock.adapter = vi.fn(async (config) => {
        callCount++;
        if (callCount === 1) {
          // Initial search
          return {
            data: {
              issues: [
                {
                  key: "TEST-1",
                  fields: { summary: "Issue 1" },
                },
                {
                  key: "TEST-2",
                  fields: { summary: "Issue 2" },
                },
              ],
            },
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          };
        } else if (config.url.includes("TEST-1/comment")) {
          return {
            data: {
              comments: [
                {
                  id: "1",
                  author: {
                    displayName: "Alice",
                    avatarUrls: { "24x24": "avatar.png" },
                  },
                  body: {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Hey test@example.com" }],
                      },
                    ],
                  },
                  created: "2026-09-01T12:00:00Z",
                  updated: "2026-09-02T12:00:00Z",
                },
                {
                  id: "2",
                  author: {
                    displayName: "Bob",
                    avatarUrls: { "24x24": "avatar2.png" },
                  },
                  body: {
                    type: "doc",
                    content: [
                      { type: "paragraph", content: [{ type: "text", text: "Other content" }] },
                    ],
                  },
                  created: "2026-09-01T12:00:00Z",
                  updated: "2026-09-01T12:00:00Z",
                },
              ],
            },
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          };
        } else if (config.url.includes("TEST-2/comment")) {
          return {
            data: {
              comments: [
                {
                  id: "3",
                  author: {
                    displayName: "Charlie",
                    avatarUrls: { "24x24": "avatar3.png" },
                  },
                  body: {
                    type: "doc",
                    content: [
                      { type: "paragraph", content: [{ type: "text", text: "Mentioning test" }] },
                    ],
                  },
                  created: "2026-09-01T12:00:00Z",
                  updated: "2026-09-03T12:00:00Z",
                },
              ],
            },
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          };
        }
        return { data: {}, status: 200, statusText: "OK", headers: {}, config };
      });

      const result = await getJiraMentions();
      expect(result.comments).toHaveLength(2);
      expect(result.comments[0].id).toBe("3"); // Most recent
      expect(result.comments[1].id).toBe("1");
      expect(result.comments[0].issueKey).toBe("TEST-2");
      expect(result.comments[0].issueSummary).toBe("Issue 2");
    });

    it("skips issues with failed comment requests (not fatal)", async () => {
      let callCount = 0;
      httpMock.adapter = vi.fn(async (config) => {
        callCount++;
        if (callCount === 1) {
          return {
            data: { issues: [{ key: "TEST-1", fields: { summary: "Issue 1" } }] },
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          };
        } else {
          throw { response: { status: 500 }, message: "Server error" };
        }
      });

      const result = await getJiraMentions();
      expect(result.comments).toEqual([]);
    });

    describe("inline comments", () => {
      const mention = (id: string, updated: string) => ({
        id,
        author: { displayName: "Alice", avatarUrls: {} },
        body: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Hi test@example.com" }] },
          ],
        },
        created: "2026-09-01T12:00:00Z",
        updated,
      });
      const ok = (config: any, data: any) => ({
        data,
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });

      it("requests comments with the search and makes no per-issue calls when complete", async () => {
        const adapter = vi.fn(async (config: any) =>
          ok(config, {
            issues: [
              {
                key: "TEST-1",
                fields: {
                  summary: "Issue 1",
                  comment: { comments: [mention("1", "2026-09-02T12:00:00Z")], total: 1 },
                },
              },
              {
                key: "TEST-2",
                fields: { summary: "Issue 2", comment: { comments: [], total: 0 } },
              },
            ],
          }),
        );
        httpMock.adapter = adapter;

        const result = await getJiraMentions();
        const searchCalls = adapter.mock.calls.filter(([c]: any[]) => c.url === "/search/jql");
        const commentCalls = adapter.mock.calls.filter(([c]: any[]) =>
          String(c.url).includes("/comment"),
        );
        expect(searchCalls).toHaveLength(1);
        expect(commentCalls).toHaveLength(0);
        const config = searchCalls[0][0];
        const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        expect(data.fields).toEqual(["summary", "comment"]);
        expect(result.comments).toEqual([
          {
            id: "1",
            author: { displayName: "Alice", avatarUrls: {} },
            body: { text: "Hi test@example.com" },
            created: "2026-09-01T12:00:00Z",
            updated: "2026-09-02T12:00:00Z",
            issueKey: "TEST-1",
            issueSummary: "Issue 1",
          },
        ]);
      });

      it("falls back to the comment endpoint only when the inline list is truncated", async () => {
        const adapter = vi.fn(async (config: any) => {
          if (String(config.url).includes("/issue/TEST-2/comment")) {
            return ok(config, {
              comments: [
                mention("2", "2026-09-01T12:00:00Z"),
                mention("3", "2026-09-05T12:00:00Z"),
              ],
            });
          }
          return ok(config, {
            issues: [
              {
                key: "TEST-1",
                fields: {
                  summary: "Issue 1",
                  comment: { comments: [mention("1", "2026-09-02T12:00:00Z")], total: 1 },
                },
              },
              {
                key: "TEST-2",
                fields: {
                  summary: "Issue 2",
                  comment: { comments: [mention("2", "2026-09-01T12:00:00Z")], total: 2 },
                },
              },
            ],
          });
        });
        httpMock.adapter = adapter;

        const result = await getJiraMentions();
        const commentCalls = adapter.mock.calls.filter(([c]: any[]) =>
          String(c.url).includes("/comment"),
        );
        expect(commentCalls).toHaveLength(1);
        expect(String(commentCalls[0][0].url)).toContain("/issue/TEST-2/comment");
        expect(result.comments.map((c) => c.id)).toEqual(["3", "1", "2"]);
      });
    });
  });

  describe("getJiraMentions account mentions", () => {
    it("keeps comments with a mention node for the current user's account id", async () => {
      const comment = (id: string, content: any[]) => ({
        id,
        author: { displayName: "Alice", avatarUrls: {} },
        body: { type: "doc", content: [{ type: "paragraph", content }] },
        created: "2026-09-01T12:00:00Z",
        updated: "2026-09-02T12:00:00Z",
      });
      httpMock.adapter = vi.fn(async (config: any) => {
        const ok = (data: any) => ({ data, status: 200, statusText: "OK", headers: {}, config });
        if (config.url === "/user/search") {
          return ok([
            { accountId: "acc-me", displayName: "Zed Q", emailAddress: "test@example.com" },
          ]);
        }
        return ok({
          issues: [
            {
              key: "TEST-1",
              fields: {
                summary: "Issue 1",
                comment: {
                  total: 2,
                  comments: [
                    comment("1", [
                      { type: "mention", attrs: { id: "acc-me", text: "@Zed Q" } },
                      { type: "text", text: " please look" },
                    ]),
                    comment("2", [{ type: "mention", attrs: { id: "acc-other", text: "@Bob" } }]),
                  ],
                },
              },
            },
          ],
        });
      });

      const result = await getJiraMentions();
      expect(result.comments.map((c) => c.id)).toEqual(["1"]);
      expect(result.comments[0].body.text).toBe("@Zed Q please look");
    });
  });

  describe("postIssuesBulk bad keys", () => {
    it("drops keys Jira rejects and retries once", async () => {
      const adapter = vi.fn(async (config: any) => {
        const data = JSON.parse(config.data);
        if (data.jql.includes("SHA-256")) {
          throw {
            response: {
              status: 400,
              data: {
                errorMessages: ["An issue with key 'SHA-256' does not exist for field 'key'."],
              },
            },
          };
        }
        return {
          data: { issues: [{ key: "A-1", fields: { summary: "A" } }] },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      });
      httpMock.adapter = adapter;

      const result = await postIssuesBulk({ keys: ["A-1", "SHA-256"] });
      expect(result.issues.map((i) => i.key)).toEqual(["A-1"]);
      expect(adapter).toHaveBeenCalledTimes(2);
    });
  });

  describe("postJqlSearch", () => {
    it("rejects ApiError 400 when jql is empty or whitespace", async () => {
      await expect(postJqlSearch({ jql: "  " })).rejects.toThrow(ApiError);
      try {
        await postJqlSearch({ jql: "" });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(400);
        expect((err as ApiError).message).toContain("jql is required");
      }
    });

    it("returns issues with pagination token", async () => {
      httpMock.adapter = vi.fn(async (config) => ({
        data: {
          issues: [{ key: "TEST-1", fields: { summary: "Issue" } }],
          total: 100,
          nextPageToken: "token123",
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      }));

      const result = await postJqlSearch({ jql: "project = TEST", nextPageToken: "prev" });
      expect(result.issues).toHaveLength(1);
      expect(result.nextPageToken).toBe("token123");

      const calls = (httpMock.adapter as any).mock.calls;
      const config = calls[calls.length - 1][0];
      const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      expect(data.nextPageToken).toBe("prev");
    });
  });

  describe("getRemoteFilters", () => {
    it("returns mapped filters from /filter/my", async () => {
      httpMock.adapter = vi.fn(async (config) => ({
        data: [
          { id: "1", name: "My Filter", jql: "assignee = currentUser()", favourite: true },
          { id: "2", name: "Another", jql: "project = TEST", favourite: false },
        ],
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      }));

      const result = await getRemoteFilters();
      expect(result.filters).toHaveLength(2);
      expect(result.filters[0]).toMatchObject({
        id: "1",
        name: "My Filter",
        jql: "assignee = currentUser()",
        favourite: true,
      });
      const config = vi.mocked(httpMock.adapter as any).mock.calls[0][0];
      expect(config.params).toEqual({ includeFavourites: "true" });
    });
  });

  describe("searchUsers", () => {
    it("calls v3 and v2 for email queries and dedupes by accountId", async () => {
      httpMock.adapter = vi.fn(async (config) => {
        if (config.baseURL.includes("/rest/api/3")) {
          return {
            data: [
              {
                accountId: "acc1",
                displayName: "Alice",
                emailAddress: "alice@example.com",
                avatarUrls: { "24x24": "av1.png" },
              },
            ],
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          };
        } else if (config.baseURL.includes("/rest/api/2")) {
          return {
            data: [
              {
                accountId: "acc1",
                displayName: "Alice",
                emailAddress: "alice@example.com",
                avatarUrls: { "24x24": "av1.png" },
              },
              {
                accountId: "acc2",
                displayName: "Bob",
                emailAddress: "bob@example.com",
                avatarUrls: { "24x24": "av2.png" },
              },
            ],
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          };
        }
        return { data: [], status: 200, statusText: "OK", headers: {}, config };
      });

      const result = await searchUsers({ q: "a@b.com" });
      expect(result.users).toHaveLength(2);
      expect(result.users.map((u) => u.accountId)).toEqual(["acc1", "acc2"]);
    });

    it("returns v3 results when v2 fails", async () => {
      httpMock.adapter = vi.fn(async (config) => {
        if (config.baseURL.includes("/rest/api/3")) {
          return {
            data: [
              {
                accountId: "acc1",
                displayName: "Alice",
                emailAddress: null,
                avatarUrls: { "24x24": "av1.png" },
              },
            ],
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          };
        } else {
          throw { response: { status: 500 }, message: "Server error" };
        }
      });

      const result = await searchUsers({ q: "test@example.com" });
      expect(result.users).toHaveLength(1);
      expect(result.users[0].accountId).toBe("acc1");
    });
  });

  describe("searchBoards", () => {
    it("returns mapped boards from agile API", async () => {
      httpMock.adapter = vi.fn(async (config) => ({
        data: {
          values: [
            {
              id: 1,
              name: "Board 1",
              location: { projectKey: "TEST", projectName: "Test Project" },
            },
            {
              id: 2,
              name: "Board 2",
              location: { projectKey: "DEMO", projectName: "Demo" },
            },
          ],
          isLast: true,
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      }));

      const result = await searchBoards({ q: "test" });
      expect(result.boards).toHaveLength(2);
      expect(result.boards[0]).toMatchObject({
        id: 1,
        name: "Board 1",
        projectKey: "TEST",
        projectName: "Test Project",
      });
    });
  });

  describe("getBoardSprints", () => {
    it("rejects ApiError 400 for NaN board id", async () => {
      await expect(getBoardSprints({ id: NaN })).rejects.toThrow(ApiError);
      try {
        await getBoardSprints({ id: NaN });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(400);
        expect((err as ApiError).message).toContain("invalid board id");
      }
    });

    it("returns sprints sorted active first, then by end date", async () => {
      httpMock.adapter = vi.fn(async (config) => ({
        data: {
          values: [
            {
              id: 1,
              name: "Sprint 1",
              state: "closed",
              startDate: "2026-08-01",
              endDate: "2026-08-15",
            },
            {
              id: 2,
              name: "Sprint 2",
              state: "active",
              startDate: "2026-09-01",
              endDate: "2026-09-15",
            },
            {
              id: 3,
              name: "Sprint 3",
              state: "closed",
              startDate: "2026-08-15",
              endDate: "2026-08-30",
            },
          ],
          isLast: true,
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      }));

      const result = await getBoardSprints({ id: 5 });
      expect(result.sprints).toHaveLength(3);
      expect(result.sprints[0].state).toBe("active");
      expect(result.sprints[1].endDate).toBe("2026-08-30");
      expect(result.sprints[2].endDate).toBe("2026-08-15");
    });

    it("reads every page, keeps the newest closed sprints, and caches per board", async () => {
      const sprint = (id: number) => ({
        id,
        name: `S${id}`,
        state: "closed",
        endDate: new Date(2020, 0, id).toISOString(),
      });
      const adapter = vi.fn(async (config: any) => {
        const startAt = Number(config.params.startAt);
        const ids = Array.from({ length: startAt === 0 ? 50 : 10 }, (_, i) => startAt + i + 1);
        return {
          data: { values: ids.map(sprint), isLast: startAt > 0 },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      });
      httpMock.adapter = adapter;

      const { sprints } = await getBoardSprints({ id: 7 });
      expect(adapter).toHaveBeenCalledTimes(2);
      expect(sprints).toHaveLength(25);
      expect(sprints[0].id).toBe(60);

      await getBoardSprints({ id: 7 });
      expect(adapter).toHaveBeenCalledTimes(2);
      await getBoardSprints({ id: 7, force: true });
      expect(adapter).toHaveBeenCalledTimes(4);
    });
  });
});
