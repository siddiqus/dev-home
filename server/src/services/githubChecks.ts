/**
 * Deriving an accurate CI status for a PR from GitHub's statusCheckRollup.
 *
 * Why this exists: `statusCheckRollup.state` (and even the REST
 * `check-runs?filter=latest` endpoint) counts *stale* check runs. When a job is
 * re-run — each attempt lands in its own check suite — the old failed runs stay
 * attached to the head commit and drag the rollup `state` to FAILURE, while the
 * GitHub merge box dedupes to the latest run per name and shows green. No single
 * API field reproduces the merge box, so we recompute here:
 *
 *   1. dedupe contexts to the newest run per check name, then
 *   2. evaluate red/pending/green over the *required* checks only (when known),
 *      because a failing non-required check does not block merge and shouldn't
 *      land a PR in "needs action". When the required set is unknown we fall
 *      back to evaluating every (deduped) check — still stale-run-correct.
 */

/** Normalized statuses rendered red — i.e. a genuinely failing check. */
const RED_STATUSES: ReadonlySet<string> = new Set([
  "FAILURE",
  "ERROR",
  "STARTUP_FAILURE",
  "TIMED_OUT",
]);

/** Normalized statuses that mean the check hasn't reached a conclusion yet. */
const PENDING_STATUSES: ReadonlySet<string> = new Set([
  "PENDING",
  "EXPECTED",
  "IN_PROGRESS",
  "QUEUED",
  "WAITING",
  "REQUESTED",
  "ACTION_REQUIRED",
]);

interface NormalizedCheck {
  name: string;
  status: string;
  /** Epoch ms of the run's newest timestamp; -Infinity when unknown. */
  time: number;
}

/** Parse an ISO timestamp to epoch ms, or -Infinity when absent/invalid. */
function toTime(iso: string | null | undefined): number {
  if (!iso) return -Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Normalize a raw statusCheckRollup context node (either a CheckRun or a legacy
 * StatusContext) into { name, status, time }, or null if it isn't a shape we
 * recognize. CheckRun carries `name`/`conclusion`/`status`; StatusContext
 * carries `context`/`state`.
 */
function normalizeContext(ctx: any): NormalizedCheck | null {
  if (!ctx) return null;
  const isCheckRun = ctx.__typename === "CheckRun" || ctx.name !== undefined;
  if (isCheckRun) {
    const name = ctx.name;
    if (!name) return null;
    return {
      name,
      status: (ctx.conclusion || ctx.status || "PENDING").toUpperCase(),
      time: Math.max(toTime(ctx.completedAt), toTime(ctx.startedAt)),
    };
  }
  const name = ctx.context;
  if (!name) return null;
  return {
    name,
    status: (ctx.state || "PENDING").toUpperCase(),
    time: toTime(ctx.createdAt),
  };
}

/**
 * Compute an effective checks status ("SUCCESS" | "FAILURE" | "PENDING") from a
 * commit's statusCheckRollup contexts, or null when no relevant check has run.
 *
 * @param contexts raw `statusCheckRollup.contexts.nodes` from GraphQL
 * @param requiredContexts when provided and non-empty, only checks whose name is
 *   in this set are evaluated (branch-protection required checks). When omitted
 *   or empty, every check is evaluated.
 */
export function computeChecksStatus(
  contexts: any[] | null | undefined,
  requiredContexts?: ReadonlySet<string> | null,
): string | null {
  if (!contexts || contexts.length === 0) return null;

  // Dedupe to the newest run per check name. Later array entries win ties so the
  // behavior is stable when timestamps are missing/equal.
  const latestByName = new Map<string, NormalizedCheck>();
  for (const raw of contexts) {
    const c = normalizeContext(raw);
    if (!c) continue;
    const prev = latestByName.get(c.name);
    if (!prev || c.time >= prev.time) latestByName.set(c.name, c);
  }

  const useRequired = !!requiredContexts && requiredContexts.size > 0;
  const evaluated = [...latestByName.values()].filter(
    (c) => !useRequired || requiredContexts!.has(c.name),
  );
  if (evaluated.length === 0) return null;

  if (evaluated.some((c) => RED_STATUSES.has(c.status))) return "FAILURE";
  if (evaluated.some((c) => PENDING_STATUSES.has(c.status))) return "PENDING";
  return "SUCCESS";
}

/**
 * Extract the set of required status-check context names for a branch from the
 * two places GitHub can define them: classic branch protection
 * (`/branches/{b}/protection/required_status_checks`) and repository rulesets
 * (`/rules/branches/{b}`). Either argument may be null/empty.
 */
export function parseRequiredContexts(protection: any, rules: any): Set<string> {
  const names = new Set<string>();

  // Branch protection: prefer the richer `checks[].context`, fall back to `contexts`.
  for (const c of protection?.checks || []) {
    if (c?.context) names.add(c.context);
  }
  for (const ctx of protection?.contexts || []) {
    if (ctx) names.add(ctx);
  }

  // Rulesets: required_status_checks rules carry parameters.required_status_checks[].context.
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule?.type !== "required_status_checks") continue;
    for (const c of rule?.parameters?.required_status_checks || []) {
      if (c?.context) names.add(c.context);
    }
  }

  return names;
}
