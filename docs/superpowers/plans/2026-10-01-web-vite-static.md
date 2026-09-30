# Static Vite Web App + Jira Passthrough Proxy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the `web-nextjs` Next.js app into a static Vite SPA that calls GitHub directly from the browser and reaches Jira through a small, stateless, allowlisted passthrough proxy (Cloudflare Worker / Node / Vite dev middleware).

**Architecture:** All server route-handler logic moves into `src/api/**` as plain async functions that run in the browser. `src/services/*.ts` keep their exported signatures and call those functions instead of `apiClient("/api/...")`. `proxy/core.ts` is a single `handle(Request, env) → Response` function reused by three thin entries. Next.js, `app/` and `server/` are deleted.

**Tech Stack:** React 18, Vite, TypeScript, axios, vitest (jsdom + node projects), Cloudflare Workers (wrangler), esbuild, yarn v1.

**Spec:** `docs/superpowers/specs/2026-10-01-web-vite-static-design.md`

## Global Constraints

- Work on branch `web-vite` only. Never merge, rebase onto, or push to `master` or `web-nextjs`. Never push anything.
- Package manager is **yarn v1** (`yarn add`, `yarn add -D`, `yarn test`). Never use npm/pnpm to install.
- **Never delete, move, or modify `data/`** (the user's real SQLite DB `data/notes.db`).
- Every commit message ends with the trailer line: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Success confirmations in UI are fixed bottom toasts, never inline alerts that shift layout.
- Match surrounding code style: comment density, naming, prettier formatting (`yarn lint:fix` is available).
- Response shapes returned by ported functions must be **identical** to what the old handler passed to `res.json(...)`, so UI mapping code is unchanged (Task 8 is the only task allowed to change GitHub/Jira query behaviour).
- Proxy must never log request headers/bodies and never cache.
- Per-task gates: `yarn test` and `yarn typecheck` pass (and `yarn lint` has no errors). `yarn build` is a gate only from Task 6 onward (Next.js build is expected to break during Tasks 2–5 because `import.meta.env` is Vite-only).
- HTTP mocking in tests: axios clients are created with `axios.create(...)` **without** an explicit `adapter`; tests set `axios.defaults.adapter = vi.fn(...)` (restore it in `afterEach`). The proxy takes an injectable `fetchImpl`.

---

### Task 1: Jira passthrough proxy core

**Files:**
- Create: `proxy/core.ts`
- Test: `proxy/core.test.ts`
- Modify: `vitest.config.ts` (add a `proxy` project, node environment)
- Modify: `tsconfig.json` (`include` add `"proxy"`), `eslint.config.js` (lint `proxy/**/*.ts`), `package.json` `lint`/`lint:fix` scripts (add `proxy/`)

**Interfaces:**
- Produces: `export interface ProxyEnv { ALLOWED_ORIGINS?: string; JIRA_ALLOWED_HOSTS?: string }`, `export const PROXY_PREFIX = "/jira-proxy"`, `export function normalizeJiraBaseUrl(raw: string | null, env: ProxyEnv): string | null`, `export async function handle(request: Request, env?: ProxyEnv, fetchImpl?: typeof fetch): Promise<Response>`.

- [ ] **Step 1: Add the vitest project.** In `vitest.config.ts` `test.projects`, add:

```ts
      {
        extends: true,
        test: {
          name: "proxy",
          environment: "node",
          include: ["proxy/**/*.{test,spec}.ts"],
        },
      },
```

- [ ] **Step 2: Write the failing tests** in `proxy/core.test.ts`. Use a `fetchImpl = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json", "set-cookie": "a=b", "x-other": "1" } }))` and helper:

```ts
const BASE = "https://acme.atlassian.net";
function req(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  return new Request(`https://app.example.com/jira-proxy${path}`, {
    ...init,
    headers: { "x-jira-base-url": BASE, authorization: "Basic abc", ...(init.headers || {}) },
  });
}
```

Cover, each as its own `it`:
1. `POST /rest/api/3/search/jql` → forwards to `https://acme.atlassian.net/rest/api/3/search/jql`, method POST, body forwarded, status 200, body `{"ok":true}`.
2. Query string forwarded unchanged: `GET /rest/agile/1.0/board?type=scrum&name=x` → upstream URL ends with `?type=scrum&name=x`.
3. Every allowed GET path returns upstream status: `/rest/api/3/issue/CCP-123/comment`, `/rest/api/3/user/search`, `/rest/api/2/user/search`, `/rest/api/3/filter/my`, `/rest/agile/1.0/board`, `/rest/agile/1.0/board/12/sprint`, `/rest/agile/1.0/board/12/sprint/34/issue`.
4. Disallowed → 403 `{"error":"Path not allowed"}` and `fetchImpl` not called: `GET /rest/api/3/search/jql`, `POST /rest/api/3/issue/CCP-1/comment`, `DELETE /rest/api/3/issue/CCP-1`, `GET /rest/api/3/issue/ccp-1/comment`, `GET /rest/agile/1.0/board/abc/sprint`, `GET /rest/api/3/myself`, `GET /rest/api/3/issue/CCP-1/comment/extra`.
5. Base URL: missing header → 400 with the exact spec error message; `http://acme.atlassian.net` → 400; `https://evil.com` → 400; `https://jira.corp.com` with `env.JIRA_ALLOWED_HOSTS = "jira.corp.com"` → forwarded; `https://acme.atlassian.net/some/path` → upstream uses origin only (`https://acme.atlassian.net/rest/...`).
6. Origin: no `Origin` header → allowed; `Origin: https://app.example.com` (same host as request URL) with no `ALLOWED_ORIGINS` → allowed and response has `Access-Control-Allow-Origin: https://app.example.com`; `Origin: https://other.com` with no `ALLOWED_ORIGINS` → 403 `{"error":"Origin not allowed"}`; `ALLOWED_ORIGINS="https://a.com, https://b.com"` + `Origin: https://b.com` → allowed; + `Origin: https://app.example.com` → 403.
7. `OPTIONS` from an allowed origin → 204 with `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: authorization, content-type, accept, x-jira-base-url`, `Access-Control-Max-Age: 86400`, `Vary: Origin`; `fetchImpl` not called.
8. `GET /health` → 200 `{"status":"ok"}`, no base-URL header required.
9. Only `authorization`, `accept`, `content-type` are forwarded: send also `cookie: x=1` and `x-jira-base-url`; assert upstream `Headers` contains exactly those three names.
10. Response strips upstream headers: response has `content-type: application/json`, `cache-control: no-store`, no `set-cookie`, no `x-other`.
11. POST body > 65536 bytes → 413 `{"error":"Body too large"}`, `fetchImpl` not called.
12. `fetchImpl` rejects → 502 `{"error":"Upstream request failed"}`.
13. Upstream `redirect` option is `"manual"` and a `signal` is passed.
14. Path outside prefix (`https://app.example.com/other`) → 404 `{"error":"Not found"}`.

- [ ] **Step 3: Run to verify failure.** `yarn vitest run proxy/core.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `proxy/core.ts`:**

```ts
/**
 * Stateless Jira passthrough. Jira Cloud rejects browser (CORS) requests made
 * with API tokens, so the web app sends Jira calls here with the user's own
 * credentials. Nothing is stored, cached, or logged. Only the read-only
 * endpoints the app uses are forwarded.
 */

export interface ProxyEnv {
  /** Comma-separated exact origins allowed to call the proxy. Unset = same-origin only. */
  ALLOWED_ORIGINS?: string;
  /** Comma-separated extra Jira hostnames allowed besides *.atlassian.net. */
  JIRA_ALLOWED_HOSTS?: string;
}

export const PROXY_PREFIX = "/jira-proxy";

const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 25_000;
const FORWARDED_HEADERS = ["authorization", "accept", "content-type"];
const BASE_URL_ERROR =
  "Jira base URL not allowed: must be https://<site>.atlassian.net or listed in JIRA_ALLOWED_HOSTS";

const ISSUE_KEY = "[A-Z][A-Z0-9_]*-\\d+";
const ID = "\\d+";
const ALLOWED_ROUTES: { method: "GET" | "POST"; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/rest\/api\/3\/search\/jql$/ },
  { method: "GET", pattern: new RegExp(`^/rest/api/3/issue/${ISSUE_KEY}/comment$`) },
  { method: "GET", pattern: /^\/rest\/api\/[23]\/user\/search$/ },
  { method: "GET", pattern: /^\/rest\/api\/3\/filter\/my$/ },
  { method: "GET", pattern: /^\/rest\/agile\/1\.0\/board$/ },
  { method: "GET", pattern: new RegExp(`^/rest/agile/1\\.0/board/${ID}/sprint$`) },
  { method: "GET", pattern: new RegExp(`^/rest/agile/1\\.0/board/${ID}/sprint/${ID}/issue$`) },
];

function splitList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/** Returns the Jira origin if allowed, else null. */
export function normalizeJiraBaseUrl(raw: string | null, env: ProxyEnv): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname.endsWith(".atlassian.net")) return url.origin;
    const extra = splitList(env.JIRA_ALLOWED_HOSTS).map((h) => h.toLowerCase());
    return extra.includes(hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

function isOriginAllowed(origin: string, requestUrl: URL, env: ProxyEnv): boolean {
  const allowed = splitList(env.ALLOWED_ORIGINS);
  if (allowed.length > 0) return allowed.includes(origin);
  try {
    // Host only: TLS is often terminated in front of the proxy, so schemes can differ.
    return new URL(origin).host === requestUrl.host;
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, accept, x-jira-base-url",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function handle(
  request: Request,
  env: ProxyEnv = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${PROXY_PREFIX}/`)) return json(404, { error: "Not found" });
  const path = url.pathname.slice(PROXY_PREFIX.length);
  const method = request.method.toUpperCase();

  const origin = request.headers.get("origin");
  if (origin && !isOriginAllowed(origin, url, env)) {
    return json(403, { error: "Origin not allowed" });
  }
  const cors = corsHeaders(origin);

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (method === "GET" && path === "/health") return json(200, { status: "ok" }, cors);

  const base = normalizeJiraBaseUrl(request.headers.get("x-jira-base-url"), env);
  if (!base) return json(400, { error: BASE_URL_ERROR }, cors);

  if (!ALLOWED_ROUTES.some((r) => r.method === method && r.pattern.test(path))) {
    return json(403, { error: "Path not allowed" }, cors);
  }

  let body: ArrayBuffer | undefined;
  if (method === "POST") {
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) return json(413, { error: "Body too large" }, cors);
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return json(413, { error: "Body too large" }, cors);
  }

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${base}${path}${url.search}`, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return json(502, { error: "Upstream request failed" }, cors);
  }

  const out = new Headers({ ...cors, "Cache-Control": "no-store" });
  const contentType = upstream.headers.get("content-type");
  if (contentType) out.set("Content-Type", contentType);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
```

- [ ] **Step 5: Run tests.** `yarn vitest run proxy/core.test.ts` → PASS. Then `yarn test`, `yarn typecheck`, `yarn lint` → green.

- [ ] **Step 6: Commit.**

```bash
git add proxy/ vitest.config.ts tsconfig.json eslint.config.js package.json
git commit -m "feat: add stateless allowlisted Jira passthrough proxy core

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Browser HTTP layer (credentials, errors, GitHub + Jira clients)

**Files:**
- Create: `src/api/http/errors.ts`, `src/api/http/credentials.ts`, `src/api/http/github.ts`, `src/api/http/jira.ts`, `src/vite-env.d.ts`
- Test: `src/api/http/errors.test.ts`, `src/api/http/clients.test.ts`

**Interfaces:**
- Produces:
  - `class ApiError extends Error { status: number; response: { status: number; data: { error: string } } }` with `constructor(status: number, message: string)`
  - `toApiError(err: unknown): ApiError`
  - `requireSettings(): AppSettings` (throws `ApiError(401, "Missing credentials: configure Dev Home in Settings")`)
  - `base64Utf8(s: string): string`
  - `GITHUB_API = "https://api.github.com"`, `githubRest(): AxiosInstance`, `githubGraphql<T = any>(query: string, variables?: Record<string, any>): Promise<T>`
  - `JIRA_PROXY_BASE: string`, `jiraClient(): AxiosInstance` (`/rest/api/3`), `jiraClientV2(): AxiosInstance` (`/rest/api/2`), `jiraAgileClient(): AxiosInstance` (`/rest/agile/1.0`)

- [ ] **Step 1: `src/vite-env.d.ts`:**

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
```

- [ ] **Step 2: Write failing tests.**

`errors.test.ts`:
- `new ApiError(404, "nope")` has `message "nope"`, `status 404`, `response.data.error "nope"`, `instanceof Error`.
- `toApiError` picks, in order: `response.data.error` → `response.data.errorMessages[0]` → `response.data.message` → `err.message`; status from `response.status`; status `0` when there is no response; returns the same instance when given an `ApiError`.

`clients.test.ts` (set `localStorage` settings via `saveSettings` from `src/services/config`; set `axios.defaults.adapter = vi.fn(async (config) => ({ data: {...}, status: 200, statusText: "OK", headers: {}, config }))`; restore in `afterEach`):
- `requireSettings()` throws `ApiError` status 401 when unconfigured.
- `githubRest().get("/user")`: adapter config has `baseURL "https://api.github.com"`, `Authorization "Bearer <token>"`, `Accept "application/vnd.github+json"`.
- `githubGraphql("query{viewer{login}}", {a:1})` posts `{query, variables}` to `https://api.github.com/graphql` and returns `data.data`; when response has `errors: [{message:"x"},{message:"y"}]` it throws an Error with message `GitHub GraphQL error: x; y` and `graphqlErrors` property.
- A 401 response from GitHub with `{message:"Bad credentials"}` rejects with `ApiError` status 401 message `Bad credentials`.
- `jiraClient().post("/search/jql", {...})`: URL is `/jira-proxy/rest/api/3/search/jql`, headers include `x-jira-base-url` (trailing slash stripped from settings value) and `Authorization: Basic <base64Utf8("email:token")>`.
- `jiraAgileClient()` baseURL ends `/jira-proxy/rest/agile/1.0`; `jiraClientV2()` ends `/jira-proxy/rest/api/2`.
- `base64Utf8("é:ü")` equals `Buffer.from("é:ü","utf8").toString("base64")`.
- A 400 from the proxy with `{error:"Jira base URL not allowed: ..."}` rejects with `ApiError` carrying that message.

Run `yarn vitest run src/api/http` → FAIL.

- [ ] **Step 3: Implement.**

`src/api/http/errors.ts`:

```ts
/**
 * Error thrown by every API call. `response.data.error` mirrors the old server
 * error body so existing UI code (`err.response?.data?.error || err.message`)
 * keeps working unchanged.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly response: { status: number; data: { error: string } };

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.response = { status, data: { error: message } };
  }
}

/** Normalize axios / proxy / GitHub / Jira errors. Status 0 = network or CORS failure. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = err as { message?: string; response?: { status?: number; data?: any } };
  const data = e?.response?.data;
  const fromBody =
    data && typeof data === "object"
      ? data.error ||
        (Array.isArray(data.errorMessages) ? data.errorMessages[0] : undefined) ||
        data.message
      : undefined;
  return new ApiError(e?.response?.status ?? 0, String(fromBody || e?.message || "Request failed"));
}
```

`src/api/http/credentials.ts`:

```ts
import { loadSettings, isConfigured, type AppSettings } from "../../services/config";
import { ApiError } from "./errors";

/** Current settings, or a 401 ApiError when credentials are incomplete. */
export function requireSettings(): AppSettings {
  const settings = loadSettings();
  if (!isConfigured(settings)) {
    throw new ApiError(401, "Missing credentials: configure Dev Home in Settings");
  }
  return settings;
}

/** btoa() only accepts Latin-1; encode as UTF-8 first. */
export function base64Utf8(value: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
```

`src/api/http/github.ts`:

```ts
import axios, { type AxiosInstance } from "axios";
import { requireSettings } from "./credentials";
import { toApiError } from "./errors";

export const GITHUB_API = "https://api.github.com";

interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>;
}

/** GitHub REST client using the user's token. Built per call so settings changes apply. */
export function githubRest(): AxiosInstance {
  const { githubToken } = requireSettings();
  const client = axios.create({
    baseURL: GITHUB_API,
    headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
  });
  client.interceptors.response.use(undefined, (err) => Promise.reject(toApiError(err)));
  return client;
}

/** Execute a GitHub GraphQL query; throws if the response carries `errors`. */
export async function githubGraphql<T = any>(
  query: string,
  variables: Record<string, any> = {},
): Promise<T> {
  const { githubToken } = requireSettings();
  let body: GraphQLResponse<T>;
  try {
    const response = await axios.post<GraphQLResponse<T>>(
      `${GITHUB_API}/graphql`,
      { query, variables },
      { headers: { Authorization: `Bearer ${githubToken}`, "Content-Type": "application/json" } },
    );
    body = response.data;
  } catch (err) {
    throw toApiError(err);
  }

  if (body.errors && body.errors.length > 0) {
    const messages = body.errors.map((e) => e.message).join("; ");
    const error: any = new Error(`GitHub GraphQL error: ${messages}`);
    error.graphqlErrors = body.errors;
    throw error;
  }
  return body.data;
}
```

`src/api/http/jira.ts`:

```ts
import axios, { type AxiosInstance } from "axios";
import { base64Utf8, requireSettings } from "./credentials";
import { toApiError } from "./errors";

/** Where the Jira passthrough proxy lives. Same origin by default. */
export const JIRA_PROXY_BASE: string =
  (import.meta.env?.VITE_JIRA_PROXY_URL as string | undefined)?.replace(/\/+$/, "") ||
  "/jira-proxy";

function createJiraClient(apiPath: string): AxiosInstance {
  const s = requireSettings();
  const client = axios.create({
    baseURL: `${JIRA_PROXY_BASE}${apiPath}`,
    headers: {
      "x-jira-base-url": s.jiraBaseUrl.replace(/\/+$/, ""),
      Authorization: `Basic ${base64Utf8(`${s.jiraEmail}:${s.jiraApiToken}`)}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  client.interceptors.response.use(undefined, (err) => Promise.reject(toApiError(err)));
  return client;
}

/** Jira platform REST API v3, via the proxy. */
export const jiraClient = () => createJiraClient("/rest/api/3");
/** Jira platform REST API v2 (only used for email user search). */
export const jiraClientV2 = () => createJiraClient("/rest/api/2");
/** Jira Software (Agile) REST API, via the proxy. */
export const jiraAgileClient = () => createJiraClient("/rest/agile/1.0");
```

- [ ] **Step 4: Run tests.** `yarn vitest run src/api/http` → PASS; `yarn test`, `yarn typecheck`, `yarn lint` → green.

- [ ] **Step 5: Commit** (`feat: add browser-side GitHub and Jira HTTP clients` + trailer).

---

### Task 3: Port GitHub logic to the browser; remove job logs

**Files:**
- Create: `src/api/github/` — split `server/src/routes/github.ts` into focused modules, e.g. `queries.ts` (GraphQL strings + `PR_CHECKS_ROLLUP`), `mapping.ts` (`mapCheckContext`, `deriveReviewStatus`, `deriveYourTurn`, `countUnresolvedThreads`, `mapGraphQLPr`, `extractOwnPRComments`, `isBot`, date helpers), `requiredContexts.ts` (cache + `getRequiredContexts` + `mapOpenPrsWithChecks`), `notifications.ts` (`extractSubjectNumber`, `subjectUrlToHtml`, `fetchAllNotifications`, `filterOpenNotifications`, `fetchCommentsInBatches`), `index.ts` (the exported operations below). Move `server/src/services/githubChecks.ts` + its test to `src/api/github/checks.ts` / `checks.test.ts`.
- Modify: `src/services/github.ts`, `src/views/teams/MemberSearchRow.tsx`, `src/components/DescriptionModal.tsx` (+ its CSS if log-viewer styles become unused)
- Delete: `server/src/routes/github.ts`, `server/src/services/githubChecks.ts(+test)`, `app/api/github/**`
- Test: `src/api/github/index.test.ts` (new), `src/api/github/checks.test.ts` (moved)

**Interfaces:**
- Consumes: `githubRest`, `githubGraphql`, `requireSettings`, `ApiError` from Task 2 (`src/api/http/*`).
- Produces (all in `src/api/github/index.ts`; return values identical to the old `res.json` payloads):
  - `getPrs(): Promise<{ prs: any[]; pr_comments: any[] }>`
  - `getReviews(): Promise<{ reviews: any[]; reviewing: any[] }>`
  - `getGithubMentions(): Promise<{ mentions: any[] }>`
  - `getOrgPrs(args: { cursor?: string; author?: string; repo?: string }): Promise<{ prs: any[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>`
  - `getOrgPrsMultiRepo(args: { repos: string; author?: string }): Promise<{ prs: any[] }>` (`repos` is the same comma-separated string the old `?repos=` took)
  - `getMergedPrs(args: { scope?: "user" | "org"; author?: string; repo?: string }): Promise<{ prs: any[] }>`
  - `getOrgMembers(): Promise<{ members: { login: string; avatar_url: string }[] }>`
  - `getOrgRepos(): Promise<{ repos: { full_name: string; name: string }[] }>`
  - `getPrDetail(args: { owner: string; repo: string; number: number }): Promise<{ pr: any }>`
  - `clearRequiredContextsCache(): void`

Conversion rules (apply mechanically to every handler):
- `export async function getX(req, res)` → `export async function getX(args)`; `req.query.foo` / `req.params.foo` → `args.foo` (keep the existing trimming/defaulting logic).
- `res.json(value)` → `return value`.
- `res.status(n).json({ error: msg })` → `throw new ApiError(n, msg)`. In `getPrDetail`, the existing try/catch that maps errors to a status must become: not found → `throw new ApiError(404, "Pull request not found")`; other errors rethrow via `toApiError`.
- `getConfig()` → `requireSettings()` (fields have the same names: `githubToken`, `githubUsername`, `githubOrg`).
- `createGitHubClient()` → `githubRest()`; `graphql(...)` → `githubGraphql(...)`.
- `requiredContextsCache`: key `${owner}/${repo}@${branch}` (drop the `node:crypto` token hash); keep TTL, pruning and the 500-entry cap. Export `clearRequiredContextsCache()` and call it from a `window.addEventListener(SETTINGS_EVENT, ...)` registered once at module load (guard `typeof window !== "undefined"`).
- Remove `getJobLogs` entirely.

- [ ] **Step 1: Write failing tests** in `src/api/github/index.test.ts` (mock `axios.defaults.adapter`; configure settings via `saveSettings`). At minimum:
  - `getMergedPrs({ scope: "org" })` with empty `githubOrg` returns `{ prs: [] }` without any HTTP call.
  - `getMergedPrs({ scope: "user" })` sends a GraphQL query whose `variables.query` contains `author:<githubUsername> type:pr is:merged`.
  - `getOrgMembers()` returns `{ members: [] }` when `githubOrg` is empty.
  - `getPrDetail` with a GraphQL response whose repository/pullRequest is null throws `ApiError` status 404 message `Pull request not found`.
  - `getReviews()` returns `reviews` with `viewer_engaged` set for PRs also present in the reviewed-by/commenter searches (feed three canned search responses by inspecting `variables.query`).
  - Unconfigured settings → `getPrs()` rejects with `ApiError` 401.
  Run `yarn vitest run src/api/github` → FAIL.

- [ ] **Step 2: Move and convert** the code as described. Move `githubChecks.test.ts` alongside, fixing imports. Keep function bodies and comments otherwise unchanged.

- [ ] **Step 3: Rewire `src/services/github.ts`.** Each function keeps its exported name/signature and mapping, replacing `const { data } = await apiClient.get("/github/X", { params })` with `const data = await getX({...params})`. In `fetchRecentlyMergedPRs`, the per-combo call becomes `getMergedPrs(params).then((r) => r.prs)`. Delete `fetchJobLogs`. Remove the `apiClient` import.

- [ ] **Step 4: `MemberSearchRow.tsx`:** replace the `apiClient.get("/github/org-members")` effect with `fetchOrgMembers()` from `src/services/github` (it already returns `data.members`), keeping the cancel guard and the `[]` fallback.

- [ ] **Step 5: Remove job logs UI** in `DescriptionModal.tsx`: delete `LogViewer`, `parseJobInfoFromUrl` (if only used there), the `fetchJobLogs` import, and whatever button/state opens the log viewer. Delete now-unused CSS rules (`log-viewer*`). Checks remain listed and still link to their GitHub URL.

- [ ] **Step 6: Delete** `server/src/routes/github.ts`, `server/src/services/githubChecks.ts`, `server/src/services/githubChecks.test.ts`, and `app/api/github/`. `grep -rn "routes/github\|githubChecks\|job-logs\|fetchJobLogs" src app server shared` → no hits.

- [ ] **Step 7: Verify.** `yarn test`, `yarn typecheck`, `yarn lint` → green.

- [ ] **Step 8: Commit** (`feat: call GitHub directly from the browser; remove job logs` + trailer).

---

### Task 4: Port Jira logic to the browser

**Files:**
- Create: `src/api/jira/adf.ts` (moved from `server/src/utils/adf.ts`), `src/api/jira/issues.ts` (from `routes/jira.ts`), `src/api/jira/filters.ts` (from `routes/jiraFilters.ts`), `src/api/jira/teams.ts` (from `routes/teamsJira.ts`), `src/api/jira/index.ts` (re-exports)
- Modify: `src/services/jira.ts`, `src/services/jiraFilters.ts`, `src/services/teams.ts` (`searchJiraUsers`, `searchJiraBoards`, `fetchBoardSprints`)
- Delete: `server/src/routes/jira.ts`, `server/src/routes/jiraFilters.ts`, `server/src/routes/teamsJira.ts`, `app/api/jira/**`, `app/api/jira-filters/**`, `app/api/teams-jira/**`. Keep `server/src/utils/adf.ts` only if `server/src/routes/teams.ts` still imports it (it moves in Task 5); otherwise delete it.
- Test: `src/api/jira/index.test.ts`, plus an `adf.test.ts` if one exists on the server side (move it).

**Interfaces:**
- Consumes: `jiraClient`, `jiraClientV2`, `jiraAgileClient`, `requireSettings`, `ApiError` from Task 2.
- Produces (return values identical to old `res.json` payloads):
  - `getIssues(): Promise<{ issues: JiraIssue-shaped[] }>`
  - `postIssuesBulk(args: { keys: string[] }): Promise<{ issues: any[] }>`
  - `getJiraMentions(): Promise<{ comments: any[] }>`
  - `getRemoteFilters(): Promise<{ filters: any[] }>`
  - `postJqlSearch(args: { jql: string; nextPageToken?: string | null }): Promise<{ issues: any[]; total: number; nextPageToken: string | null }>` (throws `ApiError(400, "jql is required")` on empty jql)
  - `searchUsers(args: { q: string }): Promise<{ users: any[] }>`
  - `searchBoards(args: { q: string }): Promise<{ boards: any[] }>`
  - `getBoardSprints(args: { id: number }): Promise<{ sprints: any[] }>` (throws `ApiError(400, "invalid board id")` for NaN)
  - `adfToMarkdown(node: any): string`

Conversion rules: same as Task 3. Additionally in `searchUsers`, the raw `axios.get(\`${config.jiraBaseUrl}/rest/api/2/user/search\`, ...)` with `Buffer` credentials becomes `jiraClientV2().get("/user/search", { params: { username: q, maxResults: 20 } })` (keep the `.catch(() => [])`). No `Buffer` anywhere in `src/`. Keep the `console.error` in mentions but it must not print headers.

- [ ] **Step 1: Write failing tests** (`src/api/jira/index.test.ts`, mocking `axios.defaults.adapter`):
  - `getIssues()` posts to `/jira-proxy/rest/api/3/search/jql` with the existing JQL (`assignee = currentUser() AND resolution = Unresolved ...`) and maps an issue to the documented shape.
  - `postIssuesBulk({ keys: [] })` returns `{ issues: [] }` with no HTTP call; with keys it builds `key IN ("A-1", "B-2")`.
  - `getJiraMentions()` filters comments to those mentioning the email or its local part, sorted by `updated` DESC, and a failing per-issue comment request is skipped (not fatal).
  - `postJqlSearch({ jql: "  " })` rejects `ApiError` 400 `jql is required`.
  - `searchUsers({ q: "a@b.com" })` calls both `/rest/api/3/user/search?query=` and `/rest/api/2/user/search?username=` through the proxy and dedupes by `accountId`; a v2 failure still returns v3 results.
  - `getBoardSprints({ id: NaN })` rejects `ApiError` 400.
  Run → FAIL.

- [ ] **Step 2: Move and convert** the code.

- [ ] **Step 3: Rewire services** — `fetchAssignedIssues` → `(await getIssues()).issues`, `fetchIssuesByKeys` → `(await postIssuesBulk({ keys })).issues`, `fetchRecentMentions` → `(await getJiraMentions()).comments`; `jiraFilters.ts` remote/search calls similarly (keep their existing result mapping); `teams.ts` `searchJiraUsers` → `(await searchUsers({ q })).users || []`, `searchJiraBoards`, `fetchBoardSprints` likewise. Update any service tests that spied on `apiClient` to `vi.mock` the `src/api/jira` module instead.

- [ ] **Step 4: Delete** the server Jira route files and `app/api/{jira,jira-filters,teams-jira}`.

- [ ] **Step 5: Verify** `yarn test`, `yarn typecheck`, `yarn lint`.

- [ ] **Step 6: Commit** (`feat: run Jira logic in the browser via the passthrough proxy` + trailer).

---

### Task 5: Port the team dashboard aggregation to the browser

**Files:**
- Create: `src/api/teams/dashboard.ts` (from `server/src/routes/teams.ts`), `src/api/teams/aggregation.ts` (from `server/src/services/teamAggregation.ts`), `src/api/teams/cockpit/*.ts` (from `server/src/services/dashboard/*.ts`, tests moved alongside)
- Move: `server/src/routes/teams.test.ts` → `src/api/teams/dashboard.test.ts`
- Modify: `src/services/teams.ts` (`fetchTeamDashboard`), `src/services/teams.test.ts`
- Delete: the moved server files and `app/api/teams/**`; if `server/src/utils/adf.ts` still exists, delete it now

**Interfaces:**
- Consumes: `jiraClient`, `jiraAgileClient`, `githubGraphql`, `ApiError` (Task 2); `adfToMarkdown` (Task 4) if used.
- Produces: `postTeamDashboard(args: { team: {...}; members: RosterEntry[]; sprintId?: number | null }): Promise<<exactly the old res.json payload>>` (throws `ApiError(400, "team and members are required")` on bad input); `mapAgileIssues` stays exported.

Conversion rules as in Task 3. Fix relative imports: `aggregation.ts` imports from `../../../shared/tickets` (repo-root `shared/`) — compute the correct relative path from `src/api/teams/`.

- [ ] **Step 1:** Move tests first (`dashboard/*.test.ts`, `teams.test.ts`), fix imports, and add to `dashboard.test.ts`: `postTeamDashboard({ team: null, members: [] })` rejects `ApiError` 400. Run → FAIL (source not moved yet).
- [ ] **Step 2:** Move and convert the source.
- [ ] **Step 3:** In `fetchTeamDashboard`, replace `const { data } = await apiClient.post("/teams/dashboard", body)` with `const data: any = await postTeamDashboard(body)`; the snapshot/burnup code after it is unchanged. Update `src/services/teams.test.ts` to `vi.mock("../api/teams/dashboard", ...)` instead of spying on `apiClient.post`, preserving what each test asserts.
- [ ] **Step 4:** Delete moved server files and `app/api/teams/`. `grep -rn "apiClient" src` must now only show `src/services/config.ts` (+ its test).
- [ ] **Step 5:** Verify `yarn test`, `yarn typecheck`, `yarn lint`.
- [ ] **Step 6: Commit** (`feat: compute the team dashboard in the browser` + trailer).

---

### Task 6: Switch from Next.js to Vite; Node server; delete server/

**Files:**
- Create: `index.html`, `src/main.tsx`, `vite.config.ts`, `proxy/nodeAdapter.ts`, `proxy/node.ts`, `proxy/securityHeaders.ts`, `proxy/node.test.ts`, `Dockerfile`, `.dockerignore`, `public/_headers`
- Modify: `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.gitignore`, `src/services/config.ts` (+ `config.test.ts`), `src/hooks/useConfig.ts`, `src/views/settings/BackendStatusCard.tsx`, `src/App.tsx` (version label)
- Delete: `app/`, `server/` (entire directory), `next.config.ts`, `next-env.d.ts`

**Interfaces:**
- Consumes: `handle`, `ProxyEnv`, `PROXY_PREFIX` (Task 1); `JIRA_PROXY_BASE` (Task 2).
- Produces: `toWebRequest(req: IncomingMessage, origin: string): Request`, `sendWebResponse(res: ServerResponse, response: Response): Promise<void>` in `proxy/nodeAdapter.ts`; `SECURITY_HEADERS: Record<string, string>` in `proxy/securityHeaders.ts`; `createServer(opts: { distDir: string; env: ProxyEnv }): http.Server` exported from `proxy/node.ts`; `checkBackendHealth()` now hits `${JIRA_PROXY_BASE}/health`; global `__APP_VERSION__`.

- [ ] **Step 1: Dependencies.** `yarn remove next` and `yarn add -D vite esbuild` (match the vite major already resolved by `@vitejs/plugin-react` / vitest in `yarn.lock`).

- [ ] **Step 2: `proxy/securityHeaders.ts`** — one source for Node headers:

```ts
/** Security headers for the static app. Keep in sync with public/_headers (Cloudflare). */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.github.com",
    "media-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
```

`public/_headers` (Cloudflare static assets format) with the same four headers under `/*`, each on its own indented line. (`'unsafe-inline'` in script-src is required by the theme bootstrap script in `index.html`.)

- [ ] **Step 3: `proxy/nodeAdapter.ts`:**

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

/** Convert a node:http request into a web Request (for proxy/core handle()). */
export function toWebRequest(req: IncomingMessage, origin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method || "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(new URL(req.url || "/", origin), {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // Required by Node's fetch when streaming a request body.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

/** Write a web Response to a node:http response. */
export async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}
```

- [ ] **Step 4: `proxy/node.ts`** — `createServer({ distDir, env })` returns an `http.Server` that:
  - routes `/jira-proxy/*` to `handle(toWebRequest(req, \`http://${req.headers.host}\`), env)` then `sendWebResponse` (wrap in try/catch → 500 `{"error":"Internal error"}`, no logging of headers);
  - otherwise serves static files from `distDir` (resolve the path, reject anything escaping `distDir` with 404, set `Content-Type` from a small extension map: html, js, css, json, svg, png, ico, woff2, txt, map), falling back to `index.html` for unknown paths without a file extension (SPA), 404 otherwise;
  - sets `SECURITY_HEADERS` on every static response; `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`, `no-cache` for `index.html`.
  - When run as the entry (`import.meta.url === pathToFileURL(process.argv[1]).href`), listens on `Number(process.env.PORT) || 3000`, with `distDir` = `path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist")` and env from `process.env.ALLOWED_ORIGINS` / `process.env.JIRA_ALLOWED_HOSTS`, and logs one line `Dev Home listening on http://localhost:<port>`.

  `proxy/node.test.ts` (node project): start `createServer` on port 0 against a temp dist dir containing `index.html` and `assets/app.js`; assert `/` → 200 html with CSP header; `/assets/app.js` → js content type + immutable cache; `/some/route` → index.html; `/../package.json` → 404; `/jira-proxy/health` → 200 `{"status":"ok"}`.

- [ ] **Step 5: `vite.config.ts`:**

```ts
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import pkg from "./package.json";
import { handle, PROXY_PREFIX } from "./proxy/core";
import { sendWebResponse, toWebRequest } from "./proxy/nodeAdapter";

/** Serve the Jira passthrough proxy from the Vite dev server. */
function jiraProxyDev(): Plugin {
  return {
    name: "jira-proxy-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(`${PROXY_PREFIX}/`)) return next();
        const response = await handle(toWebRequest(req, `http://${req.headers.host}`), {
          ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
          JIRA_ALLOWED_HOSTS: process.env.JIRA_ALLOWED_HOSTS,
        });
        await sendWebResponse(res, response);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), jiraProxyDev()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 3000 },
});
```

Update `vitest.config.ts`: drop the `@server` alias and the `server` project; add `define: { __APP_VERSION__: JSON.stringify("test") }`; `proxy` project stays.

- [ ] **Step 6: Entry files.** `index.html` at repo root: `<!doctype html>`, `lang="en"`, `<meta charset>`, viewport meta, `<title>Dev Home</title>`, `<meta name="description" content="Developer Home Dashboard - JIRA & GitHub integration">`, `<link rel="icon" href="/favicon.png">`, the exact theme bootstrap script currently inlined in `app/layout.tsx` (as a plain inline `<script>`), `<div id="root"></div>`, `<script type="module" src="/src/main.tsx"></script>`. `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

(If `src/App.tsx` is a default export named differently, adapt the import. If StrictMode double-mount breaks an effect that was fine under Next, drop `StrictMode` rather than changing app code, and note it in the report.)

- [ ] **Step 7: Scripts** in `package.json`:

```json
"dev": "vite",
"build": "tsc --noEmit && vite build && esbuild proxy/node.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist-server/server.mjs",
"start": "node dist-server/server.mjs",
"preview": "yarn build && yarn start",
"lint": "eslint src/ proxy/",
"lint:fix": "eslint src/ proxy/ --fix",
```

`tsconfig.json`: `"jsx": "react-jsx"`, remove the `next` plugin and `@server/*` path, `include: ["src", "shared", "proxy", "vite.config.ts", "vitest.config.ts"]`, add `"types": ["vite/client", "node"]` if needed for typecheck. `eslint.config.js`: file globs `src/**`, `proxy/**`; ignores add `dist-server/**`, drop `.next/**`, `dist-electron/**`. `.gitignore`: add `dist-server/`, remove `.next/` and `out/` lines only if nothing else needs them (keep harmless lines).

- [ ] **Step 8: Health/version.** In `src/services/config.ts`: delete `API_BASE`, `apiClient`, `credentialHeaders` and their tests (nothing else should import them — verify with grep); rewrite `checkBackendHealth()` to `fetch(\`${JIRA_PROXY_BASE}/health\`)` → `{ online: res.ok && body.status === "ok", version: __APP_VERSION__ }`, catching to `{ online: false, version: __APP_VERSION__ }`. `BackendStatusCard.tsx`: relabel the status row to "Jira proxy" (online/offline) and show "Version <x>"; keep props. `App.tsx`: `process.env.NEXT_PUBLIC_APP_VERSION || "dev"` → `__APP_VERSION__`. Update/replace `config.test.ts` cases accordingly (health online/offline via `vi.stubGlobal("fetch", ...)`).

- [ ] **Step 9: Delete** `app/`, `server/`, `next.config.ts`, `next-env.d.ts`, `tsconfig.tsbuildinfo` if tracked. `grep -rn "next/\|@server\|NEXT_PUBLIC\|nextHandler" src proxy shared *.ts *.json` → no hits (package.json `name` etc. fine).

- [ ] **Step 10: Dockerfile + .dockerignore:**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
EXPOSE 3000
CMD ["node", "dist-server/server.mjs"]
```

`.dockerignore`: `node_modules`, `dist`, `dist-server`, `data`, `release`, `.git`, `.superpowers`, `*.log`.

- [ ] **Step 11: Verify.** `yarn test`, `yarn typecheck`, `yarn lint`, `yarn build` → green. Then `PORT=3123 node dist-server/server.mjs &`, `curl -s localhost:3123/ | grep -q 'id="root"'`, `curl -s localhost:3123/jira-proxy/health` → `{"status":"ok"}`, `curl -si localhost:3123/ | grep -i content-security-policy`; kill the server. Start `yarn dev` briefly and `curl -s localhost:3000/jira-proxy/health`; stop it.

- [ ] **Step 12: Commit** (`feat: replace Next.js with a static Vite build and Node proxy server` + trailer).

---

### Task 7: Cloudflare Worker entry and deployment docs

**Files:**
- Create: `proxy/worker.ts`, `wrangler.jsonc`, `proxy/worker.test.ts`
- Modify: `package.json` (add `wrangler` devDependency and `deploy:cf` script), `docs/deploy.md` (rewrite), `README.md` (run/deploy section only)

**Interfaces:**
- Consumes: `handle`, `ProxyEnv` (Task 1).

- [ ] **Step 1: `proxy/worker.ts`:**

```ts
import { handle, type ProxyEnv } from "./core";

/**
 * Cloudflare Worker entry. Static assets are served by Workers Static Assets;
 * only /jira-proxy/* reaches this code (see run_worker_first in wrangler.jsonc).
 */
export default {
  fetch(request: Request, env: ProxyEnv): Promise<Response> {
    return handle(request, env);
  },
};
```

`proxy/worker.test.ts`: calling `worker.fetch(new Request("https://x.workers.dev/jira-proxy/health"), {})` → 200 `{"status":"ok"}`.

- [ ] **Step 2: `wrangler.jsonc`:**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "dev-home",
  "main": "proxy/worker.ts",
  "compatibility_date": "2026-09-30",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/jira-proxy/*"]
  },
  "observability": { "enabled": false }
}
```

`yarn add -D wrangler`; script `"deploy:cf": "yarn build && wrangler deploy"`. Verify `yarn wrangler deploy --dry-run --outdir /tmp/wrangler-dry` succeeds (no login needed for dry-run). If `run_worker_first` array form is rejected by the installed wrangler version, check `yarn wrangler --version` and the wrangler docs for the supported form, use it, and note the change in the report.

- [ ] **Step 3: Rewrite `docs/deploy.md`** for the new architecture. Sections, in this order:
  1. **How it works** — static app + `/jira-proxy` passthrough; GitHub is called directly from the browser; credentials only in the browser's localStorage; the proxy stores/logs nothing; diagram from the spec.
  2. **Security considerations** — HTTPS; no login (anyone with the URL can use it with their own credentials); whoever operates a deployment could in principle read tokens passing through the proxy, so users should prefer self-deployed or trusted instances; recommend **scoped, read-only Atlassian API tokens** and fine-grained read-only GitHub tokens; the proxy only forwards the read-only Jira endpoints listed in the spec (include the table).
  3. **Cloudflare Workers (recommended, free)** — prerequisites (Cloudflare account, `yarn install`); `yarn wrangler login`; `yarn deploy:cf`; resulting URL `https://dev-home.<subdomain>.workers.dev`; free-tier fit: static asset requests are free and don't invoke the Worker; only `/jira-proxy/*` counts toward 100,000 requests/day; estimate ~300 proxy requests per active user per day at the 10-minute poll → roughly 300 active users/day on the free tier; the proxy does no parsing so it stays within the 10 ms CPU limit. **Environment variables** via `wrangler.jsonc` `vars` or dashboard: `ALLOWED_ORIGINS` (only needed when the app is served from a different origin than the Worker, e.g. custom domain + separate proxy), `JIRA_ALLOWED_HOSTS`. **Rate limiting (recommended):** Cloudflare dashboard → your zone → Security → WAF → Rate limiting rules → create rule: `URI Path starts with /jira-proxy/`, 60 requests per 1 minute per IP, action Block — note that rate-limiting rules require the Worker to be on a custom domain/route in a Cloudflare zone (not `workers.dev`); for `workers.dev`, mention the Workers Rate Limiting binding as an alternative. **Custom domain:** Workers → Settings → Domains & Routes. **Updating:** re-run `yarn deploy:cf`. **Deploy from CI (optional):** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets and `yarn deploy:cf`.
  4. **Docker / any Node host (self-host)** — `yarn build && yarn start` (PORT, JIRA_ALLOWED_HOSTS, ALLOWED_ORIGINS); Dockerfile usage `docker build -t dev-home . && docker run -p 3000:3000 dev-home`; put behind HTTPS.
  5. **Separate proxy origin (advanced)** — build with `VITE_JIRA_PROXY_URL=https://proxy.example.com/jira-proxy`, set `ALLOWED_ORIGINS` on the proxy to the app origin, and add the proxy origin to `connect-src` in `public/_headers` / `proxy/securityHeaders.ts`.
  6. **Environment variables** table (`ALLOWED_ORIGINS`, `JIRA_ALLOWED_HOSTS`, `PORT`, build-time `VITE_JIRA_PROXY_URL`).
  7. **Post-deployment** — open the app, Settings, enter credentials; check "Jira proxy: online" in Settings; `curl https://<host>/jira-proxy/health`.
  8. **Migrating data from the desktop app** — keep the existing section content about `scripts/export-sqlite.mjs` if it lives in README/docs (move it here if it was in the old deploy doc; don't lose it).
  Remove all Vercel/OpenNext/Next.js content.

- [ ] **Step 4: README.md** — update only the dev/run/deploy instructions (`yarn dev`, `yarn build`, `yarn start`, link to `docs/deploy.md`); remove Next.js mentions.

- [ ] **Step 5: Verify** `yarn test`, `yarn typecheck`, `yarn lint`, `yarn build`, wrangler dry-run.

- [ ] **Step 6: Commit** (`feat: add Cloudflare Worker entry and rewrite deployment guide` + trailer).

---

### Task 8: API cost reductions

**Files:**
- Modify: `src/api/github/notifications.ts`, `src/api/github/index.ts` (`getGithubMentions`, `getReviews`, `getMergedPrs`, `getOrgPrsMultiRepo`), `src/api/github/queries.ts`, `src/services/github.ts` (`fetchRecentlyMergedPRs`, `fetchOrgPRsMulti`), `src/api/jira/issues.ts` (`getJiraMentions`), `src/hooks/useDashboard.ts`
- Test: `src/api/github/costs.test.ts`, extend `src/api/jira/index.test.ts`, `src/services/github` tests if present

**Interfaces:**
- Produces: `buildMergedPrsQuery(args: { scope: "user" | "org"; username: string; org: string; authors: string[]; repos: string[]; since: string }): string | null` and `buildOrgPrsQuery(args: { org: string; authors: string[]; repos: string[] }): string` (exported from `src/api/github/index.ts` for testing); `getMergedPrs(args: { scope?: "user" | "org"; authors?: string[]; repos?: string[] })` (arrays replace the single `author`/`repo`); `resetMentionsCache(): void`.

- [ ] **Step 1: Write failing tests** for each item below, then implement it. Run `yarn vitest run src/api` between items.

1. **GitHub mentions (If-Modified-Since + per-thread cache + cap).** In `notifications.ts`, keep a module-level cache `{ lastModified: string | null; notifications: any[] }` and `threadComments: Map<string, { updatedAt: string; comments: any[] }>`. `fetchAllNotifications` sends `If-Modified-Since: <lastModified>` on the **first page** when cached, with `validateStatus: (s) => (s >= 200 && s < 300) || s === 304`; on 304 return the cached list; on 200 store `last-modified` from response headers and the fetched list. After `filterOpenNotifications`, sort newest first and cap at 50. `fetchCommentsInBatches` reuses `threadComments` entries whose `updatedAt === notification.updated_at` and only fetches the rest. Export `resetMentionsCache()`; call it on `SETTINGS_EVENT`. Tests: second call sends the header and on 304 makes no comment requests; a notification with changed `updated_at` is re-fetched while unchanged ones are not; >50 notifications → only 50 processed.
2. **Reviews in one request.** Add `REVIEWS_QUERY` in `queries.ts` with three aliased searches (`requested`, `reviewedBy`, `commented`) sharing the PR node fragment from `SEARCH_PRS_QUERY` (define the node selection once as a fragment or template constant — no copy-paste). `getReviews` issues a single `githubGraphql` call with variables `requestedQuery`, `reviewedQuery`, `commentedQuery`, `first: 50`, then the existing merging/`viewer_engaged` logic. Test: exactly one GraphQL POST; output identical to the Task 3 test expectations.
3. **Merged PRs and multi-author/multi-repo org PRs in one query.** GitHub search ORs repeated qualifiers of the same kind. `buildMergedPrsQuery`: user scope → `author:<username> type:pr is:merged merged:>=<since>`; org scope with no org → `null`; org scope → `type:pr is:merged merged:>=<since>` + (`repo:r` for each repo, or `org:<org>` when no repos) + `author:a` for each author. `getMergedPrs` returns `{ prs: [] }` for `null`, else one search (keep `first: 20`, raise to 50 when more than one author or repo is selected). `fetchRecentlyMergedPRs(scope, authors, repos)` becomes a single `getMergedPrs({ scope, authors, repos })` call (signature unchanged for callers). Likewise `fetchOrgPRsMulti(authors, repos)`: replace the per-author fan-out with one query built by `buildOrgPrsQuery` (`org:<org> type:pr state:open` or `repo:` qualifiers + `author:` qualifiers, keeping whatever other qualifiers the existing org-PR search uses) passed through the existing org-PR search path; remove `getOrgPrsMultiRepo`'s per-repo loop if the single query now covers it (keep the export only if still used). Tests: query strings for 0/1/many authors × 0/1/many repos; exactly one HTTP call for 3 authors × 2 repos.
4. **Jira mentions inline comments.** Search with `fields: ["summary", "comment"]`. For each issue use `issue.fields.comment.comments`; only when `comment.total > comment.comments.length` fall back to `GET /issue/{key}/comment`. Output shape unchanged. Tests: no per-issue calls when inline comments are complete; one fallback call for an issue with `total` > returned.
5. **Polling.** `POLLING_INTERVAL_MS` in `src/hooks/useDashboard.ts` → `10 * 60 * 1000` with comment `// 10 minutes`.

- [ ] **Step 2: Verify** `yarn test`, `yarn typecheck`, `yarn lint`, `yarn build`.
- [ ] **Step 3: Commit** (`perf: cut GitHub and Jira API calls per refresh` + trailer).

---

### Task 9: Notification permission via user gesture

**Files:**
- Modify: `src/hooks/useReminderScheduler.ts`, `src/hooks/useReminderScheduler.test.ts`
- Create: `src/views/settings/NotificationsCard.tsx`, `src/views/settings/NotificationsCard.test.tsx`
- Modify: the Settings view that renders `BackendStatusCard` (add the new card next to it)

- [ ] **Step 1: Tests first.**
  - `useReminderScheduler`: no longer calls `Notification.requestPermission` on mount (update the existing test that expected it to assert `not.toHaveBeenCalled()`); still fires notifications when permission is `granted`.
  - `NotificationsCard`: permission `default` → shows an "Enable notifications" button; clicking calls `Notification.requestPermission()`; on `"granted"` shows the success toast using the app's existing fixed-bottom toast component/pattern (find how other settings cards confirm success and reuse it) and the card then shows "Notifications enabled"; `denied` → shows text explaining notifications are blocked in the browser's site settings (no button); `Notification` undefined → card shows "Notifications are not supported in this browser".
- [ ] **Step 2: Implement.** Remove the mount-time `requestPermission` block from `useReminderScheduler` (keep pre-seeding). Build `NotificationsCard` in the style of the neighbouring settings cards. Mention in the card's help text that reminders and Pomodoro alerts only fire while Dev Home is open in a tab or installed window.
- [ ] **Step 3: Verify** `yarn test`, `yarn typecheck`, `yarn lint`, `yarn build`.
- [ ] **Step 4: Commit** (`feat: ask for notification permission from a Settings button` + trailer).
