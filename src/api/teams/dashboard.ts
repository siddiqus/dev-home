import { githubGraphql, jiraClient, jiraAgileClient, ApiError } from "../http";
import { requireSettings } from "../http/credentials";
import { getBoardSprints } from "../jira/teams";
import {
  partitionOffBoardPRs,
  groupByEpic,
  type RawIssue,
  type RawPR,
  type RosterEntry,
} from "./aggregation";
import { enrichIssue, groupPRsByTicket } from "./cockpit/risk";
import { buildNeedsAttention } from "./cockpit/attention";
import { computePace } from "./cockpit/pace";
import { computeLoadDistribution, computeLoadBalance } from "./cockpit/load";
import { computePrFlow } from "./cockpit/prFlow";
import { computeHygiene } from "./cockpit/hygiene";
import { mapPullRequestNode, dedupePRs } from "./cockpit/prFetch";
import { computeReviewQueue } from "./cockpit/reviewQueue";
import { DEFAULT_COCKPIT_CONFIG } from "./cockpit/config";
import type { SprintInfo, Burnup } from "./cockpit/types";

const PR_NODE_FRAGMENT = `
  fragment MemberPR on PullRequest {
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
`;

/** One aliased query running several searches in a single request. */
function buildSearchesQuery(count: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$q${i}: String!`).join(", ");
  const fields = Array.from(
    { length: count },
    (_, i) => `s${i}: search(query: $q${i}, type: ISSUE, first: 30) { nodes { ...MemberPR } }`,
  ).join("\n");
  return `query(${vars}) {\n${fields}\n}\n${PR_NODE_FRAGMENT}`;
}

interface MemberSearch {
  q: string;
  fallbackLogin: string;
}

function twoWeeksAgoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString().slice(0, 10);
}

/**
 * Run searches in one aliased request. If it fails (e.g. one bad username
 * errors the whole query) fall back to one request per search so a single
 * failure doesn't blank the batch. Returns per-search results (null = failed).
 */
async function runSearches(searches: MemberSearch[]): Promise<(RawPR[] | null)[]> {
  const toPRs = (nodes: any[] | undefined, s: MemberSearch) =>
    (nodes || []).map((n: any) => mapPullRequestNode(n, s.fallbackLogin));
  try {
    const variables = Object.fromEntries(searches.map((s, i) => [`q${i}`, s.q]));
    const data = await githubGraphql<Record<string, { nodes: any[] }>>(
      buildSearchesQuery(searches.length),
      variables,
    );
    return searches.map((s, i) => toPRs(data[`s${i}`]?.nodes, s));
  } catch {
    if (searches.length === 1) return [null];
    return Promise.all(searches.map((s) => runSearches([s]).then(([r]) => r)));
  }
}

/**
 * Fetch PRs the roster authored (last 2 weeks) and open PRs awaiting their
 * review (any author, any age), kept apart: authored PRs measure the team's own
 * work, review requests feed the review queue. Searches are scoped to the
 * configured org when there is one.
 */
async function fetchMemberPRs(
  roster: RosterEntry[],
): Promise<{ authored: RawPR[]; reviewRequested: RawPR[]; failed: number }> {
  const since = twoWeeksAgoISO();
  const org = requireSettings().githubOrg?.trim();
  const scope = org ? ` org:${org}` : "";
  const members = roster.filter((m) => m.githubUsername?.trim());
  const MEMBERS_PER_REQUEST = 8;
  const authored: RawPR[] = [];
  const reviewRequested: RawPR[] = [];
  let failed = 0;
  for (let i = 0; i < members.length; i += MEMBERS_PER_REQUEST) {
    const batch = members.slice(i, i + MEMBERS_PER_REQUEST);
    const searches = batch.flatMap((m) => [
      {
        q: `author:${m.githubUsername} type:pr created:>=${since}${scope}`,
        fallbackLogin: m.githubUsername,
      },
      { q: `review-requested:${m.githubUsername} type:pr state:open${scope}`, fallbackLogin: "" },
    ]);
    const results = await runSearches(searches);
    results.forEach((r, j) => {
      if (!r) failed++;
      else (j % 2 === 0 ? authored : reviewRequested).push(...r);
    });
  }
  return { authored: dedupePRs(authored), reviewRequested: dedupePRs(reviewRequested), failed };
}

/**
 * Company-managed projects fill the Agile `epic` field; team-managed projects
 * leave it empty and link the epic as `parent` instead.
 */
function agileEpic(fields: any): { epicKey: string | null; epicName: string | null } {
  const epic = fields?.epic;
  if (epic?.key) {
    // Agile API `epic.name` is the deprecated "Epic Name" field and is often
    // empty (Atlassian merged it into the summary); fall back to `epic.summary`
    // so epics still render a title instead of just their key.
    return { epicKey: epic.key, epicName: epic.name || epic.summary || null };
  }
  const parent = fields?.parent;
  if (parent?.fields?.issuetype?.name?.toLowerCase() === "epic") {
    return { epicKey: parent.key, epicName: parent.fields?.summary || parent.key };
  }
  return { epicKey: null, epicName: null };
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
    ...agileEpic(issue.fields),
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

/** All issues in a sprint, paging past the Agile API's per-request limit. */
async function fetchSprintIssues(agile: any, boardId: number, sprintId: number): Promise<any[]> {
  const fields = "summary,status,assignee,epic,parent,created,updated,duedate";
  const maxResults = 100;
  const all: any[] = [];
  for (let startAt = 0; all.length < 1000; startAt += maxResults) {
    const { data } = await agile.get(`/board/${boardId}/sprint/${sprintId}/issue`, {
      params: { fields, startAt, maxResults },
    });
    const page = data.issues || [];
    all.push(...page);
    if (page.length < maxResults || all.length >= (data.total ?? 0)) break;
  }
  return all;
}

export interface PostTeamDashboardArgs {
  team: {
    id: number;
    name: string;
    jira_board_id: number | null;
    jira_board_name: string | null;
  } | null;
  members: Array<{
    accountId: string;
    displayName: string;
    githubUsername: string;
  }>;
  sprintId?: number | null;
  /** Bypass the cached sprint list. */
  force?: boolean;
}

/**
 * Aggregate Jira issues + GitHub PRs for the team's roster.
 */
export async function postTeamDashboard(args: PostTeamDashboardArgs) {
  const { team, members, sprintId: requestedSprintId, force } = args;
  if (
    !team ||
    typeof team.id !== "number" ||
    typeof team.name !== "string" ||
    !Array.isArray(members)
  ) {
    throw new ApiError(400, "team and members are required");
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
        ({ sprints } = await getBoardSprints({ id: team.jira_board_id, force }));
        currentSprint =
          sprints.find((s) => s.id === requestedSprintId) ||
          sprints.find((s) => s.state === "active") ||
          null;

        if (currentSprint) {
          // Include every ticket in the sprint — assigned, unassigned, and
          // assigned to people outside this team's roster — so the counts and
          // the progress bar reflect the sprint as a whole. Per-member workload
          // still narrows to the roster in computeLoadDistribution.
          issues = mapAgileIssues(
            await fetchSprintIssues(jiraAgileClient(), team.jira_board_id, currentSprint.id),
          );
        }
      } else {
        const jira = jiraClient();
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
        const raw: any[] = [];
        let nextPageToken: string | undefined;
        do {
          const { data } = await jira.post("/search/jql", {
            jql,
            fields: fieldsArray,
            maxResults: 100,
            ...(nextPageToken ? { nextPageToken } : {}),
          });
          raw.push(...(data.issues || []));
          nextPageToken = data.nextPageToken || undefined;
        } while (nextPageToken && raw.length < 500);
        issues = mapJqlIssues(raw);
      }
    } catch (err: any) {
      errors.push(`Jira: ${err.message || "failed to load issues"}`);
    }
  }

  // --- GitHub ---
  let prs: RawPR[] = [];
  let reviewRequested: RawPR[] = [];
  if (roster.length > 0) {
    try {
      const result = await fetchMemberPRs(roster);
      prs = result.authored;
      reviewRequested = result.reviewRequested;
      if (result.failed > 0) {
        errors.push(`GitHub: ${result.failed} PR search${result.failed === 1 ? "" : "es"} failed`);
      }
    } catch (err: any) {
      errors.push(`GitHub: ${err.message || "failed to load PRs"}`);
    }
  }
  // Sprint tickets link to any PR referencing them, including ones the team
  // was only asked to review; team metrics use the PRs the roster authored.
  const allPRs = dedupePRs([...prs, ...reviewRequested]);

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
  const prIndex = groupPRsByTicket(allPRs);
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
  // Only the active sprint gets new points — a closed sprint's history is final.
  const snapshot =
    currentSprint?.state === "active"
      ? {
          sprintId: currentSprint.id,
          date: now.toISOString().slice(0, 10),
          doneCount: pace.doneCount,
          totalCount: pace.totalCount,
        }
      : null;

  return {
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
    reviewQueue: computeReviewQueue(allPRs),
    // Filled in by the caller from locally stored snapshots.
    burnup: { trackingSince: null, points: [] } as Burnup,
    snapshot,
    syncedAt: now.toISOString(),
    errors,
  };
}
