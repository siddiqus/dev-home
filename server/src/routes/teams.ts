import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { createJiraClient, createJiraAgileClient } from "../clients/jiraApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import {
  partitionOffBoardPRs,
  groupByEpic,
  computeSprintProgress,
  type RawIssue,
  type RawPR,
  type RosterEntry,
} from "../services/teamAggregation";
import { enrichIssue, groupPRsByTicket } from "../services/dashboard/risk";
import { buildNeedsAttention } from "../services/dashboard/attention";
import { computePace, computeScope } from "../services/dashboard/pace";
import { computeLoadDistribution, computeLoadBalance } from "../services/dashboard/load";
import { computePrFlow } from "../services/dashboard/prFlow";
import { computeHygiene } from "../services/dashboard/hygiene";
import { recordSnapshot, getBurnup } from "../services/dashboard/snapshots";
import { DEFAULT_COCKPIT_CONFIG } from "../services/dashboard/config";
import type { SprintInfo, Burnup } from "../services/dashboard/types";

const router = Router();

/** Memoized story points field id detection (null if not found or errors). */
let cachedStoryPointsFieldId: string | null | undefined = undefined;
async function getStoryPointsFieldId(): Promise<string | null> {
  if (cachedStoryPointsFieldId !== undefined) {
    return cachedStoryPointsFieldId as string | null;
  }
  try {
    const jira = createJiraClient();
    const { data } = await jira.get("/field");
    // Prefer custom fields whose schema.custom contains "story" or whose name matches /story point/i
    const field = (data || []).find(
      (f: any) =>
        f.custom &&
        (f.name?.toLowerCase().includes("story point") ||
          f.schema?.custom?.toLowerCase().includes("story-points") ||
          f.schema?.custom?.toLowerCase().includes("storypointestimate") ||
          f.schema?.custom?.toLowerCase().includes("gh-sprint-storypointsfield")),
    );
    cachedStoryPointsFieldId = field?.id || null;
    return cachedStoryPointsFieldId as string | null;
  } catch {
    cachedStoryPointsFieldId = null;
    return null;
  }
}

/** GET /api/teams — list teams with member counts and names. */
router.get("/", (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.*,
         (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count,
         (SELECT json_group_array(json_object('name', m.display_name))
            FROM (SELECT display_name FROM team_members
                  WHERE team_id = t.id ORDER BY display_name COLLATE NOCASE) m
         ) AS members
       FROM teams t ORDER BY t.name COLLATE NOCASE`,
    )
    .all() as Array<Record<string, unknown>>;
  const teams = rows.map((row) => ({
    ...row,
    members: row.members ? JSON.parse(row.members as string) : [],
  }));
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
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { name, boardId, boardName } = req.body || {};
  const db = getDb();
  const existing = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
  if (!existing) {
    res.status(404).json({ error: "team not found" });
    return;
  }
  db.prepare(
    "UPDATE teams SET name = ?, jira_board_id = ?, jira_board_name = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(
    (name ?? (existing as any).name).trim(),
    boardId !== undefined ? boardId : (existing as any).jira_board_id,
    boardName !== undefined ? boardName : (existing as any).jira_board_name,
    id,
  );
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
  res.json({ team });
});

/** DELETE /api/teams/:id — delete team and its members. */
router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
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
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const db = getDb();
  const members = db
    .prepare("SELECT * FROM team_members WHERE team_id = ? ORDER BY display_name COLLATE NOCASE")
    .all(id);
  res.json({ members });
});

/** POST /api/teams/:id/members — Body: { displayName, jiraAccountId, jiraEmail?, githubUsername } */
router.post("/:id/members", (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id, 10);
  if (Number.isNaN(teamId)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
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
  const teamId = parseInt(req.params.teamId, 10);
  const memberId = parseInt(req.params.memberId, 10);
  if (Number.isNaN(teamId) || Number.isNaN(memberId)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const db = getDb();
  db.prepare("DELETE FROM team_members WHERE id = ? AND team_id = ?").run(memberId, teamId);
  res.json({ ok: true });
});

const MEMBER_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 30) {
      nodes {
        ... on PullRequest {
          number title url state createdAt mergedAt headRefName body
          author { login }
          repository { nameWithOwner }
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
          reviews(first: 10) { nodes { submittedAt state } }
          reviewRequests(first: 1) { totalCount }
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
          return (data.search.nodes || []).map((n: any) => {
            // Reviews: compute earliest submittedAt and rollup state
            const reviews = n.reviews?.nodes || [];
            let first_review_at: string | null = null;
            let review_state: string | null = null;
            if (reviews.length > 0) {
              const sorted = [...reviews].sort(
                (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
              );
              first_review_at = sorted[0].submittedAt;
              // Rollup: CHANGES_REQUESTED > APPROVED > COMMENTED
              const hasChanges = reviews.some((r: any) => r.state === "CHANGES_REQUESTED");
              const hasApproved = reviews.some((r: any) => r.state === "APPROVED");
              if (hasChanges) review_state = "CHANGES_REQUESTED";
              else if (hasApproved) review_state = "APPROVED";
              else review_state = "COMMENTED";
            } else if ((n.reviewRequests?.totalCount || 0) > 0) {
              review_state = "REVIEW_REQUIRED";
            }

            return {
              number: n.number,
              title: n.title,
              repo_full_name: n.repository?.nameWithOwner || "",
              html_url: n.url,
              state: (n.state || "").toLowerCase(),
              checks_status: n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state || null,
              author: n.author?.login || m.githubUsername,
              created_at: n.createdAt,
              merged_at: n.mergedAt || null,
              first_review_at,
              review_state,
              review_requested: (n.reviewRequests?.totalCount || 0) > 0,
              head_ref: n.headRefName || "",
              body: n.body || "",
            };
          }) as RawPR[];
        } catch {
          return [] as RawPR[];
        }
      }),
    );
    for (const r of results) all.push(...r);
  }
  return all;
}

/** Map Agile-API issues (which carry a dedicated `epic` field). */
function mapAgileIssues(rawIssues: any[], storyPointsFieldId: string | null): RawIssue[] {
  return rawIssues.map((issue: any) => ({
    key: issue.key,
    summary: issue.fields?.summary || "",
    status: issue.fields?.status?.name || "",
    statusCategory: issue.fields?.status?.statusCategory?.key || "new",
    assigneeAccountId: issue.fields?.assignee?.accountId || null,
    assigneeName: issue.fields?.assignee?.displayName || null,
    epicKey: issue.fields?.epic?.key || null,
    epicName: issue.fields?.epic?.name || null,
    createdAt: issue.fields?.created || null,
    updatedAt: issue.fields?.updated || null,
    dueDate: issue.fields?.duedate || null,
    storyPoints: storyPointsFieldId ? (issue.fields?.[storyPointsFieldId] ?? null) : null,
  }));
}

/** Map platform JQL issues (epic derived from `parent`). */
function mapJqlIssues(rawIssues: any[], storyPointsFieldId: string | null): RawIssue[] {
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
      epicKey: parentIsEpic ? parent.key : null,
      epicName: parentIsEpic ? parent.fields?.summary || parent.key : null,
      createdAt: issue.fields?.created || null,
      updatedAt: issue.fields?.updated || null,
      dueDate: issue.fields?.duedate || null,
      storyPoints: storyPointsFieldId ? (issue.fields?.[storyPointsFieldId] ?? null) : null,
    };
  });
}

/**
 * GET /api/teams/:id/dashboard?sprintId=
 * Aggregate Jira issues + GitHub PRs for the team's roster.
 */
router.get("/:id/dashboard", async (req: Request, res: Response) => {
  const teamId = parseInt(req.params.id, 10);
  if (Number.isNaN(teamId)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
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
        // Paginate: a board can carry hundreds of sprints and the Agile API
        // returns them oldest-first, so the active/recent ones we care about
        // sit at the END. Fetching a single un-paginated page would miss them.
        let startAt = 0;
        const maxResults = 50;
        while (sprints.length < 200) {
          const { data: sprintData } = await agile.get(`/board/${team.jira_board_id}/sprint`, {
            params: { state: "active", startAt, maxResults },
          });
          for (const s of sprintData.values || []) {
            sprints.push({
              id: s.id,
              name: s.name,
              state: s.state,
              startDate: s.startDate,
              endDate: s.endDate,
              goal: s.goal || undefined,
            });
          }
          if (sprintData.isLast || (sprintData.values || []).length < maxResults) break;
          startAt += maxResults;
        }
        // Active first, then closed by most recent end date — so the default
        // selection and the dropdown both lead with the current sprint.
        sprints.sort((a, b) => {
          if (a.state === "active" && b.state !== "active") return -1;
          if (b.state === "active" && a.state !== "active") return 1;
          return new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime();
        });
        currentSprint =
          sprints.find((s) => s.id === requestedSprintId) ||
          sprints.find((s) => s.state === "active") ||
          null;

        if (currentSprint) {
          const storyPointsFieldId = await getStoryPointsFieldId();
          let fieldsParam = "summary,status,assignee,epic,created,updated,duedate";
          if (storyPointsFieldId) fieldsParam += `,${storyPointsFieldId}`;
          const { data: issueData } = await agile.get(
            `/board/${team.jira_board_id}/sprint/${currentSprint.id}/issue`,
            { params: { fields: fieldsParam, maxResults: 100 } },
          );
          // Include every ticket in the sprint — assigned, unassigned, and
          // assigned to people outside this team's roster — so the counts and
          // the progress bar reflect the sprint as a whole. Per-member workload
          // still narrows to the roster in computeLoadDistribution.
          issues = mapAgileIssues(issueData.issues || [], storyPointsFieldId);
        }
      } else {
        const jira = createJiraClient();
        const storyPointsFieldId = await getStoryPointsFieldId();
        const idList = accountIds.map((a) => `"${a}"`).join(", ");
        const jql = `assignee IN (${idList}) AND statusCategory != Done ORDER BY updated DESC`;
        const fieldsArray = [
          "summary",
          "status",
          "assignee",
          "parent",
          "created",
          "updated",
          "duedate",
        ];
        if (storyPointsFieldId) fieldsArray.push(storyPointsFieldId);
        const { data } = await jira.post("/search/jql", {
          jql,
          fields: fieldsArray,
          maxResults: 100,
        });
        issues = mapJqlIssues(data.issues || [], storyPointsFieldId);
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

  // --- Aggregate (sprint cockpit) ---
  const now = new Date();
  const config = DEFAULT_COCKPIT_CONFIG;
  const sprintInfo: SprintInfo | null = currentSprint
    ? {
        id: currentSprint.id,
        startDate: currentSprint.startDate ?? null,
        endDate: currentSprint.endDate ?? null,
      }
    : null;

  const sprintKeys = new Set(issues.map((i) => i.key));
  // Enrich each issue with its linked PRs, flags, and risk score.
  const prIndex = groupPRsByTicket(prs);
  const enrichedIssues = issues.map((i) =>
    enrichIssue(i, prIndex.get(i.key) || [], sprintInfo, now, config),
  );
  const staleKeys = new Set(enrichedIssues.filter((i) => i.flags.stale).map((i) => i.key));

  const offBoardPRs = partitionOffBoardPRs(prs, sprintKeys);
  const epics = groupByEpic(issues, staleKeys);
  const workload = computeLoadDistribution(roster, enrichedIssues, prs, now);
  const loadBalance = computeLoadBalance(workload);
  const progress = computeSprintProgress(issues);
  const pace = computePace(enrichedIssues, sprintInfo, now, config);
  const scope = computeScope(enrichedIssues, sprintInfo);
  const needsAttention = buildNeedsAttention(
    enrichedIssues,
    offBoardPRs.map((p) => ({ repo_full_name: p.repo_full_name, number: p.number })),
  );
  const prFlow = computePrFlow(prs, enrichedIssues, now);
  const hygiene = computeHygiene(enrichedIssues, prs, sprintKeys);

  // Burn-up: snapshot today's completion, then read the accrued history.
  let burnup: Burnup = { trackingSince: null, points: [] };
  if (currentSprint) {
    try {
      const today = now.toISOString().slice(0, 10);
      recordSnapshot(db, currentSprint.id, pace.doneCount, pace.totalCount, today);
      burnup = getBurnup(db, sprintInfo);
    } catch (err: any) {
      errors.push(`Burn-up: ${err.message || "snapshot failed"}`);
    }
  }

  res.json({
    team: {
      id: team.id,
      name: team.name,
      board: team.jira_board_id ? { id: team.jira_board_id, name: team.jira_board_name } : null,
    },
    sprint: currentSprint,
    sprints,
    epics,
    issues: enrichedIssues,
    workload,
    progress,
    offBoardPRs,
    counts: {
      sprintIssues: issues.length,
      epics: epics.length,
      offBoardPRs: offBoardPRs.length,
    },
    pace,
    scope,
    needsAttention,
    loadBalance,
    prFlow,
    hygiene,
    burnup,
    syncedAt: now.toISOString(),
    errors,
  });
});

export default router;
