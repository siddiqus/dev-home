import { computeChecksStatus, findOptionalFailures, latestContexts } from "./checks";

/**
 * Get an ISO date string (YYYY-MM-DD) for `months` months ago (default 2).
 */
export function monthsAgo(months: number = 2): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function hoursAgo(hours: number): string {
  const d = new Date();
  d.setTime(d.getTime() - hours * 60 * 60 * 1000);
  return d.toISOString();
}

/**
 * Map a statusCheckRollup context node to a normalized check run shape.
 */
export function mapCheckContext(ctx: any) {
  // CheckRun nodes have `name`, `conclusion`, `status`, `detailsUrl`
  if (ctx.name !== undefined) {
    return {
      name: ctx.name,
      status: (ctx.conclusion || ctx.status || "PENDING").toUpperCase(),
      url: ctx.detailsUrl || null,
    };
  }
  // StatusContext nodes have `context`, `state`, `targetUrl`
  return {
    name: ctx.context || "",
    status: (ctx.state || "PENDING").toUpperCase(),
    url: ctx.targetUrl || null,
  };
}

/**
 * Derive an overall review status from a list of review nodes.
 * Returns "APPROVED", "CHANGES_REQUESTED", "REVIEWED", or null.
 * Uses the latest review per author to determine the current state.
 */
export function deriveReviewStatus(reviews: any[] | undefined): string | null {
  if (!reviews || reviews.length === 0) return null;

  // Keep only the latest review per author
  const latestByAuthor = new Map<string, string>();
  for (const r of reviews) {
    const login = r.author?.login || "";
    if (!login) continue;
    // reviews are ordered oldest-first from the API; later entries overwrite
    latestByAuthor.set(login, r.state);
  }

  const states = [...latestByAuthor.values()];
  if (states.some((s) => s === "CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (states.some((s) => s === "APPROVED")) return "APPROVED";
  if (states.length > 0) return "REVIEWED";
  return null;
}

/**
 * Whether the ball is in the viewer's court: the newest non-bot discussion event
 * on the PR (issue comment, review submission, or review-thread reply) was
 * authored by someone other than the viewer. Returns false when there's no
 * viewer or no activity. Only meaningful for the viewer's own PRs, and only when
 * the query actually fetched comments/reviews/threads (other endpoints don't, so
 * this collapses to false there). `isBot` is hoisted, so the later definition is
 * fine here.
 */
export function deriveYourTurn(node: any, viewer?: string): boolean {
  // Guards the `.map((n: any) => mapGraphQLPr(n))` call sites too, where the array index (a
  // number) is passed as `viewer` — a non-string viewer means "unknown", so no
  // "your turn" signal.
  if (typeof viewer !== "string" || !viewer) return false;

  let latestAt = 0;
  let latestLogin = "";
  const consider = (at: string | undefined, login: string | undefined) => {
    if (!at || !login || isBot(login)) return;
    const t = new Date(at).getTime();
    if (Number.isNaN(t) || t < latestAt) return;
    latestAt = t;
    latestLogin = login;
  };

  for (const c of node.comments?.nodes || []) consider(c.createdAt, c.author?.login);
  for (const r of node.reviews?.nodes || []) consider(r.submittedAt, r.author?.login);
  for (const t of node.reviewThreads?.nodes || []) {
    for (const c of t.comments?.nodes || []) consider(c.createdAt, c.author?.login);
  }

  if (!latestLogin) return false;
  return latestLogin.toLowerCase() !== viewer.toLowerCase();
}

/** Count review threads still open (isResolved === false). */
export function countUnresolvedThreads(node: any): number {
  const threads = node.reviewThreads?.nodes || [];
  return threads.filter((t: any) => t.isResolved === false).length;
}

/**
 * Map a GitHub GraphQL PullRequest node to the frontend GitHubPR shape.
 * `viewer` (the authenticated username) is only passed by the "my PRs" endpoint,
 * where it drives the "your turn" signal; elsewhere it's omitted.
 * `requiredContexts`, when provided, scopes the CI status to the base branch's
 * required checks (see computeChecksStatus); omit it to evaluate every check.
 */
export function mapGraphQLPr(
  node: any,
  viewer?: string,
  requiredContexts?: ReadonlySet<string> | null,
) {
  const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  const contextNodes = rollup?.contexts?.nodes || [];
  return {
    id: node.databaseId,
    number: node.number,
    title: node.title,
    html_url: node.url,
    state: node.state?.toLowerCase() || "open",
    draft: node.isDraft || false,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    user: {
      login: node.author?.login || "",
      avatar_url: node.author?.avatarUrl || "",
    },
    head: {
      ref: node.headRefName || "",
    },
    base: {
      ref: node.baseRefName || "",
    },
    body: node.body || "",
    additions: node.additions ?? null,
    deletions: node.deletions ?? null,
    changed_files: node.changedFiles ?? null,
    repo_full_name: node.repository?.nameWithOwner || "",
    // Recomputed from deduped, required-scoped contexts rather than rollup.state,
    // which counts stale re-runs and disagrees with the GitHub merge box.
    checks_status: computeChecksStatus(contextNodes, requiredContexts),
    optional_checks_failing: findOptionalFailures(contextNodes, requiredContexts),
    // Deduped like checks_status so re-run attempts don't list as duplicate rows.
    checks: latestContexts(contextNodes).map(mapCheckContext),
    review_status: deriveReviewStatus(node.reviews?.nodes),
    merged_at: node.mergedAt || null,
    merged_by: node.mergedBy?.login || null,
    in_merge_queue: !!node.mergeQueueEntry,
    your_turn: deriveYourTurn(node, viewer),
    unresolved_thread_count: countUnresolvedThreads(node),
    has_conflict: node.mergeable === "CONFLICTING",
    // GitHub's own merge-box signals, surfaced for corroboration/display.
    merge_state_status: node.mergeStateStatus || null,
    review_decision: node.reviewDecision || null,
    labels: (node.labels?.nodes || []).map((l: any) => ({
      name: l.name || "",
      color: l.color || "",
    })),
  };
}

/** Bot usernames to filter out from mention notifications. */
const IGNORED_BOTS = [
  "github-actions",
  "datadog-official",
  "copilot",
  "dependabot",
  "renovate",
  "codecov",
  "sonarcloud",
  "netlify",
  "vercel",
];

/**
 * Check if a username looks like a bot account.
 */
export function isBot(login: string): boolean {
  if (!login) return true;
  const lower = login.toLowerCase();
  if (IGNORED_BOTS.some((bot) => lower.includes(bot))) return true;
  // GitHub bot accounts typically end with [bot]
  if (lower.endsWith("[bot]")) return true;
  return false;
}

/**
 * Extract comments from GraphQL PR nodes (issue comments + review thread comments).
 * Returns flattened GitHubComment-shaped objects for the user's own open PRs,
 * excluding the user's own comments and bot comments.
 */
export function extractOwnPRComments(prNodes: any[], username: string): any[] {
  const comments: any[] = [];

  for (const pr of prNodes) {
    if (pr.state?.toLowerCase() !== "open") continue;
    const repoFullName = pr.repository?.nameWithOwner || "";

    // Issue-level comments (general PR comments)
    for (const c of pr.comments?.nodes || []) {
      const login = c.author?.login || "";
      if (login === username) continue;
      if (isBot(login)) continue;
      comments.push({
        id: c.databaseId,
        html_url: c.url,
        body: c.body || "",
        created_at: c.createdAt,
        updated_at: c.updatedAt,
        user: { login, avatar_url: c.author?.avatarUrl || "" },
        issue_url: "",
        pr_number: pr.number,
        repo_full_name: repoFullName,
        context_title: pr.title || "",
        reason: "comment",
      });
    }

    // Review thread comments (inline code comments)
    for (const thread of pr.reviewThreads?.nodes || []) {
      for (const c of thread.comments?.nodes || []) {
        const login = c.author?.login || "";
        if (login === username) continue;
        if (isBot(login)) continue;
        comments.push({
          id: c.databaseId,
          html_url: c.url,
          body: c.body || "",
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          user: { login, avatar_url: c.author?.avatarUrl || "" },
          issue_url: "",
          pr_number: pr.number,
          repo_full_name: repoFullName,
          context_title: pr.title || "",
          reason: "comment",
        });
      }
    }
  }

  return comments;
}
