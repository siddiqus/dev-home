# Dev Home Web (Next.js, no database) — Design

**Date:** 2026-09-30
**Branch:** `web-nextjs`
**Status:** Approved for implementation

## Goal

Turn Dev Home from an Electron desktop app (Vite + React UI, local Express API,
SQLite) into a deployable, multi-user web app built on Next.js, with **no
server-side database and no login**. Anyone can open the site, enter their own
Jira/GitHub credentials, and use it.

## Decisions

| Topic | Decision |
|---|---|
| Framework | Next.js (App Router), single package at repo root |
| Users | Many users, no accounts/login |
| Credentials | Stored in the user's browser `localStorage`; sent per request as headers |
| Server state | **None.** The server is a stateless proxy + aggregation layer |
| Personal data | Browser `localStorage`, with JSON export/import |
| Sprint burn-up | Client records daily snapshots in `localStorage` (same semantics as today) |
| Claude features | **Removed entirely** (CLI spawning can't run on a web host) |
| Electron | Removed on this branch. The desktop app stays on `master` / existing releases |
| Hosting | Platform-neutral Node runtime; documented for Vercel and Cloudflare (OpenNext) |

## Why a server at all

Jira Cloud's REST API does not allow CORS for API-token (Basic auth) requests,
so the browser cannot call Jira directly. Next.js route handlers act as the
proxy and also host the existing aggregation logic (`server/src/services/**`)
unchanged.

## Current SQLite inventory → replacement

| Table | Purpose | Replacement |
|---|---|---|
| `notes` | Personal notes (free text / Jira / PR / link), pinned, resolved, `remind_at` | localStorage collection `notes` |
| `kanban_items` | Board column + position for note/pr/review items; unique `(item_type,item_id)` | localStorage collection `kanban_items` |
| `saved_filters` | Named Org-PR filters (`{authors, repos}`) | localStorage collection `saved_filters` |
| `jira_jql_filters` | Named JQL queries | localStorage collection `jira_jql_filters` |
| `focus_state` | Pin / snooze / dismiss per Focus item, 90-day GC | localStorage map `focus_state` |
| `teams` | Team name + Jira board | localStorage collection `teams` |
| `team_members` | Roster: display name, Jira account id/email, GitHub username | localStorage collection `team_members` |
| `sprint_snapshots` | Daily `{done,total}` per sprint for burn-up | localStorage map `sprint_snapshots` |
| `claude_sessions` | Claude CLI run history | Deleted with the Claude feature |

Settings previously in `electron-store` (Jira URL/email/token, GitHub
token/username/org, hidden tabs) move to localStorage key `dev-home-settings`.
All Claude settings are dropped.

## Architecture

```
Browser
 ├─ React UI (existing src/**, rendered client-only by Next)
 ├─ src/lib/localStore.ts  ← all personal data + settings
 └─ axios apiClient (baseURL "/api") ── adds x-jira-* / x-github-* headers
        │
Next.js route handlers (app/api/**/route.ts)  — Node runtime, stateless
 ├─ nextHandler(): headers → ServerConfig → AsyncLocalStorage → handler
 └─ existing handlers in server/src/routes/** (Express-like req/res shim)
        │
Jira Cloud REST / GitHub REST + GraphQL
```

### Credentials per request

- `server/src/config.ts` replaces the module-level `runtimeConfig` singleton
  (which would leak one user's tokens to all users) with an
  `AsyncLocalStorage<ServerConfig>`. `getConfig()` keeps its signature, so the
  API clients (`jiraApiClient`, `githubApiClient`, `githubGraphqlClient`) and
  routes don't change.
- Header names: `x-jira-base-url`, `x-jira-email`, `x-jira-api-token`,
  `x-github-token`, `x-github-username`, `x-github-org` (optional).
- Missing required headers → `getConfig()` throws a 401 error
  (`"Missing credentials: configure Dev Home in Settings"`).
- `POST /api/config` / `GET /api/config` and env-var fallback are removed.
  `GET /api/health` remains.
- The server never logs request headers. The error handler logs method, path,
  status and upstream message only (as today).

### Local data layer

- `src/lib/localStore.ts` provides `createCollection<T>(name)` (auto-increment
  numeric ids, same shape as the old SQLite rows) and `readJson/writeJson`.
  Keys are prefixed `dev-home:db:`.
- The existing service modules (`src/services/notes.ts`, `kanban.ts`,
  `filters.ts`, `jiraFilters.ts` (local part), `focusApi.ts`, `teams.ts` (CRUD
  part)) keep their exported function signatures and stay `async`, so hooks and
  components don't change. Validation that lived in Express moves into these
  modules.
- Timestamps keep SQLite's `YYYY-MM-DD HH:MM:SS` UTC format so imported desktop
  data and new rows sort/parse identically (`parseTimestamp` already handles
  it).

### Backup / migration

- Settings → "Data" card: **Export** downloads
  `dev-home-backup-YYYY-MM-DD.json` with every `dev-home:db:*` key plus
  non-secret settings (`githubUsername`, `githubOrg`, `jiraBaseUrl`,
  `jiraEmail`, `hiddenTabs`). Tokens are never exported.
  **Import** validates `{ app: "dev-home", version: 1, data: {...} }` and
  replaces local data.
- `scripts/export-sqlite.mjs <path/to/notes.db>` converts an existing desktop
  database into the same backup format (uses the `sqlite3` CLI, no npm deps),
  so desktop users can migrate.

### Teams dashboard

- Team + roster come from localStorage. `fetchTeamDashboard` POSTs
  `{ team, members, sprintId }` to `POST /api/teams/dashboard`.
- The server no longer touches snapshots. It returns the dashboard plus
  `snapshot: { sprintId, date, doneCount, totalCount } | null` for the current
  sprint.
- The client upserts that snapshot into `sprint_snapshots` and computes
  `burnup` with the pure `buildBurnup(rows)` (moved to `shared/burnup.ts`).
  Same behaviour as today: history accrues on days the dashboard is opened.
- Follow-up (out of scope): rebuild burn-up from Jira changelog so it's
  gap-free and consistent across users.

### Claude removal

Delete `server/src/routes/claude.ts`, `services/claudeSessionManager.ts`,
`services/claudePrompts.ts`, `src/services/claude.ts`, `src/types/claude.ts`,
`src/hooks/useClaude*.ts`, `src/views/claude/**`,
`src/components/ClaudeActionDropdown.*`, and every prop/menu/nav/shortcut/
setting that references them. Also drop the `ws` dependency.

### Electron-only features removed

`electron/**`, `electron-store`, `vite-plugin-electron*`, `electron-builder`
config, `FindInPage` (browsers have native find), `UpdateBanner` /
`useUpdateCheck` (desktop release checks), dynamic API port logic.

### Next.js layout

- `app/layout.tsx` — imports `bootstrap/dist/css/bootstrap.min.css` and
  `src/index.css`, sets `<html>`/`<body>`.
- `app/page.tsx` — renders `<App />` client-only via
  `next/dynamic(..., { ssr: false })` (the app reads localStorage during
  initial render).
- `app/api/**/route.ts` — one file per endpoint, each
  `export const GET/POST = nextHandler(handler)`, `runtime = "nodejs"`,
  heavy routes set `maxDuration = 60`.
- `server/src/http/nextHandler.ts` — adapter giving handlers an Express-like
  `req` (`query`, `params`, `body`) and `res` (`status().json()`), running
  inside the credentials context and mapping thrown errors exactly like the
  current `errorHandler`.
- `__APP_VERSION__` → `process.env.NEXT_PUBLIC_APP_VERSION` set in
  `next.config.ts` from `package.json`.
- `@/*` path alias preserved.
- Tests: Vitest `projects` — `web` (jsdom, `src/**`, `shared/**`) and
  `server` (node, `server/**`).

### Security

- Strict `Content-Security-Policy` in `next.config.ts` headers
  (`default-src 'self'`; `connect-src 'self'`; `img-src 'self' data: https:`
  for avatars; no third-party scripts), plus `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
- README states that tokens live only in the browser and are forwarded
  per-request, never stored or logged by the server.

## Hosting

- **Vercel Hobby:** zero-config for Next.js; Hobby terms are personal /
  non-commercial.
- **Cloudflare Workers via `@opennextjs/cloudflare`:** free tier, commercial
  use allowed; requires `nodejs_compat` (for `Buffer`, `AsyncLocalStorage`).
- `output: "standalone"` also allows any Node host / Docker.

## Out of scope

- Accounts, server-side persistence, cross-device sync.
- Burn-up reconstruction from Jira changelog.
- Keeping an Electron build on this branch.
