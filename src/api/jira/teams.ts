import { jiraClient, jiraClientV2, jiraAgileClient } from "../http";
import { ApiError } from "../http/errors";
import { requireSettings } from "../http/credentials";

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

const SPRINT_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CLOSED_SPRINTS = 25;
const sprintCache = new Map<string, { at: number; value: Promise<{ sprints: any[] }> }>();

/**
 * GET /api/teams-jira/boards/:id/sprints → getBoardSprints({ id })
 * The board's active sprints plus its most recent closed ones: active first,
 * then closed by most recent end date. The Agile API lists sprints oldest-first,
 * so every page is read to reach the newest. Cached per board for 30 minutes
 * (closed sprints rarely change); pass `force` to bypass.
 */
export function getBoardSprints(args: {
  id: number;
  force?: boolean;
}): Promise<{ sprints: any[] }> {
  const boardId = args.id;
  if (isNaN(boardId)) {
    return Promise.reject(new ApiError(400, "invalid board id"));
  }
  const key = `${requireSettings().jiraBaseUrl}|${boardId}`;
  const hit = sprintCache.get(key);
  if (!args.force && hit && Date.now() - hit.at < SPRINT_CACHE_TTL_MS) return hit.value;
  const value = loadBoardSprints(boardId);
  sprintCache.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (sprintCache.get(key)?.value === value) sprintCache.delete(key);
  });
  return value;
}

/** Test hook: drop cached sprint lists. */
export function clearSprintCache(): void {
  sprintCache.clear();
}

async function loadBoardSprints(boardId: number): Promise<{ sprints: any[] }> {
  const agile = jiraAgileClient();
  const all: any[] = [];
  const maxResults = 50;
  for (let startAt = 0, pages = 0; pages < 40; startAt += maxResults, pages++) {
    const { data } = await agile.get(`/board/${boardId}/sprint`, {
      params: { state: "active,closed", startAt, maxResults },
    });
    const values = data.values || [];
    for (const s of values) {
      all.push({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate,
        endDate: s.endDate,
        goal: s.goal || undefined,
      });
    }
    if (data.isLast || values.length < maxResults) break;
  }
  const byEnd = (a: any, b: any) =>
    new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime();
  const active = all.filter((s) => s.state === "active").sort(byEnd);
  const closed = all
    .filter((s) => s.state !== "active")
    .sort(byEnd)
    .slice(0, MAX_CLOSED_SPRINTS);
  return { sprints: [...active, ...closed] };
}
