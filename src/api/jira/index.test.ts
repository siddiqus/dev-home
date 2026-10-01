import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import axios from "axios";
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

describe("Jira API", () => {
  let originalAdapter: any;

  beforeEach(() => {
    localStorage.clear();
    saveSettings({
      jiraBaseUrl: "https://example.atlassian.net/",
      jiraEmail: "test@example.com",
      jiraApiToken: "token",
      githubToken: "gh",
      githubUsername: "user",
      githubOrg: "org",
      hiddenTabs: [],
    });
    originalAdapter = axios.defaults.adapter;
  });

  afterEach(() => {
    axios.defaults.adapter = originalAdapter;
  });

  describe("getIssues", () => {
    it("posts the expected JQL and maps issue shape", async () => {
      axios.defaults.adapter = vi.fn(async (config) => ({
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

      const calls = (axios.defaults.adapter as any).mock.calls;
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
      axios.defaults.adapter = spy;
      const result = await postIssuesBulk({ keys: [] });
      expect(result).toEqual({ issues: [] });
      expect(spy).not.toHaveBeenCalled();
    });

    it("builds key IN JQL for multiple keys", async () => {
      axios.defaults.adapter = vi.fn(async (config) => ({
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

      const calls = (axios.defaults.adapter as any).mock.calls;
      const config = calls[calls.length - 1][0];
      const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      expect(data.jql).toContain('key IN ("A-1", "B-2")');
    });
  });

  describe("getJiraMentions", () => {
    it("filters comments mentioning email or username, sorted by updated DESC", async () => {
      let callCount = 0;
      axios.defaults.adapter = vi.fn(async (config) => {
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
      axios.defaults.adapter = vi.fn(async (config) => {
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
      axios.defaults.adapter = vi.fn(async (config) => ({
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
      expect(result.total).toBe(100);
      expect(result.nextPageToken).toBe("token123");

      const calls = (axios.defaults.adapter as any).mock.calls;
      const config = calls[calls.length - 1][0];
      const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      expect(data.nextPageToken).toBe("prev");
    });
  });

  describe("getRemoteFilters", () => {
    it("returns mapped filters from /filter/my", async () => {
      axios.defaults.adapter = vi.fn(async (config) => ({
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
    });
  });

  describe("searchUsers", () => {
    it("calls v3 and v2 for email queries and dedupes by accountId", async () => {
      axios.defaults.adapter = vi.fn(async (config) => {
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
      axios.defaults.adapter = vi.fn(async (config) => {
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
      axios.defaults.adapter = vi.fn(async (config) => ({
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
      axios.defaults.adapter = vi.fn(async (config) => ({
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
  });
});
