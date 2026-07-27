# Reminders — Design

**Date:** 2026-07-28
**Status:** Approved

## Concept

A reminder is a note with an optional scheduled time. When that moment arrives,
the app fires a desktop notification (once, in real time) and marks the note
"due" in the UI. It stays due — highlighted and counted — until the user
resolves it.

Reminders are **not** a separate entity. They extend the existing notes feature
with one new field, reusing the notes table, API, hook, and UI.

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
explicitly considered and decided against.

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
  reminder from an existing note.
- Validation: if `remind_at` is present and not `null`, it must parse as a valid
  date, otherwise respond `400`. Reuse the existing validation style in the file.
- `GET /` already does `SELECT *`, so it returns `remind_at` automatically; no
  change to ordering needed (surfacing/sorting is done client-side).

### 3. Service + hook — `src/services/notes.ts`, `src/hooks/useNotes.ts`

- Thread `remind_at?: string | null` through `createNote` / `updateNote` in the
  service and `addNote` / `editNote` in the hook.
- Expose a derived value: `dueReminders` = notes where `remind_at` is set, the
  note is unresolved, and `remind_at <= now`. Used for the sidebar badge count.

### 4. Firing — `src/hooks/useReminderScheduler.ts`, mounted in `App.tsx`

Client-side scheduler (Approach A). Mounted at the App level so reminders fire
regardless of which tab is active.

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

The scheduler is a thin wrapper; its decision logic (which notes are due and
newly notifiable given a `now` and a set of already-notified keys) is extracted
into a **pure function** so it can be unit-tested without timers.

### 5. In-app surfacing

- **`NoteCard`** (`src/views/notes/NoteCard.tsx`): when `remind_at` is set,
  render a clock chip showing the scheduled time formatted in local time
  (e.g. "Today 3:00pm", "Jul 30, 9:00am"). When the reminder is due/overdue and
  unresolved, style the chip with an alert color (amber → red) and label it
  "Due" / "Overdue 5m ago". Reuse the relative-time helper in `src/utils/time`.
- **`PersonalNotes`** (`src/views/notes/PersonalNotes.tsx`): in the Unresolved
  list, sort due/overdue reminders to the top, ahead of pinned and newest.
- **Sidebar** (`src/App.tsx`): add a small count badge to the Notes tab button
  showing the number of due-unresolved reminders. This requires threading the
  `dueReminders` count into the sidebar tab rendering (the tabs currently show
  only icon + label; there is precedent for a live indicator in `PomodoroBadge`).

### 6. Editor — `src/views/notes/NoteEditorModal.tsx`

- Add an optional "Remind me" control: a native `datetime-local` input plus a
  few quick presets ("In 1h", "Tomorrow 9am", "Clear").
- On save, pass `remind_at` (ISO string, or `null` when cleared) through the
  `onSave` / `onEdit` callbacks. This requires extending the `onSave` / `onEdit`
  prop signatures and the corresponding `addNote` / `editNote` hook methods.

## Data flow

```
NoteEditorModal ──(remind_at)──► useNotes.addNote/editNote ──► service ──► POST/PATCH /notes
                                                                              │
GET /notes ◄──────────────────────────────────────────────────────────────┘
     │
     ▼
  notes[] ──► useReminderScheduler (App-level)  ──► desktop Notification (real-time, once)
     │
     ├──► NoteCard (due/overdue chip)
     ├──► PersonalNotes (due-first sort)
     └──► Sidebar Notes-tab badge (dueReminders count)
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
