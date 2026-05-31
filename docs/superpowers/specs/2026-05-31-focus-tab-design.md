# Focus Tab — Design

## Context

Dev Home today shows JIRA tasks, PRs, mentions, reviews, and notes as separate, point-in-time lists. When several of these compete for attention, there's no single place that answers **"what should I work on next?"** The user has to scan multiple tabs and hold the ranking in their head.

The Focus tab is a new top-level view that aggregates every actionable item from the existing data sources and ranks them with transparent, tunable signals. Users can override the ranking with **Pin** (force to top) and **Snooze** (hide until a specified time). The goal is to turn the dashboard from a passive readout into an active "next-action" surface that improves focus and prioritization for a developer working across many microservices, PRs, and JIRA tickets.

Out of scope for this iteration: personal-usage metrics, reminders/notifications, context recovery (per-repo workspaces), command palette, and AI-assisted programming tracking.

## Architecture

**Frontend (Electron renderer / React):**
- `src/components/FocusView.tsx` — the tab UI
- `src/hooks/useFocus.ts` — state hook; consumes already-loaded data from `useDashboard` + `useNotes` and merges in pin/snooze state
- `src/services/focus.ts` — pure functions: `mergeSources(...)`, `scoreItems(...)`, snooze preset helpers. No I/O — easy to unit test.
- `src/services/focusApi.ts` — thin client for the new endpoints

**Backend (Express / better-sqlite3):**
- `server/src/routes/focus.ts` — REST endpoints for pin/snooze state
- New migration in `server/src/db.ts` to add the `focus_state` table

**Why client-side ranking:** all input data is already cached in the renderer by `useDashboard` and `useNotes`. Doing the ranking on the server would duplicate fetches, add latency, and couple ranking changes to backend redeploys. The server's only job here is to persist user overrides.

## Data Model

New SQLite table (append a new migration entry to the `MIGRATIONS` array in `server/src/db.ts`):

```sql
CREATE TABLE IF NOT EXISTS focus_state (
  item_id TEXT PRIMARY KEY,
  pinned_at INTEGER NULL,
  snoozed_until INTEGER NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_focus_state_snoozed ON focus_state(snoozed_until);
```

`item_id` is a composite string so the server doesn't need to know the source schema:
- `pr:<owner>/<repo>#<number>` (for both your PRs and review requests)
- `jira:<KEY-123>`
- `mention:jira:<commentId>` / `mention:gh:<id>`
- `note:<dbId>`

Pin and snooze are independent fields — both can be set, both can be cleared.

## FocusItem (client-side type, `src/services/focus.ts`)

```ts
type FocusKind = 'pr-mine' | 'pr-review' | 'jira' | 'mention' | 'note';

type FocusItem = {
  id: string;            // composite id (see Data Model)
  kind: FocusKind;
  title: string;
  url?: string;
  updatedAt: number;     // epoch ms
  signals: {
    ageDays: number;
    jiraPriority?: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
    ciFailing?: boolean;
    isReviewRequested?: boolean;
    isMention?: boolean;
    isPinned: boolean;
    snoozedUntil?: number;
  };
};
```

## Scoring (in `scoreItems`)

All weights are constants at the top of `src/services/focus.ts` so they can be tuned without code archaeology.

Base score by kind:
- `pr-review` (review requested of you): **50**
- `mention`: **45**
- `jira`: **10–60** depending on `jiraPriority` (Highest 60, High 50, Medium 30, Low 15, Lowest 10; missing → 25)
- `pr-mine` (your open PR): **30**
- `note`: **20**

Modifiers:
- `+ ageDays * 2`, capped at `+40`
- `+30` if `ciFailing` (only applies to `pr-mine`)
- `+1000` if pinned (forces to the Pinned section, which is rendered first regardless of score)

Snoozed items (`snoozedUntil` in the future): excluded from ranked output; appear only in the collapsed **Snoozed** section.

## API

`server/src/routes/focus.ts`:

- `GET /api/focus/state` → `{ items: Array<{ itemId, pinnedAt, snoozedUntil }> }`
  - Also garbage-collects rows whose `updated_at` is older than 90 days AND have neither pin nor active snooze
- `POST /api/focus/pin` body `{ itemId: string, pinned: boolean }` → upserts row, sets/clears `pinned_at`
- `POST /api/focus/snooze` body `{ itemId: string, until: number | null }` → upserts row, sets/clears `snoozed_until`

Follow the existing route style in `server/src/routes/notes.ts` for handler structure, error responses, and DB access.

## UI

**Sidebar:** add a new `Focus` tab between `Summary` and `Board`. Icon: `IconTarget` from `@tabler/icons-react`. Count badge = `pinned.length + topPriority.length`.

**`FocusView.tsx` layout (top-to-bottom, all sections collapsible):**

1. **📌 Pinned** — always rendered, even when empty. Empty hint: *"Pin items you want to focus on today."*
2. **🔥 Top priority** — top 5 by score, excluding pinned
3. **Everything else** — the remaining ranked items
4. **💤 Snoozed (N)** — collapsed by default; expanding shows snoozed items with un-snooze action and "wakes at" timestamp

**Header strip:** "Focus" title, total active count, and a small "Why these?" info popover that lists the scoring weights (so the ranking stays transparent).

**Row layout:**
- Left: kind icon + title (clicking title opens `url` in default browser via existing electron handler)
- Middle: signal chips — `age 3d`, `CI failing`, `P1`, `mention`
- Right: action cluster — **Pin/Unpin**, **Snooze ▾** (presets: `4h`, `Tomorrow 9am`, `Next Monday`, `Custom…`), **Open**

**Empty state (no items at all):** centered message "Nothing urgent. 🎯" with a link back to Summary.

## Error Handling & Edge Cases

- **Backend offline:** `useFocus` keeps pin/snooze state in memory for the session. Pin/snooze actions show a toast "Saved locally — will sync when backend reconnects." On reconnect, queued mutations are replayed (use the same `backendOnline` pattern as the rest of the app).
- **Stale items** (PR merged, JIRA closed): the `focus_state` row stays, but the item is filtered out of the rendered list because it isn't present in the source data. The 90-day GC cleans residual rows.
- **Timezones:** store epoch ms in the DB. Resolve snooze presets ("Tomorrow 9am", "Next Monday") in the client's local TZ.
- **Snooze in the past:** if `snoozedUntil <= now`, treat the row as not snoozed (don't filter out). No special migration needed.
- **No hard cap on pins:** the Pinned section is just a scrollable list. If the user pins everything, that's their choice — surfacing it doesn't hurt anyone.

## Reusable Pieces

- `useDashboard` (already exists) — source of `openPRs`, `reviewRequests`, `jiraIssues`, `jiraComments`, `githubMentions`
- `useNotes` (already exists) — source of `unresolvedNotes`
- `useKanban`'s `doneItemIds` pattern — model for filtering out completed items
- The append-only `MIGRATIONS` array in `server/src/db.ts` — append a new entry, do not reorder
- Existing route module shape in `server/src/routes/notes.ts` — model for `focus.ts`
- Existing Electron URL-open handler used by `PRTable` / `JiraTasks` row clicks
- Existing `backendOnline` toast/queue pattern in `useConfig`

## Testing / Verification

**Unit tests (`src/services/focus.test.ts`):**
- `scoreItems` — pinned floats to top; snoozed excluded; age modifier caps at +40; JIRA priority maps to the right base score; CI-failing adds +30 only to `pr-mine`
- `mergeSources` — composite IDs are unique across kinds; same JIRA appearing in `jiraIssues` and as a `mention` produces two rows (different IDs)

**Server (`server/src/routes/focus.test.ts` if test infra exists; otherwise document curl commands in PR):**
- `POST /api/focus/pin` then `GET /api/focus/state` round-trips
- `POST /api/focus/snooze` with `until: null` clears the snooze
- GC removes rows older than 90 days with no pin and no future snooze

**Manual end-to-end:**
1. `yarn dev`
2. Open the new Focus tab — verify list renders, items ranked top-down, signal chips show
3. Pin a PR → it jumps to Pinned section
4. Reload — pinned state persists
5. Snooze a JIRA for 1 minute → disappears from main list, appears in Snoozed section, auto-returns after 1 min
6. Stop the server → pin a different item → toast appears, pin works in-session; restart server → state syncs
7. Check Focus tab count badge updates as items are pinned/snoozed
