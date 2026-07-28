# Reminders — Design

**Date:** 2026-07-28
**Status:** Approved (revised for the current `NotesContext` architecture)

## Concept

A reminder is a note with an optional scheduled time. When that moment arrives,
the app fires a desktop notification (once, in real time) and marks the note
"due" in the UI. It stays due — highlighted and counted — until the user
resolves it.

Reminders are **not** a separate entity. They add one field (`remind_at`) to the
existing notes feature, reusing the notes table, API, hook, context, and UI.

## Decisions

| Question | Decision |
|----------|----------|
| Timer model | **Scheduled** absolute date/time (alarm/calendar model), not a countdown |
| Firing action | **Both** — native desktop notification + in-app surfacing |
| Data model | **Extend notes** with a `remind_at` field (no new entity/table) |
| Recurrence | **One-time only** |
| Post-fire behavior | **Stays active until resolved** (overdue reminders keep surfacing) |
| Firing mechanism | **Client-side scheduler** (React hook, mounted app-wide) |
| Editor control | Native `datetime-local` input + quick presets — kept simple |

## Out of scope (YAGNI)

Recurrence, snooze, auto-resolve on fire, and countdown timers were all
explicitly considered and decided against. Reminders on **PR-attached notes**
are also out of scope for v1 (see "Composition with PR notes" — it comes almost
for free later).

---

## Current architecture this builds on

The notes feature was recently restructured; the reminder work plugs into it as
follows:

- **`App.tsx` owns one `useNotes(configured)` instance** (`notesApi`, ~line 141),
  destructures `notes` / `addNote` / `editNote` / … from it, and wraps the app in
  **`<NotesProvider value={notesApi}>`** (`src/context/NotesContext.tsx`).
  Any component reads the same instance via `useNotesContext()` /
  `useOptionalNotes()`. There is exactly one fetch and one source of truth.
- The gate was loosened to `useNotes(configured)` (no longer tied to the notes
  source toggle), so notes — and therefore reminders — are always loaded once the
  app is configured. This is what lets reminders fire app-wide regardless of the
  active tab. (Consistent with the "data hooks gate on configured" convention.)
- **PR-attached notes** (`src/utils/prNotes.ts`, `src/components/PrNotesPanel.tsx`)
  are ordinary notes with `type: "github_pr"` and `reference_id = owner/repo#number`.
  They required no schema change. Because a reminder is just a note-level field,
  reminders compose with them automatically at the data layer.

Unchanged and reused as-is: `useNotes`, `src/services/notes.ts`, `NoteCard`,
`PersonalNotes`, `server/src/routes/notes.ts` (aside from the additions below).

---

## Components

### 1. Data model & migration

- **New append-only migration** in `server/src/db.ts` (next entry in the
  `MIGRATIONS` list):
  ```sql
  ALTER TABLE notes ADD COLUMN remind_at TEXT DEFAULT NULL;
  ```
  Stores an ISO-8601 UTC datetime string, or `NULL` for a plain note.
- **`Note` interface** (`src/types.ts`): add `remind_at: string | null`.

### 2. API — `server/src/routes/notes.ts`

- `POST /` accepts an optional `remind_at` in the body.
- `PATCH /:id` accepts `remind_at`, including an explicit `null` to clear a
  reminder from an existing note (mirror the existing `setClauses` pattern).
- Validation: if `remind_at` is present and not `null`, it must parse as a valid
  date, otherwise respond `400`.
- `GET /` already does `SELECT *`, so it returns `remind_at` automatically.

### 3. Service + hook — `src/services/notes.ts`, `src/hooks/useNotes.ts`

- Thread `remind_at?: string | null` through `createNote` / `updateNote` in the
  service.
- Extend the hook methods:
  - `addNote(type, content, referenceId?, title?, remindAt?)` — adding a 5th
    optional positional arg is backward-compatible with the existing
    `PrNotesPanel` call `addNote("github_pr", content, prNoteKey(pr), title)`.
  - `editNote(id, { title?, content?, reference_id?, remind_at? })`.
- Add a derived, exported value to the hook's return (and therefore to `NotesApi`
  via context, alongside the existing `unresolvedNotes`):
  - `reminderNotes` = notes with `remind_at != null`.
  This keeps "which notes are reminders" available everywhere through the context
  with no extra fetch. The *live due count* is produced by the scheduler (below),
  because it depends on the current time, not just the notes array.

### 4. Firing — `src/hooks/useReminderScheduler.ts`, called in `App.tsx`

Client-side scheduler. Called once in `App.tsx` with the `notes` already
destructured from the single `notesApi`, so it runs app-wide independent of the
active tab and reuses the one source of truth (no second fetch, no dependence on
being rendered under the provider).

- On mount: request `Notification` permission (reuse the `usePomodoro` pattern —
  request only when `permission === "default"`, swallow errors).
- Tick on a `setInterval` of ~15 seconds (minute granularity; no need for the
  250ms pomodoro tick).
- On each tick, for every note that is `remind_at <= now`, unresolved, and not
  yet notified this session: fire one `new Notification(title, { body })` when
  permission is granted.
- **Dedup key:** `` `${id}:${remind_at}` `` held in a `useRef<Set<string>>`, so
  editing a reminder's time re-arms it (a new key) while a fired reminder never
  double-fires.
- **Overdue-at-launch policy:** reminders already past due when the app starts
  are surfaced in-app only — they do **not** fire a desktop notification (avoids
  a notification storm on launch). Only reminders that cross the threshold while
  the app is running fire an OS notification. In-app surfacing is the safety net
  for anything missed while the app was closed.
- **Return value:** the hook keeps a `dueReminders` set/count in state, refreshed
  each tick, and returns it. `App.tsx` feeds this to the sidebar badge, and the
  tick-driven state update is what makes "due/overdue" styling and the badge
  update live (~every 15s) without user interaction.

The pure decision logic — given `(notes, now, alreadyNotified)`, which notes are
(a) due and (b) newly notifiable — is extracted into a standalone function so it
can be unit-tested without timers or the DOM `Notification` API.

### 5. In-app surfacing

- **`NoteCard`** (`src/views/notes/NoteCard.tsx`): when `remind_at` is set,
  render a clock chip showing the scheduled time in local time
  (e.g. "Today 3:00pm", "Jul 30, 9:00am"). When due/overdue and unresolved, style
  the chip with an alert color (amber → red) and label it "Due" / "Overdue 5m ago".
  Reuse the relative-time helper in `src/utils/time`.
- **`PersonalNotes`** (`src/views/notes/PersonalNotes.tsx`): in the Unresolved
  list, sort due/overdue reminders to the top, ahead of pinned and newest.
- **Sidebar** (`src/App.tsx`): add a small count badge to the Notes tab button =
  number of due-unresolved reminders (from the scheduler's return value). The
  sidebar tabs currently render only icon + label; this adds a badge span. There
  is precedent for a live indicator in `PomodoroBadge`.

### 6. Editor — `src/views/notes/NoteEditorModal.tsx`

- Add an optional "Remind me" control: a native `datetime-local` input plus a few
  quick presets ("In 1h", "Tomorrow 9am", "Clear").
- On save, pass `remind_at` (ISO string, or `null` when cleared) through the
  `onSave` / `onEdit` callbacks (extend those prop signatures and the matching
  `addNote` / `editNote` calls in `App.tsx`).

## Composition with PR notes (informational, not v1 work)

Because `remind_at` lives on every note, a PR-attached note can carry a reminder
with no additional backend or scheduler work — the scheduler fires for any note
with a due `remind_at`, regardless of `type`. The only thing v1 does **not** do is
expose a remind control inside `PrNotesPanel`'s lightweight inline editor. Adding
one later is a small, isolated follow-up.

## Data flow

```
NoteEditorModal ─(remind_at)─► addNote/editNote (useNotes) ─► service ─► POST/PATCH /notes
                                        │                                     │
                                   NotesContext ◄── notesApi (single instance) ┘
                                        │
   App.tsx: notes ─► useReminderScheduler(notes) ─► desktop Notification (real-time, once)
                                        │                └─► dueReminders (live, per tick)
                                        ├─► NoteCard (due/overdue chip)
                                        ├─► PersonalNotes (due-first sort)
                                        └─► Sidebar Notes-tab badge (dueReminders count)
```

## Error handling & edge cases

- **Timezone:** store UTC ISO; display in local time.
- **Permission denied:** in-app surfacing still works — graceful degradation,
  same as pomodoro.
- **App closed at fire time:** on reopen the reminder surfaces in-app as overdue;
  no desktop notification fires (per the overdue-at-launch policy).
- **Re-arming:** editing `remind_at` to a new time produces a new dedup key, so
  the reminder can fire again.
- **Resolving:** resolving a due reminder removes it from the badge count and the
  due-first sort.
- **Invalid input:** API rejects an unparseable `remind_at` with `400`.

## Testing

- **Server** (follow existing `server/src/**/*.test.ts` patterns): route tests
  for `POST`/`PATCH` with `remind_at` — valid ISO is stored, explicit `null`
  clears it, invalid string returns `400`; a check that the migration adds the
  column.
- **Frontend:** unit-test the extracted pure scheduler function (due-selection,
  dedup by `id:remind_at`, overdue-at-launch suppression); test `NoteCard`'s
  due/overdue rendering.
