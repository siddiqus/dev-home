import type { ApiRequest as Request, ApiResponse as Response } from "../http/nextHandler";
import { createJiraClient, createJiraAgileClient } from "../clients/jiraApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import {
  partitionOffBoardPRs,
  groupByEpic,
  type RawIssue,
  type RawPR,
  type RosterEntry,
} from "../services/teamAggregation";
import { enrichIssue, groupPRsByTicket } from "../services/dashboard/risk";
import { buildNeedsAttention } from "../services/dashboard/attention";
import { computePace } from "../services/dashboard/pace";
import { computeLoadDistribution, computeLoadBalance } from "../services/dashboard/load";
import { computePrFlow } from "../services/dashboard/prFlow";
import { computeHygiene } from "../services/dashboard/hygiene";
import { mapPullRequestNode, dedupePRs } from "../services/dashboard/prFetch";
import { computeReviewQueue } from "../services/dashboard/reviewQueue";
import { DEFAULT_COCKPIT_CONFIG } from "../services/dashboard/config";
import type { SprintInfo, Burnup } from "../services/dashboard/types";

const MEMBER_PRS_QUERY = `
  query($q: String!) {
    search(query: $q, type: ISSUE, first: 30) {
      nodes {
        ... on PullRequest {
          number title url state createdAt updatedAt mergedAt headRefName body isDraft
          reviewDecision
          author { login }
          repository { nameWithOwner }
          commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
          reviews(first: 20) { nodes { author { login __typename } state submittedAt } }
          reviewRequests(first: 20) {
            totalCount
            nodes { requestedReviewer { __typename ... on User { login } ... on Team { name } } }
          }
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

async function runSearch(q: string, fallbackLogin: string): Promise<RawPR[]> {
  try {
    const data = await graphql<{ search: { nodes: any[] } }>(MEMBER_PRS_QUERY, { q });
    return (data.search.nodes || []).map((n: any) => mapPullRequestNode(n, fallbackLogin));
  } catch {
    return [];
  }
}

/**
 * Fetch each member's PRs in batches: PRs they authored (last 2 weeks) plus open
 * PRs where they are a requested reviewer (any author, any age). Deduped by
 * repo#number so a PR the team both authored and reviews appears once.
 */
async function fetchMemberPRs(roster: RosterEntry[]): Promise<RawPR[]> {
  const since = twoWeeksAgoISO();
  const batchSize = 5;
  const all: RawPR[] = [];
  for (let i = 0; i < roster.length; i += batchSize) {
    const batch = roster.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.flatMap((m) => [
        runSearch(`author:${m.githubUsername} type:pr created:>=${since}`, m.githubUsername),
        runSearch(`review-requested:${m.githubUsername} type:pr state:open`, ""),
      ]),
    );
    for (const r of results) all.push(...r);
  }
  return dedupePRs(all);
}

/** Map Agile-API issues (which carry a dedicated `epic` field). */
export function mapAgileIssues(rawIssues: any[]): RawIssue[] {
  return rawIssues.map((issue: any) => ({
    key: issue.key,
    summary: issue.fields?.summary || "",
    status: issue.fields?.status?.name || "",
    statusCategory: issue.fields?.status?.statusCategory?.key || "new",
    assigneeAccountId: issue.fields?.assignee?.accountId || null,
    assigneeName: issue.fields?.assignee?.displayName || null,
    epicKey: issue.fields?.epic?.key || null,
    // Agile API `epic.name` is the deprecated "Epic Name" field and is often
    // empty (Atlassian merged it into the summary); fall back to `epic.summary`
    // so epics still render a title instead of just their key.
    epicName: issue.fields?.epic?.name || issue.fields?.epic?.summary || null,
    createdAt: issue.fields?.created || null,
    updatedAt: issue.fields?.updated || null,
    dueDate: issue.fields?.duedate || null,
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
      epicKey: parentIsEpic ? parent.key : null,
      epicName: parentIsEpic ? parent.fields?.summary || parent.key : null,
      createdAt: issue.fields?.created || null,
      updatedAt: issue.fields?.updated || null,
      dueDate: issue.fields?.duedate || null,
    };
  });
}

/**
 * POST /api/teams/dashboard
 * Aggregate Jira issues + GitHub PRs for the team's roster.
 * Body: { team: { id, name, jira_board_id, jira_board_name }, members: [...], sprintId }
 */
export async function postTeamDashboard(req: Request, res: Response) {
  const { team, members, sprintId: requestedSprintId } = req.body || {};
  if (
    !team ||
    typeof team.id !== "number" ||
    typeof team.name !== "string" ||
    !Array.isArray(members)
  ) {
    res.status(400).json({ error: "team and members are required" });
    return;
  }

  const roster: RosterEntry[] = members.map((m: any) => ({
    accountId: m.accountId,
    displayName: m.displayName,
    githubUsername: m.githubUsername,
  }));

  const errors: string[] = [];
  let issues: RawIssue[] = [];
  let sprints: any[] = [];
  let currentSprint: any = null;

  const accountIds = roster.map((r) => r.accountId);

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
          const fieldsParam = "summary,status,assignee,epic,created,updated,duedate";
          const { data: issueData } = await agile.get(
            `/board/${team.jira_board_id}/sprint/${currentSprint.id}/issue`,
            { params: { fields: fieldsParam, maxResults: 100 } },
          );
          // Include every ticket in the sprint — assigned, unassigned, and
          // assigned to people outside this team's roster — so the counts and
          // the progress bar reflect the sprint as a whole. Per-member workload
          // still narrows to the roster in computeLoadDistribution.
          issues = mapAgileIssues(issueData.issues || []);
        }
      } else {
        const jira = createJiraClient();
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
        const { data } = await jira.post("/search/jql", {
          jql,
          fields: fieldsArray,
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
  const pace = computePace(enrichedIssues, sprintInfo, now, config);
  const needsAttention = buildNeedsAttention(
    enrichedIssues,
    offBoardPRs.map((p) => ({ repo_full_name: p.repo_full_name, number: p.number })),
  );
  const prFlow = computePrFlow(prs, enrichedIssues, now);
  const hygiene = computeHygiene(enrichedIssues, prs, sprintKeys);

  // Burn-up history lives in the browser; hand back today's point to record.
  const snapshot = currentSprint
    ? {
        sprintId: currentSprint.id,
        date: now.toISOString().slice(0, 10),
        doneCount: pace.doneCount,
        totalCount: pace.totalCount,
      }
    : null;
  const burnup: Burnup = { trackingSince: null, points: [] };

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
    offBoardPRs,
    pace,
    needsAttention,
    loadBalance,
    prFlow,
    hygiene,
    reviewQueue: computeReviewQueue(prs),
    burnup,
    snapshot,
    syncedAt: now.toISOString(),
    errors,
  });
}
