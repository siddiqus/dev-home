import { describe, it, expect, beforeEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { mapAgileIssues, postTeamDashboard } from "./dashboard";
import { ApiError } from "../http";
import { saveSettings } from "../../services/config";
import { clearSprintCache } from "../jira/teams";

useFetchAdapter();

// Shapes below mirror what Jira's Agile API actually returns for the `epic`
// field object (verified against live boards): `name` is the deprecated
// "Epic Name" field and is often empty, while `summary` carries the real title.
describe("mapAgileIssues — epic name resolution", () => {
  const agileIssue = (epic: unknown) => ({
    key: "CCP-1",
    fields: {
      summary: "child ticket",
      status: { name: "To Do", statusCategory: { key: "new" } },
      epic,
    },
  });

  it("falls back to epic.summary when epic.name is empty", () => {
    // CCP-16210 on board 1372: name="", summary="MWR Logic V2"
    const [mapped] = mapAgileIssues([
      agileIssue({ key: "CCP-16210", name: "", summary: "MWR Logic V2" }),
    ]);
    expect(mapped.epicKey).toBe("CCP-16210");
    expect(mapped.epicName).toBe("MWR Logic V2");
  });

  it("uses epic.name when it is populated", () => {
    const [mapped] = mapAgileIssues([
      agileIssue({ key: "OPAL-4339", name: "RAG tech debt", summary: "RAG tech debt" }),
    ]);
    expect(mapped.epicName).toBe("RAG tech debt");
  });

  it("falls back to an epic parent (team-managed projects)", () => {
    const [mapped] = mapAgileIssues([
      {
        key: "TM-2",
        fields: {
          summary: "child",
          status: { name: "To Do", statusCategory: { key: "new" } },
          parent: { key: "TM-1", fields: { summary: "Big epic", issuetype: { name: "Epic" } } },
        },
      },
    ]);
    expect(mapped.epicKey).toBe("TM-1");
    expect(mapped.epicName).toBe("Big epic");
  });

  it("leaves epic fields null when the issue has no epic", () => {
    const [mapped] = mapAgileIssues([agileIssue(undefined)]);
    expect(mapped.epicKey).toBeNull();
    expect(mapped.epicName).toBeNull();
  });
});

describe("postTeamDashboard — input validation", () => {
  it("rejects when team is null", async () => {
    await expect(postTeamDashboard({ team: null, members: [] })).rejects.toThrow(ApiError);
    await expect(postTeamDashboard({ team: null, members: [] })).rejects.toMatchObject({
      status: 400,
      message: "team and members are required",
    });
  });
});

describe("postTeamDashboard — fetching", () => {
  const TEAM = { id: 1, name: "T", jira_board_id: 9, jira_board_name: "B" };
  const MEMBERS = [
    { accountId: "a1", displayName: "Alice", githubUsername: "alice" },
    { accountId: "b1", displayName: "Bob", githubUsername: "bob" },
  ];
  const ok = (config: any, data: any) => ({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
  const prNode = (n: number, author: string) => ({
    number: n,
    title: `AA-${n} pr`,
    url: `https://github.com/o/r/pull/${n}`,
    state: "OPEN",
    createdAt: "2026-09-01T00:00:00Z",
    author: { login: author },
    repository: { nameWithOwner: "o/r" },
  });
  let graphqlBodies: any[];

  beforeEach(() => {
    localStorage.clear();
    clearSprintCache();
    saveSettings({
      jiraBaseUrl: "https://x.atlassian.net",
      jiraEmail: "me@x.com",
      jiraApiToken: "t",
      githubToken: "g",
      githubUsername: "me",
      githubOrg: "acme",
      hiddenTabs: [],
    });
    graphqlBodies = [];
    httpMock.adapter = vi.fn(async (config: any) => {
      if (config.url?.includes("graphql")) {
        const body = JSON.parse(config.data);
        graphqlBodies.push(body);
        // s0 = alice authored, s1 = alice review requests (by an outsider), ...
        return ok(config, {
          data: {
            s0: { nodes: [prNode(1, "alice")] },
            s1: { nodes: [prNode(2, "outsider")] },
            s2: { nodes: [] },
            s3: { nodes: [] },
          },
        });
      }
      if (config.url?.endsWith("/sprint")) {
        return ok(config, {
          values: [
            { id: 5, name: "Old", state: "closed", endDate: "2026-08-01" },
            { id: 6, name: "Now", state: "active", endDate: "2026-10-10" },
          ],
          isLast: true,
        });
      }
      return ok(config, { issues: [], total: 0 });
    }) as any;
  });

  it("runs every member search in one org-scoped GraphQL request", async () => {
    const result = await postTeamDashboard({ team: TEAM, members: MEMBERS });
    expect(graphqlBodies).toHaveLength(1);
    const queries = Object.values(graphqlBodies[0].variables) as string[];
    expect(queries).toHaveLength(4);
    expect(queries.every((q) => q.endsWith(" org:acme"))).toBe(true);
    // Review requests reach the queue but don't count as the team's PRs.
    expect(result.prFlow.open).toBe(1);
    expect(result.reviewQueue.map((e: any) => e.number).sort()).toEqual([1, 2]);
  });

  it("defaults to the active sprint and honours an explicit sprintId", async () => {
    const active = await postTeamDashboard({ team: TEAM, members: MEMBERS });
    expect(active.sprint.id).toBe(6);
    const closed = await postTeamDashboard({ team: TEAM, members: MEMBERS, sprintId: 5 });
    expect(closed.sprint.id).toBe(5);
  });
});
