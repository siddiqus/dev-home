import { SETTINGS_EVENT } from "../../services/config";
import { githubRest } from "../http/github";
import { parseRequiredContexts } from "./checks";
import { mapGraphQLPr } from "./mapping";

/**
 * Cache of required status-check context names, keyed by `owner/repo@branch`.
 * Holds promises so concurrent lookups (e.g. My PRs and Reviews loading at the
 * same time) share one request pair.
 */
const requiredContextsCache = new Map<
  string,
  { value: Promise<Set<string> | null>; expires: number }
>();
const REQUIRED_CONTEXTS_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REQUIRED_CONTEXTS_MAX_ENTRIES = 500;

function pruneRequiredContextsCache(now: number): void {
  // Remove expired entries
  for (const [key, entry] of requiredContextsCache.entries()) {
    if (entry.expires <= now) requiredContextsCache.delete(key);
  }
  // Enforce hard cap with oldest-first eviction (Map preserves insertion order)
  if (requiredContextsCache.size >= REQUIRED_CONTEXTS_MAX_ENTRIES) {
    const toDelete = requiredContextsCache.size - REQUIRED_CONTEXTS_MAX_ENTRIES + 1;
    let deleted = 0;
    for (const key of requiredContextsCache.keys()) {
      requiredContextsCache.delete(key);
      if (++deleted >= toDelete) break;
    }
  }
}

/** 403/404 mean "no protection visible to this token": a stable answer worth caching. */
function isDefinitiveMiss(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 403 || status === 404;
}

/**
 * Drop every cached required-contexts entry. The cache is per browser tab and
 * keyed without the token, so it's cleared whenever settings change (a new
 * token may see different branch protection).
 */
export function clearRequiredContextsCache(): void {
  requiredContextsCache.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, clearRequiredContextsCache);
}

/**
 * Resolve the required status-check context names for a base branch, merging
 * classic branch protection with repository rulesets. Cached per branch and
 * fail-open: any error (no protection, missing admin scope) yields null, which
 * tells computeChecksStatus to fall back to evaluating every check.
 */
export async function getRequiredContexts(
  owner: string,
  repo: string,
  branch: string,
): Promise<Set<string> | null> {
  const key = `${owner}/${repo}@${branch}`;
  const now = Date.now();
  const cached = requiredContextsCache.get(key);
  if (cached && cached.expires > now) return cached.value;

  const github = githubRest();
  const enc = encodeURIComponent(branch);
  // Transient failures (network, 5xx, rate limit) still resolve to the
  // fail-open answer, but the entry is evicted so the next refresh retries.
  let transient = false;
  const lookup = (url: string) =>
    github.get(url).then(
      (resp) => resp.data,
      (err) => {
        if (!isDefinitiveMiss(err)) transient = true;
        return null;
      },
    );
  const value = Promise.all([
    // 404 (unprotected / no required checks) or 403 (no admin) yield null.
    lookup(`/repos/${owner}/${repo}/branches/${enc}/protection/required_status_checks`),
    // Rulesets unavailable — protection alone (or nothing) is fine.
    lookup(`/repos/${owner}/${repo}/rules/branches/${enc}`),
  ]).then(([protection, rules]) => {
    if (transient && requiredContextsCache.get(key)?.value === value) {
      requiredContextsCache.delete(key);
    }
    const names = parseRequiredContexts(protection, rules);
    return names.size > 0 ? names : null;
  });

  pruneRequiredContextsCache(now);
  requiredContextsCache.set(key, { value, expires: now + REQUIRED_CONTEXTS_TTL_MS });
  return value;
}

/**
 * Map open-PR GraphQL nodes to the frontend shape, scoping each PR's CI status
 * to its base branch's required checks. Required contexts are resolved once per
 * unique `repo@baseRef` (cached across requests) and reused for every PR.
 */
export async function mapOpenPrsWithChecks(nodes: any[], viewer?: string) {
  const branchKeys = new Map<string, { owner: string; repo: string; branch: string }>();
  for (const n of nodes) {
    const full = n.repository?.nameWithOwner || "";
    const branch = n.baseRefName || "";
    const [owner, repo] = full.split("/");
    if (!owner || !repo || !branch) continue;
    branchKeys.set(`${full}@${branch}`, { owner, repo, branch });
  }

  const required = new Map<string, Set<string> | null>();
  await Promise.all(
    [...branchKeys.entries()].map(async ([k, { owner, repo, branch }]) => {
      required.set(k, await getRequiredContexts(owner, repo, branch));
    }),
  );

  return nodes.map((n: any) => {
    const key = `${n.repository?.nameWithOwner || ""}@${n.baseRefName || ""}`;
    return mapGraphQLPr(n, viewer, required.get(key) ?? null);
  });
}
