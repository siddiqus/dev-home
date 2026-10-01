import { jiraClient, jiraClientV2, jiraAgileClient } from "../http";
import { ApiError } from "../http/errors";

/**
 * GET /api/teams-jira/users/search?q= → searchUsers({ q })
 * Type-ahead search for Jira users. Returns accountId (stable match key),
 * displayName, emailAddress (often null due to privacy), and a small avatar.
 */
export async function searchUsers(args: { q: string }): Promise<{ users: any[] }> {
  const q = typeof args.q === "string" ? args.q.trim() : "";
  if (!q) {
    return { users: [] };
  }
  const jira = jiraClient();
  const mapUser = (u: any) => ({
    accountId: u.accountId,
    displayName: u.displayName,
    emailAddress: u.emailAddress || null,
    avatarUrl: u.avatarUrls?.["24x24"] || "",
  });

  const requests: Promise<any[]>[] = [
    jira.get("/user/search", { params: { query: q, maxResults: 20 } }).then((r) => r.data || []),
  ];
  if (q.includes("@")) {
    // The v3 `query` param often misses users whose email visibility is
    // private. Fall back to the v2 endpoint which still supports searching
    // by email via the `username` param on Jira Cloud.
    const jiraV2 = jiraClientV2();
    requests.push(
      jiraV2
        .get("/user/search", { params: { username: q, maxResults: 20 } })
        .then((r) => r.data || [])
        .catch(() => []),
    );
  }
  const results = await Promise.all(requests);
  const seen = new Set<string>();
  const users: any[] = [];
  for (const batch of results) {
    for (const u of batch) {
      if (!seen.has(u.accountId)) {
        seen.add(u.accountId);
        users.push(mapUser(u));
      }
    }
  }
  return { users };
}

/**
 * GET /api/teams-jira/boards/search?q= → searchBoards({ q })
 * Search scrum boards by name. Returns id, name, and project location.
 */
export async function searchBoards(args: { q: string }): Promise<{ boards: any[] }> {
  const q = typeof args.q === "string" ? args.q.trim() : "";
  const agile = jiraAgileClient();
  const boards: any[] = [];
  let startAt = 0;
  const maxResults = 50;
  // Paginate until isLast; cap at 200 to bound latency.
  while (boards.length < 200) {
    const { data } = await agile.get("/board", {
      params: { type: "scrum", name: q || undefined, startAt, maxResults },
    });
    for (const b of data.values || []) {
      boards.push({
        id: b.id,
        name: b.name,
        projectKey: b.location?.projectKey || "",
        projectName: b.location?.projectName || "",
      });
    }
    if (data.isLast || (data.values || []).length < maxResults) break;
    startAt += maxResults;
  }
  return { boards };
}

/**
 * GET /api/teams-jira/boards/:id/sprints → getBoardSprints({ id })
 * Return active + recent closed sprints for a board, newest first.
 */
export async function getBoardSprints(args: { id: number }): Promise<{ sprints: any[] }> {
  const boardId = args.id;
  if (isNaN(boardId)) {
    throw new ApiError(400, "invalid board id");
  }
  const agile = jiraAgileClient();
  const sprints: any[] = [];
  let startAt = 0;
  const maxResults = 50;
  while (sprints.length < 200) {
    const { data } = await agile.get(`/board/${boardId}/sprint`, {
      params: { state: "active,closed", startAt, maxResults },
    });
    for (const s of data.values || []) {
      sprints.push({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate,
        endDate: s.endDate,
      });
    }
    if (data.isLast || (data.values || []).length < maxResults) break;
    startAt += maxResults;
  }
  // Active first, then closed by most recent end date.
  sprints.sort((a, b) => {
    if (a.state === "active" && b.state !== "active") return -1;
    if (b.state === "active" && a.state !== "active") return 1;
    return new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime();
  });
  return { sprints };
}
