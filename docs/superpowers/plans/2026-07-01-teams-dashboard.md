# Teams & Team Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Teams" feature — team management (CRUD) plus a per-team aggregated dashboard combining Jira tickets and GitHub PRs for an engineering manager.

**Architecture:** Two new SQLite tables (`teams`, `team_members`) with a CRUD router; an additive Jira Agile API client and search/board/sprint endpoints; a single dashboard aggregator endpoint that resolves the roster, fetches Jira issues (Agile sprint or board-less JQL) and GitHub PRs (batched), links PRs↔tickets by Jira key in the title, partitions in-sprint vs off-board PRs, and groups by epic. Frontend adds two nav tabs (Teams management + Team Dashboard) following the existing hook→service→apiClient pattern, with pure aggregation helpers kept I/O-free.

**Tech Stack:** Express + better-sqlite3 (backend), React + TypeScript + Bootstrap + @tanstack/react-table (frontend), Jira REST v3 + Jira Agile 1.0, GitHub GraphQL. No new dependencies; no test runner.

**Spec:** `docs/superpowers/specs/2026-07-01-teams-dashboard-design.md`

---

## Phase / dependency map (for parallel execution)

- **Phase A — Backend foundation** (sequential first): Task 1 (DB migrations) → Task 2 (Agile client). These unblock everything backend.
- **Phase B — Backend endpoints** (parallelizable after A): Task 3 (Jira search/board/sprint routes), Task 4 (Teams CRUD router), Task 5 (pure aggregation helpers). Task 5 has NO dependency on 3/4 — it's pure functions.
- **Phase C — Aggregator** (after 3, 4, 5): Task 6 (dashboard aggregator endpoint) + Task 7 (mount routers in index.ts).
- **Phase D — Frontend services/types** (parallelizable after C exists, or in parallel using the documented contracts): Task 8 (types), Task 9 (services), Task 10 (hooks).
- **Phase E — Frontend views** (after D): Task 11 (TeamsView + member editor), Task 12 (read-only board + issue data table components), Task 13 (TeamDashboardView assembling sections).
- **Phase F — Wiring** (last): Task 14 (nav registration in navTabs.ts + App.tsx).

Agents executing in parallel: within Phase B, Tasks 3/4/5 touch different files and can run concurrently. Within Phase E, Tasks 11 and 12 touch different files and can run concurrently; Task 13 depends on both.

---

## Shared contracts (types both ends rely on)

These TypeScript shapes are the integration contract. Backend produces them; frontend consumes them. Defined in Task 8 for the frontend; the backend produces matching JSON.

```typescript
// A team member (resolved Jira user + GitHub user)
interface TeamMember {
  id: number;
  team_id: number;
  display_name: string;
  jira_account_id: string;
  jira_email: string | null;
  github_username: string;
}

interface Team {
  id: number;
  name: string;
  jira_board_id: number | null;
  jira_board_name: string | null;
  member_count?: number;
}

interface JiraUserResult {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
  avatarUrl: string;
}

interface JiraBoardResult {
  id: number;
  name: string;
  projectKey: string;
  projectName: string;
}

interface SprintResult {
  id: number;
  name: string;
  state: "active" | "closed" | "future";
  startDate?: string;
  endDate?: string;
}

interface LinkedPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  state: string;
  checks_status: string | null;
  author: string;
}

interface DashboardIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string; // "new" | "indeterminate" | "done"
  assigneeAccountId: string | null;
  assigneeName: string | null;
  epicKey: string | null;
  epicName: string | null;
  linkedPRs: LinkedPR[];
}

interface DashboardEpic {
  key: string | null; // null = "No epic" bucket
  name: string;
  total: number;
  done: number;
  issueKeys: string[];
}

interface WorkloadEntry {
  accountId: string;
  displayName: string;
  githubUsername: string;
  ticketCount: number;
  prCount: number;
  byStatus: { new: number; indeterminate: number; done: number };
}

interface OffBoardPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  author: string;
  state: string;
  ticketKey: string | null;
  ticketProject: string | null; // set when ticket exists but is from another project
}

interface TeamDashboard {
  team: { id: number; name: string; board: { id: number; name: string } | null };
  sprint: SprintResult | null;
  sprints: SprintResult[];
  epics: DashboardEpic[];
  issues: DashboardIssue[];
  workload: WorkloadEntry[];
  offBoardPRs: OffBoardPR[];
  counts: { sprintIssues: number; epics: number; offBoardPRs: number };
  errors: string[];
}
```

---

## Task 1: Database migrations for teams

**Files:**
- Modify: `server/src/db.ts` (append to `MIGRATIONS` array, currently 11 entries ending line ~193)

- [ ] **Step 1: Append two migrations to the MIGRATIONS array**

In `server/src/db.ts`, after migration 11 (the `pinned` column on notes, ending near line 193), add these two entries BEFORE the closing `];`:

```typescript
  // 12 – create teams table
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        jira_board_id INTEGER,
        jira_board_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },

  // 13 – create team_members table
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        display_name TEXT NOT NULL,
        jira_account_id TEXT NOT NULL,
        jira_email TEXT,
        github_username TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
    `);
  },
```

- [ ] **Step 2: Verify the server starts and migrations run**

Run: `cd server && yarn build`
Expected: TypeScript compiles with no errors.

Run: `cd server && DEV_HOME_DB_PATH=/tmp/teams-test.db node dist/standalone.js &` then after ~2s: `sqlite3 /tmp/teams-test.db ".tables"` (if sqlite3 CLI available) OR `node -e "const D=require('better-sqlite3'); const d=new D('/tmp/teams-test.db'); console.log(d.prepare('SELECT version FROM schema_version').get());"`
Expected: `teams` and `team_members` appear in tables; schema_version is 13. Kill the server after.

- [ ] **Step 3: Commit**

```bash
git add server/src/db.ts
git commit -m "feat(teams): add teams and team_members tables"
```

---

## Task 2: Jira Agile API client

**Files:**
- Modify: `server/src/clients/jiraApiClient.ts` (add a second factory)

- [ ] **Step 1: Add an Agile client factory**

In `server/src/clients/jiraApiClient.ts`, after the existing `createJiraClient` function, add:

```typescript
/**
 * Creates an Axios instance for the JIRA Software (Agile) REST API at
 * /rest/agile/1.0. Same host and Basic auth as the platform client — only the
 * base path differs. Rebuilt per call so runtime config changes take effect.
 */
export function createJiraAgileClient() {
  const config = getConfig();
  const credentials = Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString("base64");

  return axios.create({
    baseURL: `${config.jiraBaseUrl}/rest/agile/1.0`,
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd server && yarn build`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/clients/jiraApiClient.ts
git commit -m "feat(teams): add Jira Agile API client factory"
```

---

## Task 3: Jira search / board / sprint endpoints

**Files:**
- Create: `server/src/routes/teamsJira.ts` (new router for team-related Jira lookups)

- [ ] **Step 1: Create the router with three endpoints**

Create `server/src/routes/teamsJira.ts`:

```typescript
import { Router, Request, Response } from "express";
import { createJiraClient, createJiraAgileClient } from "../clients/jiraApiClient";

const router = Router();

/**
 * GET /api/teams-jira/users/search?q=
 * Type-ahead search for Jira users. Returns accountId (stable match key),
 * displayName, emailAddress (often null due to privacy), and a small avatar.
 */
router.get("/users/search", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json({ users: [] });
    return;
  }
  const jira = createJiraClient();
  const { data } = await jira.get("/user/search", { params: { query: q, maxResults: 20 } });
  const users = (data || []).map((u: any) => ({
    accountId: u.accountId,
    displayName: u.displayName,
    emailAddress: u.emailAddress || null,
    avatarUrl: u.avatarUrls?.["24x24"] || "",
  }));
  res.json({ users });
});

/**
 * GET /api/teams-jira/boards/search?q=
 * Search scrum boards by name. Returns id, name, and project location.
 */
router.get("/boards/search", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const agile = createJiraAgileClient();
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
  res.json({ boards });
});

/**
 * GET /api/teams-jira/boards/:id/sprints
 * Return active + recent closed sprints for a board, newest first.
 */
router.get("/boards/:id/sprints", async (req: Request, res: Response) => {
  const boardId = parseInt(req.params.id, 10);
  if (isNaN(boardId)) {
    res.status(400).json({ error: "invalid board id" });
    return;
  }
  const agile = createJiraAgileClient();
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
  res.json({ sprints });
});

export default router;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd server && yarn build`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/teamsJira.ts
git commit -m "feat(teams): add Jira user/board/sprint search endpoints"
```

---

## Task 4: Teams CRUD router

**Files:**
- Create: `server/src/routes/teams.ts`

- [ ] **Step 1: Create the CRUD router**

Create `server/src/routes/teams.ts` (mirrors the prepared-statement style in `server/src/routes/notes.ts`):

```typescript
import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();

/** GET /api/teams — list teams with member counts. */
router.get("/", (_req: Request, res: Response) => {
  const db = getDb();
  const teams = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count
       FROM teams t ORDER BY t.name COLLATE NOCASE`,
    )
    .all();
  res.json({ teams });
});

/** POST /api/teams — create a team. Body: { name, boardId?, boardName? } */
router.post("/", (req: Request, res: Response) => {
  const { name, boardId, boardName } = req.body || {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const db = getDb();
  const result = db
    .prepare("INSERT INTO teams (name, jira_board_id, jira_board_name) VALUES (?, ?, ?)")
    .run(name.trim(), boardId ?? null, boardName ?? null);
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(result.lastInsertRowid);
  res.json({ team });
});

/** PUT /api/teams/:id — update name/board. */
router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { name, boardId, boardName } = req.body || {};
  const db = getDb();
  const existing = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
  if (!existing) {
    res.status(404).json({ error: "team not found" });
    return;
  }
  db.prepare(
    "UPDATE teams SET name = ?, jira_board_id = ?, jira_board_name = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(name ?? (existing as any).name, boardId ?? null, boardName ?? null, id);
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
  res.json({ team });
});

/** DELETE /api/teams/:id — delete team and its members. */
router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM team_members WHERE team_id = ?").run(id);
    db.prepare("DELETE FROM teams WHERE id = ?").run(id);
  })();
  res.json({ ok: true });
});

/** GET /api/teams/:id/members */
router.get("/:id/members", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  const members = db
    .prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY display_name COLLATE NOCASE")
    .all(id);
  res.json({ members });
});

/** POST /api/teams/:id/members — Body: { displayName, jiraAccountId, jiraEmail?, githubUsername } */
router.post("/:id/members", (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id, 10);
  const { displayName, jiraAccountId, jiraEmail, githubUsername } = req.body || {};
  if (!displayName || !jiraAccountId || !githubUsername) {
    res.status(400).json({ error: "displayName, jiraAccountId, githubUsername are required" });
    return;
  }
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO team_members (team_id, display_name, jira_account_id, jira_email, github_username)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(teamId, displayName, jiraAccountId, jiraEmail ?? null, githubUsername);
  const member = db.prepare("SELECT * FROM team_members WHERE id = ?").get(result.lastInsertRowid);
  res.json({ member });
});

/** DELETE /api/teams/:teamId/members/:memberId */
router.delete("/:teamId/members/:memberId", (req: Request, res: Response) => {
  const memberId = parseInt(req.params.memberId, 10);
  const db = getDb();
  db.prepare("DELETE FROM team_members WHERE id = ?").run(memberId);
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd server && yarn build`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/teams.ts
git commit -m "feat(teams): add teams CRUD router"
```

---

## Task 5: Pure aggregation helpers

**Files:**
- Create: `server/src/services/teamAggregation.ts`

These are pure functions (no I/O) so they stay testable and isolated. The aggregator (Task 6) calls them after fetching raw data.

- [ ] **Step 1: Create the helper module**

Create `server/src/services/teamAggregation.ts`:

```typescript
/**
 * Pure aggregation helpers for the team dashboard. No I/O — given raw Jira
 * issues + GitHub PRs (already fetched), produce the composed dashboard shapes.
 */

/** Extract a Jira key from a PR title: "PROJ-123 ..." or "[PROJ-123]". */
export function extractTicketKey(title: string): string | null {
  const startMatch = title.match(/^([A-Z]+-\d+)/i);
  if (startMatch) return startMatch[1].toUpperCase();
  const bracketMatch = title.match(/\[([a-zA-Z]+-\d+)\]/i);
  if (bracketMatch) return bracketMatch[1].toUpperCase();
  return null;
}

/** Project key portion of a Jira key, e.g. "CCP-12" -> "CCP". */
export function projectOfKey(key: string): string {
  const m = key.match(/^([A-Z]+)-\d+$/i);
  return m ? m[1].toUpperCase() : "";
}

export interface RawPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  state: string;
  checks_status: string | null;
  author: string;
  created_at: string;
}

export interface RawIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string; // "new" | "indeterminate" | "done"
  assigneeAccountId: string | null;
  assigneeName: string | null;
  epicKey: string | null;
  epicName: string | null;
}

export interface RosterEntry {
  accountId: string;
  displayName: string;
  githubUsername: string;
}

/**
 * Attach linked PRs to each issue. A PR links to an issue if the ticket key
 * parsed from its title equals the issue key.
 */
export function linkPRsToIssues(issues: RawIssue[], prs: RawPR[]) {
  const byKey = new Map<string, RawPR[]>();
  for (const pr of prs) {
    const key = extractTicketKey(pr.title);
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(pr);
    byKey.set(key, list);
  }
  return issues.map((issue) => ({
    ...issue,
    linkedPRs: (byKey.get(issue.key) || []).map((pr) => ({
      number: pr.number,
      title: pr.title,
      repo_full_name: pr.repo_full_name,
      html_url: pr.html_url,
      state: pr.state,
      checks_status: pr.checks_status,
      author: pr.author,
    })),
  }));
}

/**
 * Partition PRs into "off-board": PRs whose ticket key is NOT in the sprint
 * issue set (includes PRs with no ticket, and tickets from other projects).
 * `sprintKeys` is the set of issue keys currently in scope.
 */
export function partitionOffBoardPRs(prs: RawPR[], sprintKeys: Set<string>) {
  const offBoard = [];
  for (const pr of prs) {
    const key = extractTicketKey(pr.title);
    if (key && sprintKeys.has(key)) continue; // in-sprint, skip
    offBoard.push({
      number: pr.number,
      title: pr.title,
      repo_full_name: pr.repo_full_name,
      html_url: pr.html_url,
      author: pr.author,
      state: pr.state,
      ticketKey: key,
      ticketProject: key ? projectOfKey(key) : null,
    });
  }
  return offBoard;
}

/**
 * Group issues by epic. Issues with no epic roll into a synthetic bucket
 * with key=null, name="No epic".
 */
export function groupByEpic(issues: RawIssue[]) {
  const map = new Map<string | null, { key: string | null; name: string; total: number; done: number; issueKeys: string[] }>();
  for (const issue of issues) {
    const epicKey = issue.epicKey ?? null;
    const bucketKey = epicKey;
    let bucket = map.get(bucketKey);
    if (!bucket) {
      bucket = {
        key: epicKey,
        name: epicKey ? issue.epicName || epicKey : "No epic",
        total: 0,
        done: 0,
        issueKeys: [],
      };
      map.set(bucketKey, bucket);
    }
    bucket.total += 1;
    if (issue.statusCategory === "done") bucket.done += 1;
    bucket.issueKeys.push(issue.key);
  }
  // Real epics first (by total desc), "No epic" last.
  return [...map.values()].sort((a, b) => {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return b.total - a.total;
  });
}

/** Per-member ticket + PR counts and status breakdown. */
export function computeWorkload(roster: RosterEntry[], issues: RawIssue[], prs: RawPR[]) {
  return roster.map((r) => {
    const memberIssues = issues.filter((i) => i.assigneeAccountId === r.accountId);
    const byStatus = { new: 0, indeterminate: 0, done: 0 };
    for (const i of memberIssues) {
      if (i.statusCategory === "done") byStatus.done += 1;
      else if (i.statusCategory === "indeterminate") byStatus.indeterminate += 1;
      else byStatus.new += 1;
    }
    const prCount = prs.filter(
      (p) => p.author.toLowerCase() === r.githubUsername.toLowerCase(),
    ).length;
    return {
      accountId: r.accountId,
      displayName: r.displayName,
      githubUsername: r.githubUsername,
      ticketCount: memberIssues.length,
      prCount,
      byStatus,
    };
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd server && yarn build`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/teamAggregation.ts
git commit -m "feat(teams): add pure aggregation helpers"
```

---

## Task 6: Dashboard aggregator endpoint

**Files:**
- Modify: `server/src/routes/teams.ts` (add the dashboard route + helpers)

- [ ] **Step 1: Add imports and a batched PR-fetch helper to teams.ts**

At the top of `server/src/routes/teams.ts`, add these imports below the existing ones:

```typescript
import { getConfig } from "../config";
import { createJiraClient, createJiraAgileClient } from "../clients/jiraApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import {
  linkPRsToIssues,
  partitionOffBoardPRs,
  groupByEpic,
  computeWorkload,
  type RawIssue,
  type RawPR,
  type RosterEntry,
} from "../services/teamAggregation";
```

Then, before `export default router;`, add the PR search query + a batched fetcher:

```typescript
const MEMBER_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 30) {
      nodes {
        ... on PullRequest {
          number title url state createdAt
          author { login }
          repository { nameWithOwner }
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        }
      }
    }
  }
`;

function twoWeeksAgoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString().slice(0, 10);
}

/** Fetch each member's PRs (last 2 weeks) in batches to bound concurrency. */
async function fetchMemberPRs(roster: RosterEntry[]): Promise<RawPR[]> {
  const since = twoWeeksAgoISO();
  const batchSize = 5;
  const all: RawPR[] = [];
  for (let i = 0; i < roster.length; i += batchSize) {
    const batch = roster.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (m) => {
        const q = `author:${m.githubUsername} type:pr created:>=${since}`;
        try {
          const data = await graphql<{ search: { nodes: any[] } }>(MEMBER_PRS_QUERY, { q });
          return (data.search.nodes || []).map((n: any) => ({
            number: n.number,
            title: n.title,
            repo_full_name: n.repository?.nameWithOwner || "",
            html_url: n.url,
            state: (n.state || "").toLowerCase(),
            checks_status: n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state || null,
            author: n.author?.login || m.githubUsername,
            created_at: n.createdAt,
          })) as RawPR[];
        } catch {
          return [] as RawPR[];
        }
      }),
    );
    for (const r of results) all.push(...r);
  }
  return all;
}
```

- [ ] **Step 2: Add the dashboard route**

Still in `server/src/routes/teams.ts`, before `export default router;`, add:

```typescript
/**
 * GET /api/teams/:id/dashboard?sprintId=
 * Aggregate Jira issues + GitHub PRs for the team's roster.
 */
router.get("/:id/dashboard", async (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id, 10);
  const db = getDb();
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId) as any;
  if (!team) {
    res.status(404).json({ error: "team not found" });
    return;
  }
  const memberRows = db
    .prepare("SELECT * FROM team_members WHERE team_id = ?")
    .all(teamId) as any[];
  const roster: RosterEntry[] = memberRows.map((m) => ({
    accountId: m.jira_account_id,
    displayName: m.display_name,
    githubUsername: m.github_username,
  }));

  const errors: string[] = [];
  let issues: RawIssue[] = [];
  let sprints: any[] = [];
  let currentSprint: any = null;

  const accountIds = roster.map((r) => r.accountId);
  const requestedSprintId =
    typeof req.query.sprintId === "string" ? parseInt(req.query.sprintId, 10) : null;

  // --- Jira ---
  if (accountIds.length > 0) {
    try {
      if (team.jira_board_id) {
        const agile = createJiraAgileClient();
        // Sprint list for the selector.
        const { data: sprintData } = await agile.get(`/board/${team.jira_board_id}/sprint`, {
          params: { state: "active,closed", maxResults: 50 },
        });
        sprints = (sprintData.values || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          state: s.state,
          startDate: s.startDate,
          endDate: s.endDate,
        }));
        currentSprint =
          sprints.find((s) => s.id === requestedSprintId) ||
          sprints.find((s) => s.state === "active") ||
          null;

        if (currentSprint) {
          const { data: issueData } = await agile.get(
            `/board/${team.jira_board_id}/sprint/${currentSprint.id}/issue`,
            { params: { fields: "summary,status,assignee,epic,priority", maxResults: 100 } },
          );
          issues = mapAgileIssues(issueData.issues || []).filter(
            (i) => i.assigneeAccountId && accountIds.includes(i.assigneeAccountId),
          );
        }
      } else {
        // Board-less: roster-wide open tickets via JQL.
        const jira = createJiraClient();
        const idList = accountIds.map((a) => `"${a}"`).join(", ");
        const jql = `assignee IN (${idList}) AND statusCategory != Done ORDER BY updated DESC`;
        const { data } = await jira.post("/search/jql", {
          jql,
          fields: ["summary", "status", "assignee", "parent", "priority"],
          maxResults: 100,
        });
        issues = mapJqlIssues(data.issues || []);
      }
    } catch (err: any) {
      errors.push(`Jira: ${err.message || "failed to load issues"}`);
    }
  }

  // --- GitHub ---
  let prs: RawPR[] = [];
  if (roster.length > 0) {
    try {
      prs = await fetchMemberPRs(roster);
    } catch (err: any) {
      errors.push(`GitHub: ${err.message || "failed to load PRs"}`);
    }
  }

  // --- Aggregate ---
  const sprintKeys = new Set(issues.map((i) => i.key));
  const issuesWithPRs = linkPRsToIssues(issues, prs);
  const offBoardPRs = partitionOffBoardPRs(prs, sprintKeys);
  const epics = groupByEpic(issues);
  const workload = computeWorkload(roster, issues, prs);

  res.json({
    team: {
      id: team.id,
      name: team.name,
      board: team.jira_board_id
        ? { id: team.jira_board_id, name: team.jira_board_name }
        : null,
    },
    sprint: currentSprint,
    sprints,
    epics,
    issues: issuesWithPRs,
    workload,
    offBoardPRs,
    counts: {
      sprintIssues: issues.length,
      epics: epics.length,
      offBoardPRs: offBoardPRs.length,
    },
    errors,
  });
});
```

- [ ] **Step 3: Add the two issue-mapper helpers**

Still in `server/src/routes/teams.ts`, before `export default router;`, add:

```typescript
/** Map Agile-API issues (which carry a dedicated `epic` field). */
function mapAgileIssues(rawIssues: any[]): RawIssue[] {
  return rawIssues.map((issue: any) => ({
    key: issue.key,
    summary: issue.fields?.summary || "",
    status: issue.fields?.status?.name || "",
    statusCategory: issue.fields?.status?.statusCategory?.key || "new",
    assigneeAccountId: issue.fields?.assignee?.accountId || null,
    assigneeName: issue.fields?.assignee?.displayName || null,
    epicKey: issue.fields?.epic?.key || null,
    epicName: issue.fields?.epic?.name || null,
  }));
}

/** Map platform JQL issues (epic derived from `parent`). */
function mapJqlIssues(rawIssues: any[]): RawIssue[] {
  return rawIssues.map((issue: any) => {
    const parent = issue.fields?.parent;
    const parentIsEpic = parent?.fields?.issuetype?.name?.toLowerCase() === "epic";
    return {
      key: issue.key,
      summary: issue.fields?.summary || "",
      status: issue.fields?.status?.name || "",
      statusCategory: issue.fields?.status?.statusCategory?.key || "new",
      assigneeAccountId: issue.fields?.assignee?.accountId || null,
      assigneeName: issue.fields?.assignee?.displayName || null,
      epicKey: parentIsEpic ? parent.key : parent?.key || null,
      epicName: parentIsEpic
        ? parent.fields?.summary || parent.key
        : parent?.fields?.summary || null,
    };
  });
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd server && yarn build`
Expected: compiles with no errors. If `graphql` import path is wrong, check `server/src/clients/githubGraphqlClient.ts` exports (it exports a `graphql` function — see `server/src/routes/github.ts:4`).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/teams.ts
git commit -m "feat(teams): add team dashboard aggregator endpoint"
```

---

## Task 7: Mount routers in the server

**Files:**
- Modify: `server/src/index.ts:6-14` (imports) and `:47-55` (mounts)

- [ ] **Step 1: Add imports**

In `server/src/index.ts`, after line 14 (`import claudeRoutes from "./routes/claude";`), add:

```typescript
import teamsRoutes from "./routes/teams";
import teamsJiraRoutes from "./routes/teamsJira";
```

- [ ] **Step 2: Mount the routers**

In `server/src/index.ts`, after line 55 (`app.use("/api/claude", claudeRoutes);`), add:

```typescript
  app.use("/api/teams", teamsRoutes);
  app.use("/api/teams-jira", teamsJiraRoutes);
```

- [ ] **Step 3: Verify the server builds and starts**

Run: `cd server && yarn build`
Expected: compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(teams): mount teams routers"
```

---

## Task 8: Frontend types

**Files:**
- Create: `src/types/teams.ts`

- [ ] **Step 1: Create the types file**

Create `src/types/teams.ts` with all shapes from the "Shared contracts" section above (copy the full block verbatim, adding `export` to each `interface`). This is the single source of truth for the frontend.

```typescript
export interface TeamMember {
  id: number;
  team_id: number;
  display_name: string;
  jira_account_id: string;
  jira_email: string | null;
  github_username: string;
}

export interface Team {
  id: number;
  name: string;
  jira_board_id: number | null;
  jira_board_name: string | null;
  member_count?: number;
}

export interface JiraUserResult {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
  avatarUrl: string;
}

export interface JiraBoardResult {
  id: number;
  name: string;
  projectKey: string;
  projectName: string;
}

export interface SprintResult {
  id: number;
  name: string;
  state: "active" | "closed" | "future";
  startDate?: string;
  endDate?: string;
}

export interface LinkedPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  state: string;
  checks_status: string | null;
  author: string;
}

export interface DashboardIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  assigneeAccountId: string | null;
  assigneeName: string | null;
  epicKey: string | null;
  epicName: string | null;
  linkedPRs: LinkedPR[];
}

export interface DashboardEpic {
  key: string | null;
  name: string;
  total: number;
  done: number;
  issueKeys: string[];
}

export interface WorkloadEntry {
  accountId: string;
  displayName: string;
  githubUsername: string;
  ticketCount: number;
  prCount: number;
  byStatus: { new: number; indeterminate: number; done: number };
}

export interface OffBoardPR {
  number: number;
  title: string;
  repo_full_name: string;
  html_url: string;
  author: string;
  state: string;
  ticketKey: string | null;
  ticketProject: string | null;
}

export interface TeamDashboard {
  team: { id: number; name: string; board: { id: number; name: string } | null };
  sprint: SprintResult | null;
  sprints: SprintResult[];
  epics: DashboardEpic[];
  issues: DashboardIssue[];
  workload: WorkloadEntry[];
  offBoardPRs: OffBoardPR[];
  counts: { sprintIssues: number; epics: number; offBoardPRs: number };
  errors: string[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `yarn build` (or `yarn tsc --noEmit` if faster)
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/teams.ts
git commit -m "feat(teams): add frontend team types"
```

---

## Task 9: Frontend services

**Files:**
- Create: `src/services/teams.ts`

- [ ] **Step 1: Create the service module**

Create `src/services/teams.ts` (follows the `apiClient` pattern from `src/services/config.ts` / `src/services/github.ts`):

```typescript
import { apiClient } from "./config";
import type {
  Team,
  TeamMember,
  JiraUserResult,
  JiraBoardResult,
  SprintResult,
  TeamDashboard,
} from "../types/teams";

export async function fetchTeams(): Promise<Team[]> {
  const { data } = await apiClient.get("/teams");
  return data.teams || [];
}

export async function createTeam(input: {
  name: string;
  boardId?: number | null;
  boardName?: string | null;
}): Promise<Team> {
  const { data } = await apiClient.post("/teams", input);
  return data.team;
}

export async function updateTeam(
  id: number,
  input: { name?: string; boardId?: number | null; boardName?: string | null },
): Promise<Team> {
  const { data } = await apiClient.put(`/teams/${id}`, input);
  return data.team;
}

export async function deleteTeam(id: number): Promise<void> {
  await apiClient.delete(`/teams/${id}`);
}

export async function fetchTeamMembers(teamId: number): Promise<TeamMember[]> {
  const { data } = await apiClient.get(`/teams/${teamId}/members`);
  return data.members || [];
}

export async function addTeamMember(
  teamId: number,
  input: {
    displayName: string;
    jiraAccountId: string;
    jiraEmail?: string | null;
    githubUsername: string;
  },
): Promise<TeamMember> {
  const { data } = await apiClient.post(`/teams/${teamId}/members`, input);
  return data.member;
}

export async function removeTeamMember(teamId: number, memberId: number): Promise<void> {
  await apiClient.delete(`/teams/${teamId}/members/${memberId}`);
}

export async function searchJiraUsers(q: string): Promise<JiraUserResult[]> {
  const { data } = await apiClient.get("/teams-jira/users/search", { params: { q } });
  return data.users || [];
}

export async function searchJiraBoards(q: string): Promise<JiraBoardResult[]> {
  const { data } = await apiClient.get("/teams-jira/boards/search", { params: { q } });
  return data.boards || [];
}

export async function fetchBoardSprints(boardId: number): Promise<SprintResult[]> {
  const { data } = await apiClient.get(`/teams-jira/boards/${boardId}/sprints`);
  return data.sprints || [];
}

export async function fetchTeamDashboard(
  teamId: number,
  sprintId?: number | null,
): Promise<TeamDashboard> {
  const { data } = await apiClient.get(`/teams/${teamId}/dashboard`, {
    params: sprintId ? { sprintId } : {},
  });
  return data;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `yarn build`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/teams.ts
git commit -m "feat(teams): add frontend team services"
```

---

## Task 10: Frontend hooks

**Files:**
- Create: `src/hooks/useTeams.ts`
- Create: `src/hooks/useTeamDashboard.ts`

- [ ] **Step 1: Create useTeams**

Create `src/hooks/useTeams.ts`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { fetchTeams } from "../services/teams";
import type { Team } from "../types/teams";

export function useTeams(active: boolean) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTeams()
      .then((t) => {
        if (!cancelled) setTeams(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load teams");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, refreshKey]);

  return { teams, loading, error, refresh };
}
```

- [ ] **Step 2: Create useTeamDashboard**

Create `src/hooks/useTeamDashboard.ts`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { fetchTeamDashboard } from "../services/teams";
import type { TeamDashboard } from "../types/teams";

export function useTeamDashboard(teamId: number | null, sprintId: number | null) {
  const [dashboard, setDashboard] = useState<TeamDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (teamId == null) {
      setDashboard(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTeamDashboard(teamId, sprintId)
      .then((d) => {
        if (!cancelled) setDashboard(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, sprintId, refreshKey]);

  return { dashboard, loading, error, refresh };
}
```

- [ ] **Step 3: Verify it compiles**

Run: `yarn build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTeams.ts src/hooks/useTeamDashboard.ts
git commit -m "feat(teams): add team hooks"
```

---

## Task 11: TeamsView + member editor

**Files:**
- Create: `src/views/teams/TeamsView.tsx`
- Create: `src/views/teams/TeamEditor.tsx`
- Create: `src/views/teams/MemberSearchRow.tsx`

- [ ] **Step 1: Create MemberSearchRow (two type-aheads)**

Create `src/views/teams/MemberSearchRow.tsx`. It has two debounced search inputs (Jira user, GitHub member) and an Add button. GitHub members come from the existing `/github/org-members` endpoint via `apiClient`.

```typescript
import { useState } from "react";
import { searchJiraUsers } from "../../services/teams";
import { apiClient } from "../../services/config";
import type { JiraUserResult } from "../../types/teams";

interface GhMember {
  login: string;
  avatar_url: string;
}

interface Props {
  onAdd: (member: {
    displayName: string;
    jiraAccountId: string;
    jiraEmail: string | null;
    githubUsername: string;
  }) => void;
}

export function MemberSearchRow({ onAdd }: Props) {
  const [jiraQuery, setJiraQuery] = useState("");
  const [jiraResults, setJiraResults] = useState<JiraUserResult[]>([]);
  const [selectedJira, setSelectedJira] = useState<JiraUserResult | null>(null);

  const [ghQuery, setGhQuery] = useState("");
  const [ghResults, setGhResults] = useState<GhMember[]>([]);
  const [selectedGh, setSelectedGh] = useState<GhMember | null>(null);

  const runJiraSearch = async (q: string) => {
    setJiraQuery(q);
    if (q.trim().length < 2) return setJiraResults([]);
    try {
      setJiraResults(await searchJiraUsers(q));
    } catch {
      setJiraResults([]);
    }
  };

  const runGhSearch = async (q: string) => {
    setGhQuery(q);
    if (q.trim().length < 1) return setGhResults([]);
    try {
      const { data } = await apiClient.get("/github/org-members");
      const members: GhMember[] = data.members || [];
      setGhResults(
        members.filter((m) => m.login.toLowerCase().includes(q.toLowerCase())).slice(0, 10),
      );
    } catch {
      setGhResults([]);
    }
  };

  const canAdd = selectedJira && selectedGh;

  return (
    <div className="d-flex gap-2 align-items-start flex-wrap">
      <div style={{ flex: 1, minWidth: 200 }}>
        <input
          className="form-control form-control-sm"
          placeholder="Search Jira user…"
          value={selectedJira ? selectedJira.displayName : jiraQuery}
          onChange={(e) => {
            setSelectedJira(null);
            runJiraSearch(e.target.value);
          }}
        />
        {!selectedJira &&
          jiraResults.map((u) => (
            <div
              key={u.accountId}
              className="p-1 small"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSelectedJira(u);
                setJiraResults([]);
              }}
            >
              {u.displayName} {u.emailAddress ? `· ${u.emailAddress}` : ""}
            </div>
          ))}
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <input
          className="form-control form-control-sm"
          placeholder="Search GitHub member…"
          value={selectedGh ? selectedGh.login : ghQuery}
          onChange={(e) => {
            setSelectedGh(null);
            runGhSearch(e.target.value);
          }}
        />
        {!selectedGh &&
          ghResults.map((m) => (
            <div
              key={m.login}
              className="p-1 small"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSelectedGh(m);
                setGhResults([]);
              }}
            >
              {m.login}
            </div>
          ))}
      </div>
      <button
        className="btn btn-sm btn-primary"
        disabled={!canAdd}
        onClick={() => {
          if (!selectedJira || !selectedGh) return;
          onAdd({
            displayName: selectedJira.displayName,
            jiraAccountId: selectedJira.accountId,
            jiraEmail: selectedJira.emailAddress,
            githubUsername: selectedGh.login,
          });
          setSelectedJira(null);
          setSelectedGh(null);
          setJiraQuery("");
          setGhQuery("");
        }}
      >
        Add
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create TeamEditor**

Create `src/views/teams/TeamEditor.tsx` — edits a team's name + board + members. Uses `MemberSearchRow`, the board search, and the member CRUD services.

```typescript
import { useState, useEffect } from "react";
import { MemberSearchRow } from "./MemberSearchRow";
import {
  fetchTeamMembers,
  addTeamMember,
  removeTeamMember,
  updateTeam,
  searchJiraBoards,
} from "../../services/teams";
import type { Team, TeamMember, JiraBoardResult } from "../../types/teams";

interface Props {
  team: Team;
  onClose: () => void;
  onChanged: () => void;
}

export function TeamEditor({ team, onClose, onChanged }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [name, setName] = useState(team.name);
  const [boardQuery, setBoardQuery] = useState(team.jira_board_name || "");
  const [boardResults, setBoardResults] = useState<JiraBoardResult[]>([]);
  const [boardId, setBoardId] = useState<number | null>(team.jira_board_id);
  const [boardName, setBoardName] = useState<string | null>(team.jira_board_name);

  const loadMembers = () => fetchTeamMembers(team.id).then(setMembers);
  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id]);

  const searchBoards = async (q: string) => {
    setBoardQuery(q);
    setBoardId(null);
    setBoardName(null);
    if (q.trim().length < 2) return setBoardResults([]);
    try {
      setBoardResults(await searchJiraBoards(q));
    } catch {
      setBoardResults([]);
    }
  };

  const saveMeta = async () => {
    await updateTeam(team.id, { name, boardId, boardName });
    onChanged();
  };

  return (
    <div className="card p-3 mb-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: 260 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-primary" onClick={saveMeta}>
            Save
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <label className="small text-muted">Jira board (optional)</label>
      <input
        className="form-control form-control-sm mb-1"
        placeholder="Search scrum boards…"
        value={boardId ? boardName || "" : boardQuery}
        onChange={(e) => searchBoards(e.target.value)}
      />
      {!boardId &&
        boardResults.map((b) => (
          <div
            key={b.id}
            className="p-1 small"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setBoardId(b.id);
              setBoardName(b.name);
              setBoardResults([]);
            }}
          >
            {b.name} {b.projectKey ? `· ${b.projectKey}` : ""}
          </div>
        ))}

      <hr />
      <label className="small text-muted mb-1">Members</label>
      {members.map((m) => (
        <div key={m.id} className="d-flex justify-content-between align-items-center small py-1">
          <span>
            {m.display_name} · <code>{m.github_username}</code>
          </span>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={async () => {
              await removeTeamMember(team.id, m.id);
              loadMembers();
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="mt-2">
        <MemberSearchRow
          onAdd={async (member) => {
            await addTeamMember(team.id, member);
            loadMembers();
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TeamsView**

Create `src/views/teams/TeamsView.tsx` — the list + create + edit orchestration.

```typescript
import { useState } from "react";
import { useTeams } from "../../hooks/useTeams";
import { createTeam, deleteTeam } from "../../services/teams";
import { TeamEditor } from "./TeamEditor";
import { EmptyState } from "../../components/EmptyState";
import type { Team } from "../../types/teams";

export function TeamsView() {
  const { teams, loading, error, refresh } = useTeams(true);
  const [editing, setEditing] = useState<Team | null>(null);
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const team = await createTeam({ name: newName.trim() });
    setNewName("");
    refresh();
    setEditing(team);
  };

  return (
    <div className="p-3">
      <h5 className="mb-3">Teams</h5>
      {error && <div className="alert alert-danger small">{error}</div>}

      <div className="d-flex gap-2 mb-3" style={{ maxWidth: 420 }}>
        <input
          className="form-control form-control-sm"
          placeholder="New team name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button className="btn btn-sm btn-primary" onClick={handleCreate}>
          Create
        </button>
      </div>

      {editing && (
        <TeamEditor
          team={editing}
          onClose={() => setEditing(null)}
          onChanged={refresh}
        />
      )}

      {!loading && teams.length === 0 && !editing && (
        <EmptyState title="No teams yet" description="Create a team to get started." />
      )}

      {teams.map((t) => (
        <div
          key={t.id}
          className="d-flex justify-content-between align-items-center border-bottom py-2"
        >
          <span>
            {t.name}{" "}
            <span className="text-muted small">
              · {t.member_count ?? 0} members
              {t.jira_board_name ? ` · ${t.jira_board_name}` : ""}
            </span>
          </span>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(t)}>
              Edit
            </button>
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={async () => {
                await deleteTeam(t.id);
                refresh();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `yarn build`
Expected: no type errors. Confirm `EmptyState` props match `src/components/EmptyState.tsx` (adjust `title`/`description` prop names if the component uses different ones — check the file first).

- [ ] **Step 5: Commit**

```bash
git add src/views/teams/TeamsView.tsx src/views/teams/TeamEditor.tsx src/views/teams/MemberSearchRow.tsx
git commit -m "feat(teams): add teams management view"
```

---

## Task 12: Dashboard section components (workload bars, issue table, read-only board)

**Files:**
- Create: `src/views/teams/WorkloadBars.tsx`
- Create: `src/views/teams/SprintIssueTable.tsx`
- Create: `src/views/teams/ReadOnlyBoard.tsx`

- [ ] **Step 1: Create WorkloadBars (CSS bars)**

Create `src/views/teams/WorkloadBars.tsx`:

```typescript
import type { WorkloadEntry } from "../../types/teams";

interface Props {
  workload: WorkloadEntry[];
  onSelectMember?: (accountId: string | null) => void;
  selectedAccountId?: string | null;
}

function Bars({
  workload,
  metric,
  color,
  onSelectMember,
  selectedAccountId,
}: Props & { metric: "ticketCount" | "prCount"; color: string }) {
  const max = Math.max(1, ...workload.map((w) => w[metric]));
  return (
    <div>
      {workload.map((w) => (
        <div
          key={w.accountId}
          className="d-flex align-items-center gap-2 my-1"
          style={{ cursor: onSelectMember ? "pointer" : "default", fontSize: "0.8125rem" }}
          onClick={() =>
            onSelectMember?.(selectedAccountId === w.accountId ? null : w.accountId)
          }
        >
          <span style={{ width: 90 }} className="text-truncate">
            {w.displayName}
          </span>
          <div style={{ flex: 1, background: "rgba(125,125,125,.15)", borderRadius: 3 }}>
            <div
              style={{
                width: `${(w[metric] / max) * 100}%`,
                height: 12,
                background: color,
                borderRadius: 3,
                opacity: selectedAccountId && selectedAccountId !== w.accountId ? 0.4 : 1,
              }}
            />
          </div>
          <span style={{ width: 24, textAlign: "right" }}>{w[metric]}</span>
        </div>
      ))}
    </div>
  );
}

export function WorkloadBars(props: Props) {
  return (
    <div className="d-flex gap-3">
      <div className="flex-fill border rounded p-2">
        <div className="small text-muted mb-1">ASSIGNED TICKETS</div>
        <Bars {...props} metric="ticketCount" color="#4c8dff" />
      </div>
      <div className="flex-fill border rounded p-2">
        <div className="small text-muted mb-1">PRs CREATED (2 wk)</div>
        <Bars {...props} metric="prCount" color="#a06bff" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SprintIssueTable (TanStack, sortable/filterable)**

Create `src/views/teams/SprintIssueTable.tsx` using `@tanstack/react-table` (already a dependency):

```typescript
import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import type { DashboardIssue } from "../../types/teams";

const col = createColumnHelper<DashboardIssue>();

interface Props {
  issues: DashboardIssue[];
  jiraBaseUrl?: string;
}

export function SprintIssueTable({ issues, jiraBaseUrl }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");

  const columns = useMemo(
    () => [
      col.accessor("key", {
        header: "Key",
        cell: (c) => {
          const base = jiraBaseUrl?.replace(/\/+$/, "");
          return base ? (
            <a href={`${base}/browse/${c.getValue()}`} target="_blank" rel="noreferrer">
              {c.getValue()}
            </a>
          ) : (
            c.getValue()
          );
        },
      }),
      col.accessor("summary", { header: "Summary" }),
      col.accessor("assigneeName", { header: "Assignee", cell: (c) => c.getValue() || "—" }),
      col.accessor("status", { header: "Status" }),
      col.accessor("epicName", { header: "Epic", cell: (c) => c.getValue() || "—" }),
      col.accessor((r) => r.linkedPRs.length, {
        id: "prs",
        header: "PRs",
        cell: (c) => {
          const prs = c.row.original.linkedPRs;
          if (prs.length === 0) return "—";
          return prs.map((pr) => (
            <a
              key={pr.number}
              href={pr.html_url}
              target="_blank"
              rel="noreferrer"
              className="me-1"
              title={pr.checks_status || ""}
            >
              #{pr.number}
            </a>
          ));
        },
      }),
    ],
    [jiraBaseUrl],
  );

  const table = useReactTable({
    data: issues,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      <input
        className="form-control form-control-sm mb-2"
        style={{ maxWidth: 260 }}
        placeholder="Filter issues…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <table className="table table-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{ cursor: "pointer" }}
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: " ▲", desc: " ▼" }[h.column.getIsSorted() as string] ?? ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create ReadOnlyBoard (status columns, no DnD)**

Create `src/views/teams/ReadOnlyBoard.tsx`. Maps Jira status category to columns; does NOT reuse the write-enabled `KanbanBoard`.

```typescript
import type { DashboardIssue } from "../../types/teams";

const COLUMNS: { key: string; title: string }[] = [
  { key: "new", title: "To Do" },
  { key: "indeterminate", title: "In Progress" },
  { key: "done", title: "Done" },
];

interface Props {
  issues: DashboardIssue[];
  jiraBaseUrl?: string;
}

export function ReadOnlyBoard({ issues, jiraBaseUrl }: Props) {
  const base = jiraBaseUrl?.replace(/\/+$/, "");
  return (
    <div className="d-flex gap-2">
      {COLUMNS.map((c) => {
        const colIssues = issues.filter((i) => i.statusCategory === c.key);
        return (
          <div key={c.key} className="flex-fill border rounded p-2" style={{ minWidth: 0 }}>
            <div className="small text-muted mb-2">
              {c.title.toUpperCase()} · {colIssues.length}
            </div>
            {colIssues.map((i) => (
              <div key={i.key} className="card p-2 mb-2" style={{ fontSize: "0.75rem" }}>
                <div>
                  {base ? (
                    <a href={`${base}/browse/${i.key}`} target="_blank" rel="noreferrer">
                      {i.key}
                    </a>
                  ) : (
                    i.key
                  )}{" "}
                  {i.linkedPRs.length > 0 && <span title="has linked PR">🔀</span>}
                </div>
                <div className="text-truncate">{i.summary}</div>
                <div className="text-muted">{i.assigneeName || "Unassigned"}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `yarn build`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/teams/WorkloadBars.tsx src/views/teams/SprintIssueTable.tsx src/views/teams/ReadOnlyBoard.tsx
git commit -m "feat(teams): add dashboard section components"
```

---

## Task 13: TeamDashboardView (assemble sections)

**Files:**
- Create: `src/views/teams/TeamDashboardView.tsx`

- [ ] **Step 1: Create the dashboard view**

Create `src/views/teams/TeamDashboardView.tsx`. Team + sprint selectors, KPI strip (with clickable off-board stat scrolling to §5), epics, workload bars (member filter), issue table with List/Board toggle, off-board PRs.

```typescript
import { useState, useRef } from "react";
import { useTeams } from "../../hooks/useTeams";
import { useTeamDashboard } from "../../hooks/useTeamDashboard";
import { WorkloadBars } from "./WorkloadBars";
import { SprintIssueTable } from "./SprintIssueTable";
import { ReadOnlyBoard } from "./ReadOnlyBoard";
import { EmptyState } from "../../components/EmptyState";

interface Props {
  jiraBaseUrl?: string;
}

export function TeamDashboardView({ jiraBaseUrl }: Props) {
  const { teams } = useTeams(true);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [sprintId, setSprintId] = useState<number | null>(null);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const offBoardRef = useRef<HTMLDivElement | null>(null);

  const { dashboard, loading, error } = useTeamDashboard(teamId, sprintId);

  const filteredIssues =
    dashboard && memberFilter
      ? dashboard.issues.filter((i) => i.assigneeAccountId === memberFilter)
      : dashboard?.issues || [];

  return (
    <div className="p-3">
      <div className="d-flex gap-2 mb-3 align-items-center flex-wrap">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 220 }}
          value={teamId ?? ""}
          onChange={(e) => {
            setTeamId(e.target.value ? parseInt(e.target.value, 10) : null);
            setSprintId(null);
            setMemberFilter(null);
          }}
        >
          <option value="">Select a team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {dashboard && dashboard.sprints.length > 0 && (
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 240 }}
            value={sprintId ?? dashboard.sprint?.id ?? ""}
            onChange={(e) => setSprintId(e.target.value ? parseInt(e.target.value, 10) : null)}
          >
            {dashboard.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.state})
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="alert alert-danger small">{error}</div>}
      {loading && <div className="text-muted small">Loading…</div>}
      {!teamId && !loading && (
        <EmptyState title="Select a team" description="Pick a team to see its dashboard." />
      )}

      {dashboard && (
        <>
          {dashboard.errors.length > 0 && (
            <div className="alert alert-warning small">
              <ul className="mb-0 ps-3">
                {dashboard.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* KPI strip (A+B) */}
          <div className="d-flex gap-2 mb-3">
            <div className="flex-fill border rounded p-2 text-center">
              <div className="h5 mb-0">{dashboard.counts.sprintIssues}</div>
              <div className="small text-muted">sprint issues</div>
            </div>
            <div className="flex-fill border rounded p-2 text-center">
              <div className="h5 mb-0">{dashboard.counts.epics}</div>
              <div className="small text-muted">epics</div>
            </div>
            <div
              className="flex-fill border rounded p-2 text-center"
              style={{ cursor: "pointer", background: "rgba(255,170,60,.12)" }}
              onClick={() => offBoardRef.current?.scrollIntoView({ behavior: "smooth" })}
              title="Jump to off-board PRs"
            >
              <div className="h5 mb-0">{dashboard.counts.offBoardPRs}</div>
              <div className="small text-muted">off-board PRs</div>
            </div>
          </div>

          {/* Epics */}
          <div className="border rounded p-2 mb-3">
            <div className="small text-muted mb-2">EPICS · {dashboard.epics.length}</div>
            <div className="d-flex gap-2 flex-wrap">
              {dashboard.epics.map((ep) => (
                <div
                  key={ep.key ?? "none"}
                  className="border rounded p-2"
                  style={{ flex: "1 1 160px", fontSize: "0.8125rem" }}
                >
                  <div className="fw-semibold text-truncate">{ep.name}</div>
                  <div className="text-muted">
                    {ep.total} tickets · {ep.done} done
                  </div>
                  <div style={{ height: 5, background: "rgba(125,125,125,.2)", borderRadius: 3 }}>
                    <div
                      style={{
                        height: 5,
                        width: `${ep.total ? (ep.done / ep.total) * 100 : 0}%`,
                        background: "#50c878",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workload */}
          <div className="mb-3">
            <WorkloadBars
              workload={dashboard.workload}
              onSelectMember={setMemberFilter}
              selectedAccountId={memberFilter}
            />
          </div>

          {/* Sprint issues */}
          <div className="border rounded p-2 mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="small text-muted">SPRINT ISSUES · {filteredIssues.length}</div>
              <div className="btn-group btn-group-sm">
                <button
                  className={`btn btn-outline-secondary ${view === "list" ? "active" : ""}`}
                  onClick={() => setView("list")}
                >
                  List
                </button>
                <button
                  className={`btn btn-outline-secondary ${view === "board" ? "active" : ""}`}
                  onClick={() => setView("board")}
                >
                  Board
                </button>
              </div>
            </div>
            {view === "list" ? (
              <SprintIssueTable issues={filteredIssues} jiraBaseUrl={jiraBaseUrl} />
            ) : (
              <ReadOnlyBoard issues={filteredIssues} jiraBaseUrl={jiraBaseUrl} />
            )}
          </div>

          {/* Off-board PRs */}
          <div
            ref={offBoardRef}
            className="border rounded p-2"
            style={{ background: "rgba(255,170,60,.06)" }}
          >
            <div className="small text-muted mb-2">
              ⚠ PRs OUTSIDE THE SPRINT · last 2 weeks · {dashboard.offBoardPRs.length}
            </div>
            {dashboard.offBoardPRs.length === 0 ? (
              <div className="text-muted small">None.</div>
            ) : (
              <table className="table table-sm mb-0">
                <tbody>
                  {dashboard.offBoardPRs.map((pr) => (
                    <tr key={`${pr.repo_full_name}#${pr.number}`}>
                      <td>{pr.author}</td>
                      <td>
                        <a href={pr.html_url} target="_blank" rel="noreferrer">
                          #{pr.number} {pr.title}
                        </a>
                      </td>
                      <td className="text-muted">
                        {pr.ticketKey ? `${pr.ticketKey} (other project)` : "no ticket"}
                      </td>
                      <td>{pr.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `yarn build`
Expected: no type errors. Verify `EmptyState` prop names against `src/components/EmptyState.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/views/teams/TeamDashboardView.tsx
git commit -m "feat(teams): add team dashboard view"
```

---

## Task 14: Nav registration & wiring

**Files:**
- Modify: `src/config/navTabs.ts:52-61` (add a Teams group)
- Modify: `src/App.tsx` (imports, tabMeta, isTabVisible, render branches)

- [ ] **Step 1: Add a Teams nav group**

In `src/config/navTabs.ts`, inside `NAV_GROUPS`, add a new group after the `github` group (after line 51):

```typescript
  {
    key: "teams",
    label: "Teams",
    tabs: [
      { key: "teams", label: "Manage Teams" },
      { key: "team-dashboard", label: "Team Dashboard" },
    ],
  },
```

- [ ] **Step 2: Import the views and icons in App.tsx**

In `src/App.tsx`, add to the icon import block (near line 21) `IconUsersGroup` and `IconChartBar`:

```typescript
  IconUsersGroup,
  IconChartBar,
```

And add view imports near the other view imports (after line 44):

```typescript
import { TeamsView } from "./views/teams/TeamsView";
import { TeamDashboardView } from "./views/teams/TeamDashboardView";
```

- [ ] **Step 3: Add tabMeta entries**

In `src/App.tsx`, in the `tabMeta` object (near line 360-373), add:

```typescript
                teams: { icon: IconUsersGroup, count: undefined },
                "team-dashboard": { icon: IconChartBar, count: undefined },
```

- [ ] **Step 4: Gate visibility on githubOrg**

In `src/App.tsx`, in `isTabVisible` (near line 376-381), add before `return true;`:

```typescript
                if (key === "teams" || key === "team-dashboard") return !!githubOrg;
```

- [ ] **Step 5: Add render branches**

In `src/App.tsx`, in the tab-content section (after the `org-prs` branch near line 601), add:

```typescript
                  {effectiveTab === "teams" && <TeamsView />}
                  {effectiveTab === "team-dashboard" && (
                    <TeamDashboardView jiraBaseUrl={jiraBaseUrl} />
                  )}
```

- [ ] **Step 6: Verify the whole app builds**

Run: `yarn build`
Expected: frontend + electron build succeed with no type errors.

Run: `cd server && yarn build`
Expected: backend compiles.

- [ ] **Step 7: Commit**

```bash
git add src/config/navTabs.ts src/App.tsx
git commit -m "feat(teams): register teams nav tabs and views"
```

---

## Task 15: End-to-end manual verification

**Files:** none (manual QA)

- [ ] **Step 1: Run the app**

Run: `yarn dev` (starts Vite + server + electron per package.json scripts — confirm the exact dev script).
Expected: app launches; with `githubOrg` configured, "Teams" group appears in the sidebar with "Manage Teams" and "Team Dashboard".

- [ ] **Step 2: Create a team and add a member**

In "Manage Teams": create a team, open its editor, search a Jira user (verify results appear), search a GitHub member (verify results appear), Add the member. Optionally pick a board.
Expected: member appears in the list; refreshing persists it (SQLite).

- [ ] **Step 3: View the dashboard**

Switch to "Team Dashboard", select the team.
Expected: KPI strip, epics (incl. "No epic" if applicable), workload bars, sprint issue table (or roster-wide issues if no board), and off-board PRs render. Clicking a workload bar filters the issue table. Clicking the off-board KPI scrolls to the off-board section. List/Board toggle switches views.

- [ ] **Step 4: Commit any fixes**

If QA surfaces small issues, fix and commit with `fix(teams): …` messages.

---

## Self-review notes (addressed)

- **Spec coverage:** roster CRUD (T4), member two-type-ahead + accountId storage (T3 users search, T11 MemberSearchRow), optional board (T3/T4/T6), epics incl. "No epic" (T5 groupByEpic), workload bars CSS (T12), sortable/filterable issue table via TanStack (T12), read-only board not reusing KanbanBoard (T12), off-board PRs partition + A+B KPI placement (T5/T13), sprint selector + last-two-sprints (T6/T13), PR↔ticket linking (T5), error degradation (T6/T13), no tests / pure helpers isolated (T5). All covered.
- **Type consistency:** the "Shared contracts" block is the single type source; backend JSON matches it; `statusCategory` values (`new`/`indeterminate`/`done`) are consistent across T5, T6, T12 ReadOnlyBoard columns.
- **Known verification points flagged inline:** `EmptyState` prop names (check `src/components/EmptyState.tsx` before T11/T13), `graphql` export path (T6), exact `yarn dev` script (T15). These are marked in-step so the implementer checks the real file rather than assuming.
```