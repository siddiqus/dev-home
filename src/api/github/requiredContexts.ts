import { SETTINGS_EVENT, loadSettings } from "../../services/config";
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

/**
 * Definitive answers are also persisted to localStorage so a page load doesn't
 * wait on the protection/rulesets round trip before the PR list can render.
 * Branch protection rarely changes: a persisted entry is served immediately
 * (stale-while-revalidate) and refreshed in the background once older than
 * REQUIRED_CONTEXTS_TTL_MS; it's dropped entirely after PERSIST_MAX_AGE_MS.
 */
const PERSIST_KEY = "dev-home-required-contexts";
const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PersistedContexts {
  /** githubUsername the entries were resolved for. */
  owner: string;
  entries: Record<string, { names: string[] | null; at: number }>;
}

function loadPersisted(): PersistedContexts {
  const owner = loadSettings().githubUsername || "";
  try {
    const parsed = JSON.parse(localStorage.getItem(PERSIST_KEY) || "null");
    if (parsed && parsed.owner === owner && parsed.entries) return parsed;
  } catch {
    // Corrupt entry — start over.
  }
  return { owner, entries: {} };
}

function persist(key: string, names: Set<string> | null): void {
  try {
    const store = loadPersisted();
    const now = Date.now();
    for (const [k, e] of Object.entries(store.entries)) {
      if (now - e.at > PERSIST_MAX_AGE_MS) delete store.entries[k];
    }
    store.entries[key] = { names: names ? [...names] : null, at: now };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable or full — the in-memory cache still works.
  }
}

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
 * Drop every cached required-contexts entry, in memory and persisted. Entries
 * are keyed without the token, so they're cleared whenever settings change (a
 * new token may see different branch protection).
 */
export function clearRequiredContextsCache(): void {
  requiredContextsCache.clear();
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    // Storage unavailable — nothing persisted.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, clearRequiredContextsCache);
}

/** Hit the protection + rulesets endpoints and cache the merged answer. */
function fetchRequiredContexts(
  key: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<Set<string> | null> {
  const now = Date.now();
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
    const names = parseRequiredContexts(protection, rules);
    const result = names.size > 0 ? names : null;
    if (transient) {
      if (requiredContextsCache.get(key)?.value === value) requiredContextsCache.delete(key);
    } else {
      persist(key, result);
    }
    return result;
  });

  pruneRequiredContextsCache(now);
  requiredContextsCache.set(key, { value, expires: now + REQUIRED_CONTEXTS_TTL_MS });
  return value;
}

/**
 * Resolve the required status-check context names for a base branch, merging
 * classic branch protection with repository rulesets. Cached per branch and
 * fail-open: any error (no protection, missing admin scope) yields null, which
 * tells computeChecksStatus to fall back to evaluating every check. A persisted
 * answer is returned without waiting on the network (see PERSIST_KEY).
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

  const saved = loadPersisted().entries[key];
  if (saved && now - saved.at < PERSIST_MAX_AGE_MS) {
    const value = Promise.resolve(saved.names ? new Set(saved.names) : null);
    let expires = saved.at + REQUIRED_CONTEXTS_TTL_MS;
    if (expires <= now) {
      // Stale: answer now and refresh in the background. The refresh lands in
      // storage; concurrent callers keep the stale answer instead of waiting.
      void fetchRequiredContexts(key, owner, repo, branch);
      expires = now + REQUIRED_CONTEXTS_TTL_MS;
    }
    pruneRequiredContextsCache(now);
    requiredContextsCache.set(key, { value, expires });
    return value;
  }

  return fetchRequiredContexts(key, owner, repo, branch);
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
