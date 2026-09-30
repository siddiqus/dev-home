# Dev Home as a static web app + Jira passthrough proxy — design

Date: 2026-10-01
Branch: `web-vite` (cut from `web-nextjs`; neither `master` nor `web-nextjs` is modified or merged)

## Goal

Turn the `web-nextjs` app into a static Vite single-page app that calls GitHub directly from the browser and reaches Jira through a tiny, stateless, allowlisted passthrough proxy. The proxy is deployable as a Cloudflare Worker (free tier), a Node server (Docker/self-host), or Vite dev middleware. No Next.js, no Electron, no Claude features, no server-side app logic.

## Decisions (made with the user, 2026-09-30 / 2026-10-01)

1. **Web only.** No desktop/Electron app, no monorepo, no Claude features anywhere.
2. **All GitHub calls go browser → `api.github.com` directly** with the user's token. Verified in a real browser: GitHub REST and GraphQL send `access-control-allow-origin: *`. The GitHub Actions **job-logs feature is removed** (its logs redirect to blob storage without CORS, and the UX was poor).
3. **Jira Cloud blocks CORS** for API-token requests (verified: preflight 415, no CORS headers), so Jira goes through a proxy.
4. **The proxy is a dumb passthrough (approach A).** All Jira logic moves to the browser: JQL building, ADF→markdown, mention filtering, and the team-dashboard aggregation. The proxy only validates and forwards.
5. **Drop Next.js; use Vite.** The app already renders client-only (`ssr:false`), so Next.js gave nothing but route handlers.
6. **Data stays in localStorage** (unchanged from `web-nextjs`).
7. **Hosting target:** one Cloudflare Worker deploy that serves `dist/` as static assets and runs the proxy on `/jira-proxy/*` on the same origin. Docker/Node is the self-host path. Vercel is dropped from the docs.

## Architecture

```
Browser (static Vite app)
  ├─ GitHub ──────────────► api.github.com            (direct, user's token)
  ├─ Jira ───► /jira-proxy ──► <site>.atlassian.net   (passthrough, user's token)
  └─ localStorage          (settings, tokens, notes, kanban, teams…)
```

### Repo layout

```
index.html                 Vite entry (theme bootstrap script, favicon)
vite.config.ts             React plugin, @ alias, version define, dev proxy middleware
src/main.tsx               mounts <App/>
src/App.tsx …              UI unchanged except where noted
src/services/*.ts          SAME exported functions/signatures used by hooks/views;
                           internals call src/api/* instead of apiClient("/api/...")
src/api/http/              credentials, GitHub REST + GraphQL clients, Jira client (via proxy), error normalization
src/api/github/            ported from server/src/routes/github.ts + services/githubChecks.ts
src/api/jira/              ported from routes/jira.ts, jiraFilters.ts, teamsJira.ts, utils/adf.ts
src/api/teams/             ported from routes/teams.ts, services/teamAggregation.ts, services/dashboard/*
proxy/core.ts              handle(request: Request, env: ProxyEnv): Promise<Response>
proxy/nodeAdapter.ts       node:http IncomingMessage ↔ web Request/Response
proxy/node.ts              Node server: serves dist/ + /jira-proxy/*, security headers
proxy/worker.ts            Cloudflare Worker entry
wrangler.jsonc             Worker + static assets config
public/_headers            security headers for Cloudflare static assets
Dockerfile                 multi-stage: vite build → node proxy/node.ts runtime
```

**Removed:** `app/`, `next.config.ts`, `next-env.d.ts`, `server/` (all of it, including `nextHandler`, AsyncLocalStorage config, `toErrorResponse`), the `next` dependency, the job-logs feature (`fetchJobLogs`, `LogViewer` in `DescriptionModal.tsx`, route), and stale `dist-electron/` references in config.

`shared/` stays as-is.

## The browser API layer

- **Credentials:** `requireSettings()` reads `loadSettings()` and throws `ApiError(401, "Missing credentials: configure Dev Home in Settings")` if `isConfigured` is false. It replaces `getConfig()`.
- **GitHub:** `githubRest()` returns an axios instance (`https://api.github.com`, `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`). `githubGraphql(query, variables)` has the same behaviour as today's `graphql()`, including throwing on `errors`.
- **Jira:** `jiraClient()` and `jiraAgileClient()` return axios instances with baseURL `${JIRA_PROXY_BASE}/rest/api/3` and `${JIRA_PROXY_BASE}/rest/agile/1.0`, plus headers `x-jira-base-url: <normalized base>` and `Authorization: Basic <base64(email:token)>`. The base64 encoding must be UTF-8 safe. `JIRA_PROXY_BASE = import.meta.env.VITE_JIRA_PROXY_URL || "/jira-proxy"`.
- **Errors:** every client uses a response interceptor that converts axios errors into `ApiError(status, message)`:
  - `message` comes from the first of: `data.error` (proxy), `data.errorMessages[0]` (Jira), `data.message` (GitHub), then `err.message`.
  - `ApiError extends Error` and has `status`. It also has `response = { status, data: { error: message } }`, so existing UI code that reads `err.response?.data?.error` keeps working.
- **Handlers become plain functions.** Each server handler `(req, res) => res.json(x)` becomes `async fn(args) => x`, returning exactly what it used to `res.json`. Every `res.status(n).json({error})` becomes `throw new ApiError(n, error)`. The response shapes stay identical, so `src/services/*` keep their mapping code (`data.prs`, and so on).
- The `requiredContextsCache` keeps its TTL and size cap, but it is keyed by `owner/repo@branch` only. The browser has a single user, so `node:crypto` is gone. It is cleared when settings change (`SETTINGS_EVENT`).

## The Jira proxy

Request from the browser:
```
POST /jira-proxy/rest/api/3/search/jql
x-jira-base-url: https://optimizely.atlassian.net
Authorization: Basic <base64(email:token)>
Content-Type: application/json
```

`handle(request, env)` uses only the standard `Request`/`Response`/`fetch`. `env = { ALLOWED_ORIGINS?: string; JIRA_ALLOWED_HOSTS?: string }`. It handles each request in this order:

1. `GET /jira-proxy/health` → `200 {"status":"ok"}`.
2. **Origin:** if an `Origin` header is present, it must be in `ALLOWED_ORIGINS` (comma-separated, exact match). If `ALLOWED_ORIGINS` is unset, the Origin's host must equal the request URL's host (same-origin). A request without an `Origin` header is allowed. A disallowed Origin gets `403 {"error":"Origin not allowed"}`.
3. **OPTIONS preflight** from an allowed origin → `204` with CORS headers.
4. **Base URL:** `x-jira-base-url` must be `https:` with a hostname ending `.atlassian.net` or listed in `JIRA_ALLOWED_HOSTS`. It is normalized to `url.origin`. A missing or invalid value gets `400 {"error":"Jira base URL not allowed: must be https://<site>.atlassian.net or listed in JIRA_ALLOWED_HOSTS"}`.
5. **Allowlist:** the path is taken after the `/jira-proxy` prefix. The method and path must match one of these exactly:
   - `POST /rest/api/3/search/jql`
   - `GET /rest/api/3/issue/{KEY}/comment`, where `KEY` matches `^[A-Z][A-Z0-9_]*-\d+$`
   - `GET /rest/api/3/user/search`
   - `GET /rest/api/2/user/search`
   - `GET /rest/api/3/filter/my`
   - `GET /rest/agile/1.0/board`
   - `GET /rest/agile/1.0/board/{id}/sprint`
   - `GET /rest/agile/1.0/board/{id}/sprint/{id}/issue`, where each `id` matches `^\d+$`

   Anything else gets `403 {"error":"Path not allowed"}`. The query string is forwarded unchanged.
6. **Forward:** only `Authorization`, `Accept` and `Content-Type` are forwarded. A POST body over 64 KB gets `413 {"error":"Body too large"}`. The upstream request is made with `redirect: "manual"` and a 25 s timeout (`AbortSignal.timeout`).
7. **Respond:** the upstream status and body are streamed back with the upstream `Content-Type` plus CORS headers (when an Origin was sent and allowed). All other upstream headers are dropped. A network error or timeout gets `502 {"error":"Upstream request failed"}`.
8. **Never** log headers or bodies, and never cache.

CORS response headers:
- `Access-Control-Allow-Origin: <origin>`
- `Vary: Origin`
- `Access-Control-Allow-Headers: authorization, content-type, accept, x-jira-base-url`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Max-Age: 86400`

**Rate limiting** is set up in Cloudflare, not in code: the free rate-limiting rule, 60 requests/min per IP on `/jira-proxy/*`. It is documented in `docs/deploy.md`.

## Hosting

- **Cloudflare:** `wrangler.jsonc` sets `main: proxy/worker.ts` and `assets: { directory: "./dist", not_found_handling: "single-page-application", run_worker_first: ["/jira-proxy/*"] }`. Static asset requests don't invoke the Worker, so they don't count toward the 100k/day limit. Security headers for static assets come from `public/_headers`.
- **Node/Docker:** `yarn build` also bundles `proxy/node.ts` with esbuild into `dist-server/server.mjs` (zero runtime dependencies). `node dist-server/server.mjs` serves `dist/` with an SPA fallback and the same security headers, and routes `/jira-proxy/*` to `handle`. `PORT` defaults to 3000.
- **Dev:** `yarn dev` runs Vite. A Vite plugin mounts `handle` at `/jira-proxy` through `nodeAdapter`.
- **CSP:** `connect-src 'self' https://api.github.com`. If `VITE_JIRA_PROXY_URL` points elsewhere, the docs say to add its origin.

## API cost reductions (included)

1. **GitHub mentions:**
   - The notifications fetch sends `If-Modified-Since` using the last `Last-Modified`, kept in memory. A 304 reuses the cached notification list.
   - Comments are cached per notification thread, keyed by thread id + `updated_at`, so only changed threads are re-fetched.
   - At most 50 notifications are processed per refresh, newest first.
2. **Reviews:** the three review searches (requested, reviewed-by, commenter) are merged into one GraphQL request using aliases.
3. **Merged PRs and multi-author/multi-repo org PRs:** one search query each. GitHub ORs repeated qualifiers of the same kind (`author:a author:b repo:x repo:y`), which replaces the A×R fan-out in `src/services/github.ts`.
4. **Jira mentions:** request `fields: ["summary","comment"]` in the search and read `fields.comment.comments` inline. Fall back to `GET /issue/{key}/comment` only when `comment.total > comment.comments.length`.
5. **Dashboard polling interval:** 5 → 10 minutes.

## Notifications

`useReminderScheduler` no longer calls `Notification.requestPermission()` on mount, because browsers ignore or block prompts that don't come from a user gesture. When `Notification.permission === "default"`, the app shows an **"Enable notifications"** button in the Settings view. It calls `requestPermission()` on click, and success is confirmed with the existing fixed bottom toast pattern, never an inline alert. `usePomodoro` already asks on a user click and stays as-is.

## Settings/status

`BackendStatusCard` shows the app version, from a build-time define of `package.json` version, and **Jira proxy** status, from `GET ${JIRA_PROXY_BASE}/health`. `checkBackendHealth` is repointed to that URL. The "Dev Home (version)" label in `App.tsx` uses the same define instead of `process.env.NEXT_PUBLIC_APP_VERSION`.

## Testing

- Existing tests keep passing. Server tests move with their code into `src/api/**` and run in the jsdom project, except `proxy/**` tests, which run in a `node` vitest project.
- **New tests:**
  - proxy `handle`: each allowlist rule, origin rules, preflight, bad base URL, body cap, header stripping, upstream error → 502, health
  - error normalization
  - the Jira client's headers and base64 encoding
  - the mentions If-Modified-Since + per-thread cache
  - the merged/combined search query builders
  - the aliased reviews query result splitting
  - the Jira mentions inline-comment fallback
  - the notification permission button
- **Gates:** `yarn test`, `yarn typecheck`, `yarn lint` and `yarn build` all green. The app loads in a browser via `yarn dev` and via `node dist-server/server.mjs` after a build.

## Out of scope

Desktop/Electron, Claude, monorepo, Vercel config, a push/notify-while-closed service, server-side storage, OAuth.
