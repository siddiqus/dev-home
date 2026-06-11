# Claude CLI Integration for PR Actions

**Date:** 2026-06-10
**Status:** Draft

## Overview

Add Claude CLI integration to dev-home so users can trigger AI-powered actions on pull requests directly from the dashboard. Actions include reviewing PRs, addressing review comments, fixing CI failures, summarizing changes, and running custom prompts. The feature is gated behind a settings toggle and supports multiple concurrent sessions.

## Architecture

**Approach: Express-Managed Sessions with WebSocket Streaming**

The Express server spawns Claude CLI as child processes and streams output to the frontend via WebSocket. This keeps the existing REST pattern for CRUD operations while adding real-time streaming.

```
Frontend ──POST /api/claude/sessions──▶ Express Server
               Express ──spawn("claude", args)──▶ CLI Process
               Express ◀──stdout/stderr────────── CLI Process
Frontend ◀══WebSocket stream═══════════ Express Server
```

### Why this approach

- Consistent with the existing Express-based architecture (all other features use REST via `apiClient`)
- Sessions survive frontend reconnects — the process keeps running on the server
- REST endpoints for session management (list, cancel, status) integrate naturally
- WebSocket is well-supported in both Express (via `ws` library) and React

## Components

### 1. Settings: "AI Assistance" Section

A new section in the existing `SettingsView` with a master toggle and sub-settings.

**Settings fields:**
- `claudeEnabled` (boolean) — master toggle, default `false`. When off, the Claude button on PR rows and the "Claude" sidebar item are hidden entirely.
- `claudeCliPath` (string) — path to the `claude` binary, default auto-detected via `which claude`. A "Detect" button re-runs detection.
- `claudeWorkingDirectory` (string) — base directory where repos are cloned (e.g., `~/code`). When a session starts, the server resolves the repo from the PR's `repo_full_name` and uses `<workingDirectory>/<repo_name>` as the cwd.
- `claudeMaxConcurrentSessions` (number) — max parallel sessions, default `3`. Prevents resource exhaustion.

**Storage:** Persisted via the existing Electron store (`store:setSettings` / `store:getSettings`), extending the `AppSettings` interface.

**Validation on save:** The server checks that `claudeCliPath` exists and is executable. If not, show an inline error. The settings page shows a status indicator: green dot + version when detected, red dot + error when not found.

### 2. PR Table Row: Claude Action Button

A new column or inline button on each PR row in `PRTable.tsx`.

**Placement:** An action button on the right side of each row. Renders a `✨ Claude ▾` dropdown trigger button (Bootstrap `Dropdown`).

**Visibility:** Only rendered when `claudeEnabled` is `true`. The component reads this from app-level state (passed as a prop or via context).

**Dropdown menu items:**
1. **Review PR** — Have Claude analyze the code changes and leave review comments
2. **Address Comments** — Fix issues raised in existing review comments
3. **Fix CI Failures** — Investigate and fix failing checks/tests
4. **Summarize Changes** — Generate a PR description/summary
5. **Custom Prompt...** — Opens a text input for free-form instructions

**Context-aware highlighting:** The dropdown highlights the most relevant action based on PR state:
- `review_status === "CHANGES_REQUESTED"` → highlight "Address Comments"
- `checks_status === "FAILURE"` → highlight "Fix CI Failures"
- `review_status === null` (no reviews yet) → highlight "Review PR"
- `body === ""` or `body === null` (no description) → highlight "Summarize Changes"

Highlighting means the suggested item gets a subtle accent background and a "Suggested" label. All actions remain available regardless.

### 3. PR Detail Modal: Extended Actions

The existing `DescriptionModal` gains a Claude actions section when `claudeEnabled` is `true`. Same dropdown items as the row, but with more room for the "Custom Prompt" text area.

### 4. Sidebar: "Claude" Menu Item

A new sidebar navigation item labeled "Claude" with a badge showing the count of active sessions. Hidden when `claudeEnabled` is `false` or when there are no active/completed sessions and the feature was never used.

Clicking navigates to the Claude Sessions View.

### 5. Claude Sessions View

A new view component (`ClaudeSessionsView`) accessible from the sidebar.

**Sessions List:**
- Filter tabs: Active | Completed | All
- Each session card shows:
  - Status indicator (green pulsing dot for active, grey for completed)
  - Action type (e.g., "Address Comments")
  - Repository badge
  - PR reference (number + title)
  - Last output line preview (monospace, truncated)
  - Timestamps (started, completed, duration)
  - Actions: "View" button, "Cancel" button (active only)

**Session Detail View:**
- Header: back button, action type, PR reference
- Terminal output panel: dark background, monospace font, auto-scrolls to bottom
- Streams Claude CLI stdout/stderr in real-time via WebSocket
- Input bar at the bottom: text field + send button for follow-up messages to Claude (piped to stdin via WebSocket)
- "Cancel Session" button in the header
- When session completes, shows final status (success/error) and duration, input bar is disabled

## Backend

### New Express Routes: `/api/claude`

**`POST /api/claude/sessions`** — Create a new session
- Body: `{ prNumber, repoFullName, action, customPrompt? }`
- Validates `claudeEnabled` is true, max concurrent sessions not exceeded
- Resolves working directory: `<claudeWorkingDirectory>/<repoName>`
- Spawns `claude` CLI as a child process with appropriate arguments
- Returns: `{ sessionId, status: "running" }`

**`GET /api/claude/sessions`** — List all sessions
- Query params: `status` (active | completed | all)
- Returns: array of session summaries

**`GET /api/claude/sessions/:id`** — Get session detail
- Returns: full session info including buffered output

**`POST /api/claude/sessions/:id/cancel`** — Cancel a running session
- Sends SIGTERM to the child process
- Returns: `{ status: "cancelled" }`

**`DELETE /api/claude/sessions/:id`** — Remove a completed session from history

### WebSocket: `/ws/claude`

A WebSocket endpoint on the Express server for streaming session output.

**Connection flow:**
1. Frontend connects to `ws://localhost:<port>/ws/claude`
2. Frontend sends: `{ type: "subscribe", sessionId: "..." }`
3. Server streams: `{ type: "output", sessionId, data: "...", stream: "stdout"|"stderr" }`
4. Frontend can send input: `{ type: "input", sessionId, data: "..." }` — piped to the process's stdin
5. On completion: `{ type: "done", sessionId, exitCode, duration }`
6. Frontend can subscribe to multiple sessions simultaneously

**Implementation:** Use the `ws` package. Attach the WebSocket server to the existing HTTP server in `server/src/index.ts`.

### Claude CLI Command Construction

Each action maps to a specific Claude CLI invocation. Claude runs in interactive mode so the user can follow along and send follow-up messages.

```
Review PR:
  claude -p "Review the code changes in PR #<number> of <repo>. Analyze the diff, identify issues, and leave review comments on GitHub."

Address Comments:
  claude -p "Read the review comments on PR #<number> of <repo> and address each one. Make the necessary code changes."

Fix CI Failures:
  claude -p "Investigate the CI failures on PR #<number> of <repo>. Read the failing test output, identify the root cause, and fix it."

Summarize Changes:
  claude -p "Summarize the changes in PR #<number> of <repo>. Generate a clear, concise PR description."

Custom Prompt:
  claude -p "<user-provided prompt> (Context: PR #<number> in <repo>)"
```

The `-p` flag provides the initial prompt. All commands run with cwd set to the local repo directory. The session remains interactive — the user can send follow-up messages via the session detail view, which pipes input to the process's stdin via WebSocket.

### Session Storage

Sessions are stored in-memory on the Express server (a `Map<string, ClaudeSession>`). Each session holds:
- `id` — UUID
- `prNumber`, `repoFullName`, `action`, `customPrompt`
- `status` — "running" | "completed" | "cancelled" | "error"
- `startedAt`, `completedAt`
- `exitCode`
- `outputBuffer` — array of `{ timestamp, stream, data }` entries (for replay on reconnect)
- `process` — reference to the `ChildProcess` (null when completed)

Sessions are not persisted to SQLite. They exist for the lifetime of the app process. This is acceptable because Claude sessions are transient — completed sessions are only useful for reviewing recent output, not for long-term history.

## Data Flow

1. User clicks "Claude ▾" on a PR row → selects "Address Comments"
2. Frontend `POST /api/claude/sessions` with `{ prNumber: 142, repoFullName: "org/api-service", action: "address_comments" }`
3. Server validates settings, resolves cwd to `~/code/api-service`, spawns `claude --print "..."` 
4. Server creates session entry, returns `{ sessionId: "abc-123" }`
5. Frontend opens/reuses WebSocket to `/ws/claude`, sends `{ type: "subscribe", sessionId: "abc-123" }`
6. Server pipes child process stdout/stderr → WebSocket messages
7. Frontend renders output in the session detail view (or shows preview in the sessions list)
8. On process exit, server sends `{ type: "done", sessionId, exitCode }`, updates session status
9. User can navigate to Claude Sessions view at any time to see all active/completed sessions

## New Dependencies

- `ws` — WebSocket server for Express. Lightweight, no additional framework dependencies.
- `uuid` — Session ID generation. (Or use `crypto.randomUUID()` which is available in Node 19+.)

## Files to Create/Modify

### New files:
- `server/src/routes/claude.ts` — REST endpoints for session management
- `server/src/services/claudeSessionManager.ts` — Session lifecycle, process spawning, WebSocket broadcasting
- `src/views/claude/ClaudeSessionsView.tsx` — Sessions list + detail view
- `src/views/claude/ClaudeSessionsView.css` — Styles
- `src/components/ClaudeActionDropdown.tsx` — Dropdown button for PR rows + detail modal
- `src/hooks/useClaudeWebSocket.ts` — WebSocket connection hook for streaming output
- `src/services/claude.ts` — REST API client for Claude session endpoints

### Modified files:
- `src/types.ts` — Add `ClaudeSession`, `ClaudeAction`, `ClaudeSettings` types
- `server/src/index.ts` — Register `/api/claude` routes, attach WebSocket server
- `server/src/config.ts` — Add Claude settings fields
- `electron/store.ts` — Extend settings schema with Claude fields
- `src/services/config.ts` — Extend `AppSettings` interface
- `src/views/settings/SettingsView.tsx` — Add "AI Assistance" section
- `src/components/PRTable.tsx` — Add Claude action button column
- `src/components/DescriptionModal.tsx` — Add Claude actions section
- `src/App.tsx` — Add Claude view route, sidebar item, pass `claudeEnabled` state

## Error Handling

- **Claude CLI not found:** Settings validation catches this. If the binary disappears after save, session creation returns a clear error.
- **Repo directory not found:** Session creation checks that `<workingDirectory>/<repoName>` exists. Returns error with suggestion to configure the working directory.
- **Max sessions exceeded:** Session creation returns 429 with the current count and limit.
- **Process crash:** On unexpected exit (non-zero, not cancelled), session status is set to "error" and the exit code + last output are preserved.
- **WebSocket disconnect:** Output continues buffering on the server. On reconnect + re-subscribe, the server replays the buffered output.

## Testing

- Unit tests for `claudeSessionManager.ts` — mock `child_process.spawn`, verify session lifecycle
- Unit tests for `ClaudeActionDropdown.tsx` — verify context-aware highlighting logic
- Integration test for WebSocket streaming — verify output is delivered and sessions complete
- Manual testing: trigger each action type on a real PR, verify output streams correctly
