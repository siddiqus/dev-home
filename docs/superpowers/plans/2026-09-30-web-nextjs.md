# Dev Home Web (Next.js, no database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Dev Home from Electron + Express + SQLite into a stateless, multi-user Next.js web app where credentials and personal data live in the browser's localStorage.

**Architecture:** The React UI is kept and rendered client-only by Next.js. Service modules in `src/services/*` keep their signatures but read/write localStorage instead of calling CRUD endpoints. The Express routes that proxy Jira/GitHub become Next.js route handlers via a small Express-like adapter; per-request credentials arrive as headers and are exposed to existing code through `AsyncLocalStorage` behind the unchanged `getConfig()`.

**Tech Stack:** Next.js 15 (App Router, Node runtime), React 18, TypeScript, axios, Vitest (jsdom + node projects), react-bootstrap, @tabler/icons-react.

**Spec:** `docs/superpowers/specs/2026-09-30-web-nextjs-design.md`

## Global Constraints

- Branch: `web-nextjs`. Commit after every task; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Package manager: **yarn** (v1, `yarn.lock`). Never add npm/pnpm lockfiles.
- No server-side persistence of any kind. No database, no files, no in-memory user state on the server.
- Server must never log request headers or tokens.
- Credential header names (exact): `x-jira-base-url`, `x-jira-email`, `x-jira-api-token`, `x-github-token`, `x-github-username`, `x-github-org`.
- localStorage keys: settings `dev-home-settings`; data prefix `dev-home:db:`. Existing UI keys (`dev-home-active-tab`, etc.) unchanged.
- Timestamps written by the local data layer use SQLite format `YYYY-MM-DD HH:MM:SS` (UTC).
- Service modules keep their exported names, parameters and return types; they remain `async`.
- Match surrounding code style (Prettier config in `.prettierrc`, comment density, naming). Run `yarn lint` for touched frontend code.
- All Claude features removed; no references to `claude` remain in `src/` or `server/` (except unrelated words in this doc set).

## Execution waves

- **Wave 1:** Task 1 (alone — touches many components).
- **Wave 2 (parallel, separate worktrees):** Track A = Tasks 2 → 3 → 4 → 5; Track C = Tasks 6 → 7. Track A must not edit `server/**`, `src/services/config.ts`, `src/services/teams.ts`, `src/hooks/useConfig.ts`, `src/App.tsx`. Track C must not edit `src/services/{notes,kanban,filters,jiraFilters,focusApi}.ts` or `src/lib/localStore.ts` except to import from it. **Track C depends on `src/lib/localStore.ts` from Task 2** — Task 2 is therefore done first on the wave-2 base before forking Track C.
- **Wave 3 (sequential):** Task 8 → Task 9 → Task 10.
- **Wave 4:** Task 11, then final whole-branch review.

---

### Task 1: Remove all Claude features

**Files:**
- Delete: `server/src/routes/claude.ts`, `server/src/services/claudeSessionManager.ts`, `server/src/services/claudePrompts.ts`, `src/services/claude.ts`, `src/types/claude.ts`, `src/hooks/useClaudeSessions.ts`, `src/hooks/useClaudeWebSocket.ts`, `src/views/claude/` (whole dir), `src/components/ClaudeActionDropdown.tsx`, `src/components/ClaudeActionDropdown.css`
- Modify: `server/src/index.ts`, `server/src/db.ts` (leave migration 10 in place — it's history; do not delete migrations), `electron/main.ts`, `electron/store.ts`, `src/App.tsx`, `src/config/navTabs.ts`, `src/config/tabData.ts`, `src/hooks/useKeyboardShortcuts.ts`, `src/services/config.ts` (remove `claude*` fields from `AppSettings`), `src/views/settings/SettingsView.tsx`, `src/components/{PRCard,PRSections,PRTable,DescriptionModal}.tsx`, `src/views/{orgPRs/OrgPRsView,prs/PRsView,kanban/KanbanBoard,teams/TeamPRsTab,teams/TeamDashboardView,reviews/ReviewsView,summary/SummaryView}.tsx`, `src/styles/reset.css`, `package.json` (drop `ws`, `@types/ws`; drop `"ws"` from vite electron externals)
- Test: existing suites

- [ ] **Step 1: Inventory references**

Run: `grep -rniE "claude" src server/src electron vite.config.ts package.json`
Every hit must be gone after this task (the only allowed remaining match is the historical migration 10 in `server/src/db.ts`).

- [ ] **Step 2: Delete the Claude files listed above**

```bash
git rm -r server/src/routes/claude.ts server/src/services/claudeSessionManager.ts server/src/services/claudePrompts.ts \
  src/services/claude.ts src/types/claude.ts src/hooks/useClaudeSessions.ts src/hooks/useClaudeWebSocket.ts \
  src/views/claude src/components/ClaudeActionDropdown.tsx src/components/ClaudeActionDropdown.css
```

- [ ] **Step 3: Remove wiring**

- `server/src/index.ts`: remove `import claudeRoutes` and `app.use("/api/claude", claudeRoutes)`; remove any WebSocket upgrade handling referencing Claude.
- `electron/main.ts` / `electron/store.ts`: remove `claudeEnabled`, `claudeCliPath`, `claudeWorkingDirectory`, `claudeMaxConcurrentSessions` schema entries and any WebSocket/Claude plumbing.
- `src/App.tsx`: remove `useClaudeSessions`, `ClaudeSessionsView`, `ClaudeAction`, `claudeEnabled` state, the Claude nav item/tab rendering, and every `onClaudeAction`/`claude*` prop passed to children.
- Components/views listed: remove `ClaudeActionDropdown` usage and `onClaudeAction`/`claudeEnabled`/`claude*` props from their prop interfaces and call sites. Remove now-unused imports.
- `navTabs.ts`, `tabData.ts`, `useKeyboardShortcuts.ts`: remove the Claude tab entry/shortcut.
- `SettingsView.tsx`: remove the Claude settings section and fields.
- `reset.css`: remove Claude-only selectors.

- [ ] **Step 4: Verify**

Run: `grep -rniE "claude" src server/src electron vite.config.ts package.json`
Expected: only `server/src/db.ts` migration 10 lines.
Run: `yarn tsc --noEmit -p tsconfig.json && yarn lint && yarn test && yarn --cwd server test && (cd server && npx tsc --noEmit -p tsconfig.json)`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Claude CLI integration for the web build"
```

---

### Task 2: localStorage data primitive

**Files:**
- Create: `src/lib/localStore.ts`
- Test: `src/lib/localStore.test.ts`

**Interfaces:**
- Produces:
  - `export const DB_PREFIX = "dev-home:db:"`
  - `export function sqliteNow(date?: Date): string` → `"YYYY-MM-DD HH:MM:SS"` UTC
  - `export function readJson<T>(key: string, fallback: T): T` (key is un-prefixed name; stored under `DB_PREFIX + key`; returns fallback on missing/corrupt)
  - `export function writeJson(key: string, value: unknown): void`
  - `export interface Collection<T extends { id: number }> { all(): T[]; get(id: number): T | undefined; insert(row: Omit<T, "id">): T; update(id: number, patch: Partial<Omit<T, "id">>): T | undefined; remove(id: number): boolean; removeWhere(pred: (row: T) => boolean): number; replaceAll(rows: T[]): void; }`
  - `export function createCollection<T extends { id: number }>(name: string): Collection<T>` — stored as `{ nextId: number, rows: T[] }` under `DB_PREFIX + name`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/localStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { createCollection, readJson, writeJson, sqliteNow, DB_PREFIX } from "./localStore";

interface Row {
  id: number;
  name: string;
}

describe("localStore", () => {
  beforeEach(() => localStorage.clear());

  it("formats timestamps like SQLite datetime('now')", () => {
    expect(sqliteNow(new Date("2026-09-30T07:05:09.123Z"))).toBe("2026-09-30 07:05:09");
  });

  it("readJson returns fallback for missing or corrupt values", () => {
    expect(readJson("x", 1)).toBe(1);
    localStorage.setItem(DB_PREFIX + "x", "{not json");
    expect(readJson("x", 2)).toBe(2);
    writeJson("x", { a: 1 });
    expect(readJson("x", null)).toEqual({ a: 1 });
  });

  it("inserts with auto-increment ids that are never reused", () => {
    const c = createCollection<Row>("rows");
    expect(c.insert({ name: "a" })).toEqual({ id: 1, name: "a" });
    expect(c.insert({ name: "b" }).id).toBe(2);
    c.remove(2);
    expect(c.insert({ name: "c" }).id).toBe(3);
    expect(c.all().map((r) => r.name)).toEqual(["a", "c"]);
  });

  it("updates, gets and removes", () => {
    const c = createCollection<Row>("rows");
    const a = c.insert({ name: "a" });
    expect(c.update(a.id, { name: "z" })).toEqual({ id: 1, name: "z" });
    expect(c.get(1)?.name).toBe("z");
    expect(c.update(99, { name: "q" })).toBeUndefined();
    expect(c.remove(99)).toBe(false);
    expect(c.remove(1)).toBe(true);
    expect(c.all()).toEqual([]);
  });

  it("removeWhere and replaceAll keep nextId ahead of existing ids", () => {
    const c = createCollection<Row>("rows");
    c.insert({ name: "a" });
    c.insert({ name: "b" });
    expect(c.removeWhere((r) => r.name === "a")).toBe(1);
    c.replaceAll([{ id: 40, name: "imported" }]);
    expect(c.insert({ name: "next" }).id).toBe(41);
  });

  it("persists across collection instances", () => {
    createCollection<Row>("rows").insert({ name: "a" });
    expect(createCollection<Row>("rows").all()).toEqual([{ id: 1, name: "a" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run src/lib/localStore.test.ts`
Expected: FAIL — cannot resolve `./localStore`.

- [ ] **Step 3: Implement**

```ts
// src/lib/localStore.ts
/**
 * Browser-local persistence that replaces the desktop app's SQLite tables.
 * Collections keep the old row shape (numeric auto-increment `id`) so the
 * service modules and UI didn't have to change.
 */
export const DB_PREFIX = "dev-home:db:";

/** UTC timestamp in SQLite's `datetime('now')` format. */
export function sqliteNow(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(DB_PREFIX + key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  localStorage.setItem(DB_PREFIX + key, JSON.stringify(value));
}

export interface Collection<T extends { id: number }> {
  all(): T[];
  get(id: number): T | undefined;
  insert(row: Omit<T, "id">): T;
  update(id: number, patch: Partial<Omit<T, "id">>): T | undefined;
  remove(id: number): boolean;
  removeWhere(pred: (row: T) => boolean): number;
  replaceAll(rows: T[]): void;
}

interface Stored<T> {
  nextId: number;
  rows: T[];
}

export function createCollection<T extends { id: number }>(name: string): Collection<T> {
  const load = (): Stored<T> => readJson<Stored<T>>(name, { nextId: 1, rows: [] });
  const save = (s: Stored<T>) => writeJson(name, s);

  return {
    all: () => load().rows,
    get: (id) => load().rows.find((r) => r.id === id),
    insert(row) {
      const s = load();
      const created = { ...row, id: s.nextId } as T;
      save({ nextId: s.nextId + 1, rows: [...s.rows, created] });
      return created;
    },
    update(id, patch) {
      const s = load();
      const idx = s.rows.findIndex((r) => r.id === id);
      if (idx === -1) return undefined;
      const updated = { ...s.rows[idx], ...patch, id } as T;
      const rows = [...s.rows];
      rows[idx] = updated;
      save({ ...s, rows });
      return updated;
    },
    remove(id) {
      return this.removeWhere((r) => r.id === id) > 0;
    },
    removeWhere(pred) {
      const s = load();
      const rows = s.rows.filter((r) => !pred(r));
      save({ ...s, rows });
      return s.rows.length - rows.length;
    },
    replaceAll(rows) {
      const maxId = rows.reduce((m, r) => Math.max(m, r.id), 0);
      save({ nextId: maxId + 1, rows });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run src/lib/localStore.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/localStore.ts src/lib/localStore.test.ts
git commit -m "feat: add localStorage collection primitive"
```

---

### Task 3: Notes and Kanban on localStorage

**Files:**
- Modify: `src/services/notes.ts`, `src/services/kanban.ts`
- Test: `src/services/notes.test.ts`, `src/services/kanban.test.ts`

**Interfaces:**
- Consumes: `createCollection`, `sqliteNow` from `src/lib/localStore.ts`.
- Produces (signatures unchanged): `fetchNotes(resolved?: boolean): Promise<Note[]>`, `createNote(note): Promise<Note>`, `updateNote(id, updates): Promise<Note>`, `deleteNote(id): Promise<void>`; `fetchKanbanItems(): Promise<KanbanItem[]>`, `upsertKanbanItem(item): Promise<KanbanItem>`, `batchUpdateKanbanItems(items): Promise<KanbanItem[]>`, `deleteKanbanItem(itemType, itemId): Promise<void>`. Also export `notesCollection` and `kanbanCollection` (used by Task 5 backup).

Behaviour to preserve (ported from `server/src/routes/notes.ts` and `kanban.ts`):
- Notes: valid types `free_text | jira_ticket | github_pr | link`; `reference_id` required for the last three; `remind_at` must be null/undefined or a non-empty parseable date string (move `isValidRemindAt` here and export it); order `pinned DESC, created_at DESC` (ties: higher id first); `resolved`/`pinned` stored as `0|1`; `updated_at` refreshed on update; update/delete of unknown id throws `Error("Note not found")`.
- Kanban: valid `item_type` `note|pr|review`; valid columns `todo|in_progress|on_hold|in_review|done`; upsert keyed by `(item_type, item_id)`; sort by `column_name` then `position` ascending; batch updates only existing rows; delete unknown throws `Error("Kanban item not found")`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/services/notes.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { createNote, deleteNote, fetchNotes, updateNote, isValidRemindAt } from "./notes";

describe("notes service (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("creates notes with defaults", async () => {
    const n = await createNote({ type: "free_text", content: "hi" });
    expect(n).toMatchObject({
      id: 1, type: "free_text", title: "", content: "hi", reference_id: null,
      resolved: 0, pinned: 0, remind_at: null,
    });
    expect(n.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("validates type, reference_id and remind_at", async () => {
    await expect(createNote({ type: "bogus" as any, content: "" })).rejects.toThrow(/type must be one of/);
    await expect(createNote({ type: "github_pr", content: "" })).rejects.toThrow(/reference_id is required/);
    await expect(createNote({ type: "free_text", content: "", remind_at: "nope" })).rejects.toThrow(/remind_at/);
    expect(isValidRemindAt(null)).toBe(true);
    expect(isValidRemindAt("")).toBe(false);
    expect(isValidRemindAt("2026-01-01T00:00:00Z")).toBe(true);
  });

  it("orders pinned first then newest, and filters by resolved", async () => {
    const a = await createNote({ type: "free_text", content: "a" });
    const b = await createNote({ type: "free_text", content: "b" });
    await createNote({ type: "free_text", content: "c" });
    await updateNote(a.id, { pinned: true });
    await updateNote(b.id, { resolved: true });
    expect((await fetchNotes()).map((n) => n.content)).toEqual(["a", "c", "b"]);
    expect((await fetchNotes(true)).map((n) => n.content)).toEqual(["b"]);
    expect((await fetchNotes(false)).map((n) => n.content)).toEqual(["a", "c"]);
  });

  it("updates and deletes; unknown id throws", async () => {
    const n = await createNote({ type: "free_text", content: "x" });
    const u = await updateNote(n.id, { title: "T", remind_at: null });
    expect(u.title).toBe("T");
    await deleteNote(n.id);
    expect(await fetchNotes()).toEqual([]);
    await expect(updateNote(n.id, { title: "y" })).rejects.toThrow("Note not found");
    await expect(deleteNote(n.id)).rejects.toThrow("Note not found");
  });
});
```

```ts
// src/services/kanban.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { batchUpdateKanbanItems, deleteKanbanItem, fetchKanbanItems, upsertKanbanItem } from "./kanban";

describe("kanban service (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("upserts by (item_type, item_id)", async () => {
    const a = await upsertKanbanItem({ item_type: "pr", item_id: "o/r#1", column_name: "todo", position: 0 });
    const b = await upsertKanbanItem({ item_type: "pr", item_id: "o/r#1", column_name: "done", position: 3 });
    expect(b.id).toBe(a.id);
    expect(await fetchKanbanItems()).toHaveLength(1);
    expect((await fetchKanbanItems())[0]).toMatchObject({ column_name: "done", position: 3 });
  });

  it("validates item_type, item_id and column", async () => {
    await expect(upsertKanbanItem({ item_type: "x", item_id: "1", column_name: "todo", position: 0 })).rejects.toThrow(/item_type/);
    await expect(upsertKanbanItem({ item_type: "pr", item_id: "", column_name: "todo", position: 0 })).rejects.toThrow(/item_id/);
    await expect(upsertKanbanItem({ item_type: "pr", item_id: "1", column_name: "nope", position: 0 })).rejects.toThrow(/column_name/);
  });

  it("sorts by column then position; batch updates existing rows only", async () => {
    await upsertKanbanItem({ item_type: "note", item_id: "1", column_name: "todo", position: 1 });
    await upsertKanbanItem({ item_type: "note", item_id: "2", column_name: "todo", position: 0 });
    await upsertKanbanItem({ item_type: "note", item_id: "3", column_name: "done", position: 0 });
    const items = await batchUpdateKanbanItems([
      { item_type: "note", item_id: "1", column_name: "done", position: 1 },
      { item_type: "note", item_id: "999", column_name: "done", position: 0 },
    ]);
    expect(items.map((i) => `${i.column_name}:${i.item_id}`)).toEqual(["done:3", "done:1", "todo:2"]);
  });

  it("deletes; unknown throws", async () => {
    await upsertKanbanItem({ item_type: "review", item_id: "a", column_name: "todo", position: 0 });
    await deleteKanbanItem("review", "a");
    expect(await fetchKanbanItems()).toEqual([]);
    await expect(deleteKanbanItem("review", "a")).rejects.toThrow("Kanban item not found");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn vitest run src/services/notes.test.ts src/services/kanban.test.ts`
Expected: FAIL (network/axios errors or missing `isValidRemindAt`).

- [ ] **Step 3: Implement**

```ts
// src/services/notes.ts
import { Note, NoteType } from "../types";
import { createCollection, sqliteNow } from "../lib/localStore";

export const notesCollection = createCollection<Note>("notes");

const VALID_TYPES: NoteType[] = ["free_text", "jira_ticket", "github_pr", "link"];

/**
 * Accepts null/undefined (no reminder) or a non-empty string that parses to a
 * date. Past dates are valid (overdue reminders are allowed).
 */
export function isValidRemindAt(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string" || value === "") return false;
  return !Number.isNaN(new Date(value).getTime());
}

export async function fetchNotes(resolved?: boolean): Promise<Note[]> {
  let notes = notesCollection.all();
  if (resolved !== undefined) {
    notes = notes.filter((n) => n.resolved === (resolved ? 1 : 0));
  }
  return [...notes].sort(
    (a, b) =>
      b.pinned - a.pinned || b.created_at.localeCompare(a.created_at) || b.id - a.id,
  );
}

export async function createNote(note: {
  type: NoteType;
  title?: string;
  content: string;
  reference_id?: string;
  remind_at?: string | null;
}): Promise<Note> {
  const { type, title, content, reference_id, remind_at } = note;
  if (!type || !VALID_TYPES.includes(type)) {
    throw new Error(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }
  if (type !== "free_text" && !reference_id) {
    throw new Error(`reference_id is required for type '${type}'`);
  }
  if (remind_at !== undefined && !isValidRemindAt(remind_at)) {
    throw new Error("remind_at must be a valid date or null");
  }
  const now = sqliteNow();
  return notesCollection.insert({
    type,
    title: title || "",
    content: content || "",
    reference_id: reference_id || null,
    resolved: 0,
    pinned: 0,
    remind_at: remind_at ?? null,
    created_at: now,
    updated_at: now,
  });
}

export async function updateNote(
  id: number,
  updates: {
    resolved?: boolean;
    pinned?: boolean;
    title?: string;
    content?: string;
    reference_id?: string;
    remind_at?: string | null;
  },
): Promise<Note> {
  if (!notesCollection.get(id)) throw new Error("Note not found");
  if (updates.remind_at !== undefined && !isValidRemindAt(updates.remind_at)) {
    throw new Error("remind_at must be a valid date or null");
  }
  const patch: Partial<Omit<Note, "id">> = { updated_at: sqliteNow() };
  if (updates.resolved !== undefined) patch.resolved = updates.resolved ? 1 : 0;
  if (updates.pinned !== undefined) patch.pinned = updates.pinned ? 1 : 0;
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.content !== undefined) patch.content = updates.content;
  if (updates.reference_id !== undefined) patch.reference_id = updates.reference_id;
  if (updates.remind_at !== undefined) patch.remind_at = updates.remind_at;
  return notesCollection.update(id, patch)!;
}

export async function deleteNote(id: number): Promise<void> {
  if (!notesCollection.remove(id)) throw new Error("Note not found");
}
```

```ts
// src/services/kanban.ts
import { KanbanItem } from "../types";
import { createCollection, sqliteNow } from "../lib/localStore";

export const kanbanCollection = createCollection<KanbanItem>("kanban_items");

const VALID_ITEM_TYPES = ["note", "pr", "review"];
const VALID_COLUMNS = ["todo", "in_progress", "on_hold", "in_review", "done"];

interface KanbanInput {
  item_type: string;
  item_id: string;
  column_name: string;
  position: number;
}

function sorted(items: KanbanItem[]): KanbanItem[] {
  return [...items].sort(
    (a, b) => a.column_name.localeCompare(b.column_name) || a.position - b.position,
  );
}

function find(itemType: string, itemId: string): KanbanItem | undefined {
  return kanbanCollection.all().find((i) => i.item_type === itemType && i.item_id === itemId);
}

export async function fetchKanbanItems(): Promise<KanbanItem[]> {
  return sorted(kanbanCollection.all());
}

export async function upsertKanbanItem(item: KanbanInput): Promise<KanbanItem> {
  const { item_type, item_id, column_name, position } = item;
  if (!item_type || !VALID_ITEM_TYPES.includes(item_type)) {
    throw new Error(`item_type must be one of: ${VALID_ITEM_TYPES.join(", ")}`);
  }
  if (!item_id) throw new Error("item_id is required");
  if (!column_name || !VALID_COLUMNS.includes(column_name)) {
    throw new Error(`column_name must be one of: ${VALID_COLUMNS.join(", ")}`);
  }
  const now = sqliteNow();
  const existing = find(item_type, item_id);
  const fields = {
    column_name: column_name as KanbanItem["column_name"],
    position: position ?? 0,
    updated_at: now,
  };
  if (existing) return kanbanCollection.update(existing.id, fields)!;
  return kanbanCollection.insert({
    item_type: item_type as KanbanItem["item_type"],
    item_id,
    created_at: now,
    ...fields,
  });
}

export async function batchUpdateKanbanItems(items: KanbanInput[]): Promise<KanbanItem[]> {
  const now = sqliteNow();
  for (const entry of items) {
    const existing = find(entry.item_type, entry.item_id);
    if (existing) {
      kanbanCollection.update(existing.id, {
        column_name: entry.column_name as KanbanItem["column_name"],
        position: entry.position ?? 0,
        updated_at: now,
      });
    }
  }
  return sorted(kanbanCollection.all());
}

export async function deleteKanbanItem(itemType: string, itemId: string): Promise<void> {
  const removed = kanbanCollection.removeWhere(
    (i) => i.item_type === itemType && i.item_id === itemId,
  );
  if (removed === 0) throw new Error("Kanban item not found");
}
```

Note: `batchUpdateKanbanItems` loads/saves per row; the board holds at most a few hundred rows so this is fine.

- [ ] **Step 4: Run tests**

Run: `yarn vitest run src/services/notes.test.ts src/services/kanban.test.ts && yarn test && yarn tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/notes.ts src/services/kanban.ts src/services/notes.test.ts src/services/kanban.test.ts
git commit -m "feat: store notes and kanban items in localStorage"
```

---

### Task 4: Saved filters, JQL filters and Focus state on localStorage

**Files:**
- Modify: `src/services/filters.ts`, `src/services/jiraFilters.ts` (only the four `*LocalJqlFilter*` functions; `fetchRemoteJiraFilters` and `searchJql` stay on `apiClient`), `src/services/focusApi.ts`
- Test: `src/services/filters.test.ts`, `src/services/jiraFilters.test.ts`, `src/services/focusApi.test.ts`

**Interfaces:**
- Consumes: `createCollection`, `readJson`, `writeJson`, `sqliteNow`.
- Produces (unchanged signatures) plus exports `savedFiltersCollection`, `jqlFiltersCollection`, `FOCUS_KEY = "focus_state"` for Task 5.

Behaviour to preserve (port from `server/src/routes/filters.ts`, `jiraFilters.ts`, `focus.ts` — read those files first for exact validation messages):
- Saved filters: `name` required (non-empty string, trimmed); `filter_config` object `{authors: string[], repos: string[]}`; list ordered `created_at DESC` (ties id DESC); update merges provided fields and bumps `updated_at`; unknown id throws `Error("Filter not found")`.
- JQL filters: `name` and `jql` required non-empty; list ordered `updated_at DESC` (ties id DESC); unknown id throws `Error("Filter not found")`.
- Focus: stored as `Record<itemId, { pinnedAt: number|null; snoozedUntil: number|null; dismissedAt: number|null; updatedAt: number }>` under `readJson(FOCUS_KEY, {})`. `fetchFocusState()` first garbage-collects entries with `updatedAt < now - 90 days`, no pin, no dismiss and no future snooze, then returns `FocusStateItem[]`. `setPin/ setSnooze/ setDismiss` upsert only their own field + `updatedAt`, validating like the server (`itemId` non-empty string; `pinned`/`dismissed` boolean; `until` finite number or null).

- [ ] **Step 1: Write failing tests**

```ts
// src/services/filters.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { createSavedFilter, deleteSavedFilter, fetchSavedFilters, updateSavedFilter } from "./filters";

describe("saved filters (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("creates, lists newest first, updates and deletes", async () => {
    const a = await createSavedFilter("A", { authors: ["x"], repos: [] });
    await createSavedFilter("B", { authors: [], repos: ["r"] });
    expect((await fetchSavedFilters()).map((f) => f.name)).toEqual(["B", "A"]);
    const u = await updateSavedFilter(a.id, { name: "A2" });
    expect(u).toMatchObject({ name: "A2", filter_config: { authors: ["x"], repos: [] } });
    await deleteSavedFilter(a.id);
    expect((await fetchSavedFilters()).map((f) => f.name)).toEqual(["B"]);
  });

  it("validates and reports unknown ids", async () => {
    await expect(createSavedFilter("  ", { authors: [], repos: [] })).rejects.toThrow();
    await expect(updateSavedFilter(42, { name: "x" })).rejects.toThrow("Filter not found");
    await expect(deleteSavedFilter(42)).rejects.toThrow("Filter not found");
  });
});
```

```ts
// src/services/jiraFilters.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalJqlFilter, deleteLocalJqlFilter, fetchLocalJqlFilters, updateLocalJqlFilter,
} from "./jiraFilters";

describe("local JQL filters", () => {
  beforeEach(() => localStorage.clear());

  it("CRUD ordered by updated_at desc", async () => {
    const a = await createLocalJqlFilter("Mine", "assignee = currentUser()");
    await createLocalJqlFilter("Bugs", "type = Bug");
    await updateLocalJqlFilter(a.id, { jql: "assignee = currentUser() AND status != Done" });
    const list = await fetchLocalJqlFilters();
    expect(list[0].name).toBe("Mine");
    await deleteLocalJqlFilter(a.id);
    expect((await fetchLocalJqlFilters()).map((f) => f.name)).toEqual(["Bugs"]);
  });

  it("requires name and jql", async () => {
    await expect(createLocalJqlFilter("", "x")).rejects.toThrow();
    await expect(createLocalJqlFilter("x", "")).rejects.toThrow();
  });
});
```

The ordering test depends on `updated_at` second resolution; to make it deterministic, use `vi.useFakeTimers()` + `vi.setSystemTime()` between calls:

```ts
import { vi } from "vitest";
// inside the CRUD test, before each create/update:
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-01-01T00:00:00Z")); // create A
vi.setSystemTime(new Date("2026-01-01T00:00:01Z")); // create B
vi.setSystemTime(new Date("2026-01-01T00:00:02Z")); // update A
// afterEach(() => vi.useRealTimers());
```

```ts
// src/services/focusApi.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFocusState, setDismiss, setPin, setSnooze } from "./focusApi";

const DAY = 24 * 60 * 60 * 1000;

describe("focus state (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("upserts pin, snooze and dismiss independently", async () => {
    await setPin("a", true);
    await setSnooze("a", Date.now() + DAY);
    await setDismiss("b", true);
    const items = await fetchFocusState();
    expect(items).toEqual(
      expect.arrayContaining([
        { itemId: "a", pinnedAt: Date.now(), snoozedUntil: Date.now() + DAY, dismissedAt: null },
        { itemId: "b", pinnedAt: null, snoozedUntil: null, dismissedAt: Date.now() },
      ]),
    );
    await setPin("a", false);
    expect((await fetchFocusState()).find((i) => i.itemId === "a")?.pinnedAt).toBeNull();
  });

  it("garbage-collects stale inactive rows after 90 days", async () => {
    await setSnooze("old", Date.now() + DAY);
    await setPin("kept", true);
    vi.setSystemTime(Date.now() + 91 * DAY);
    const ids = (await fetchFocusState()).map((i) => i.itemId);
    expect(ids).toEqual(["kept"]);
  });

  it("validates input", async () => {
    await expect(setPin("", true)).rejects.toThrow();
    await expect(setSnooze("a", Number.NaN)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn vitest run src/services/filters.test.ts src/services/jiraFilters.test.ts src/services/focusApi.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/services/filters.ts`:

```ts
import { createCollection, sqliteNow } from "../lib/localStore";

export interface SavedFilterData {
  id: number;
  name: string;
  filter_config: { authors: string[]; repos: string[] };
  created_at: string;
  updated_at: string;
}

type FilterConfig = SavedFilterData["filter_config"];

export const savedFiltersCollection = createCollection<SavedFilterData>("saved_filters");

function requireName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) throw new Error("name is required");
  return name.trim();
}

function requireConfig(config: unknown): FilterConfig {
  const c = config as FilterConfig;
  if (!c || !Array.isArray(c.authors) || !Array.isArray(c.repos)) {
    throw new Error("filter_config must include authors and repos arrays");
  }
  return { authors: c.authors, repos: c.repos };
}

export async function fetchSavedFilters(): Promise<SavedFilterData[]> {
  return [...savedFiltersCollection.all()].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id,
  );
}

export async function createSavedFilter(
  name: string,
  filter_config: FilterConfig,
): Promise<SavedFilterData> {
  const now = sqliteNow();
  return savedFiltersCollection.insert({
    name: requireName(name),
    filter_config: requireConfig(filter_config),
    created_at: now,
    updated_at: now,
  });
}

export async function updateSavedFilter(
  id: number,
  data: { name?: string; filter_config?: FilterConfig },
): Promise<SavedFilterData> {
  if (!savedFiltersCollection.get(id)) throw new Error("Filter not found");
  const patch: Partial<Omit<SavedFilterData, "id">> = { updated_at: sqliteNow() };
  if (data.name !== undefined) patch.name = requireName(data.name);
  if (data.filter_config !== undefined) patch.filter_config = requireConfig(data.filter_config);
  return savedFiltersCollection.update(id, patch)!;
}

export async function deleteSavedFilter(id: number): Promise<void> {
  if (!savedFiltersCollection.remove(id)) throw new Error("Filter not found");
}
```

`src/services/jiraFilters.ts` — keep the interfaces, `fetchRemoteJiraFilters`, `searchJql` and the `apiClient` import as they are; replace the four local functions:

```ts
import { createCollection, sqliteNow } from "../lib/localStore";

export const jqlFiltersCollection = createCollection<JqlFilter>("jira_jql_filters");

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

export async function fetchLocalJqlFilters(): Promise<JqlFilter[]> {
  return [...jqlFiltersCollection.all()].sort(
    (a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id,
  );
}

export async function createLocalJqlFilter(name: string, jql: string): Promise<JqlFilter> {
  const now = sqliteNow();
  return jqlFiltersCollection.insert({
    name: requireText(name, "name"),
    jql: requireText(jql, "jql"),
    created_at: now,
    updated_at: now,
  });
}

export async function updateLocalJqlFilter(
  id: number,
  updates: { name?: string; jql?: string },
): Promise<JqlFilter> {
  if (!jqlFiltersCollection.get(id)) throw new Error("Filter not found");
  const patch: Partial<Omit<JqlFilter, "id">> = { updated_at: sqliteNow() };
  if (updates.name !== undefined) patch.name = requireText(updates.name, "name");
  if (updates.jql !== undefined) patch.jql = requireText(updates.jql, "jql");
  return jqlFiltersCollection.update(id, patch)!;
}

export async function deleteLocalJqlFilter(id: number): Promise<void> {
  if (!jqlFiltersCollection.remove(id)) throw new Error("Filter not found");
}
```

`src/services/focusApi.ts`:

```ts
import { readJson, writeJson } from "../lib/localStore";

export interface FocusStateItem {
  itemId: string;
  pinnedAt: number | null;
  snoozedUntil: number | null;
  dismissedAt: number | null;
}

interface FocusRow {
  pinnedAt: number | null;
  snoozedUntil: number | null;
  dismissedAt: number | null;
  updatedAt: number;
}

export const FOCUS_KEY = "focus_state";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function load(): Record<string, FocusRow> {
  return readJson<Record<string, FocusRow>>(FOCUS_KEY, {});
}

function requireItemId(itemId: unknown): string {
  if (typeof itemId !== "string" || !itemId) throw new Error("itemId (string) required");
  return itemId;
}

function upsert(itemId: string, patch: Partial<FocusRow>): void {
  const rows = load();
  const prev = rows[itemId] ?? { pinnedAt: null, snoozedUntil: null, dismissedAt: null };
  rows[itemId] = { ...prev, ...patch, updatedAt: Date.now() };
  writeJson(FOCUS_KEY, rows);
}

/**
 * Returns all pin/snooze/dismiss rows, first dropping rows older than 90 days
 * with no active pin, no future snooze and no dismiss.
 */
export async function fetchFocusState(): Promise<FocusStateItem[]> {
  const now = Date.now();
  const cutoff = now - NINETY_DAYS_MS;
  const rows = load();
  for (const [id, r] of Object.entries(rows)) {
    const inactive =
      r.pinnedAt === null &&
      r.dismissedAt === null &&
      (r.snoozedUntil === null || r.snoozedUntil <= now);
    if (r.updatedAt < cutoff && inactive) delete rows[id];
  }
  writeJson(FOCUS_KEY, rows);
  return Object.entries(rows).map(([itemId, r]) => ({
    itemId,
    pinnedAt: r.pinnedAt,
    snoozedUntil: r.snoozedUntil,
    dismissedAt: r.dismissedAt,
  }));
}

export async function setPin(itemId: string, pinned: boolean): Promise<void> {
  requireItemId(itemId);
  if (typeof pinned !== "boolean") throw new Error("pinned (boolean) required");
  upsert(itemId, { pinnedAt: pinned ? Date.now() : null });
}

export async function setSnooze(itemId: string, until: number | null): Promise<void> {
  requireItemId(itemId);
  if (until !== null && (typeof until !== "number" || !Number.isFinite(until))) {
    throw new Error("until must be a finite number or null");
  }
  upsert(itemId, { snoozedUntil: until });
}

export async function setDismiss(itemId: string, dismissed: boolean): Promise<void> {
  requireItemId(itemId);
  if (typeof dismissed !== "boolean") throw new Error("dismissed (boolean) required");
  upsert(itemId, { dismissedAt: dismissed ? Date.now() : null });
}
```

Note the GC test: "old" was snoozed until day 1, now is day 91 → snooze expired, updatedAt older than 90 days → removed. "kept" is pinned → kept.

- [ ] **Step 4: Run tests**

Run: `yarn vitest run src/services && yarn test && yarn tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/filters.ts src/services/jiraFilters.ts src/services/focusApi.ts src/services/*.test.ts
git commit -m "feat: store saved filters, JQL filters and focus state in localStorage"
```

---

### Task 5: Backup export/import and desktop migration script

**Files:**
- Create: `src/lib/backup.ts`, `src/lib/backup.test.ts`, `src/views/settings/DataBackupCard.tsx`, `scripts/export-sqlite.mjs`
- Modify: `src/views/settings/SettingsView.tsx` (render `<DataBackupCard />` at the bottom — one import + one JSX line only)

**Interfaces:**
- Consumes: `DB_PREFIX` from `src/lib/localStore.ts`; settings key `dev-home-settings` (a JSON object; Task 6 owns its schema — this task only reads/writes the non-secret keys listed below and must tolerate the key being absent).
- Produces:
  - `export interface Backup { app: "dev-home"; version: 1; exportedAt: string; data: Record<string, unknown>; settings: Partial<Record<"jiraBaseUrl" | "jiraEmail" | "githubUsername" | "githubOrg" | "hiddenTabs", unknown>> }`
  - `export function createBackup(now?: Date): Backup`
  - `export function restoreBackup(input: unknown): void` — throws `Error("Not a Dev Home backup file")` on bad shape. Removes all existing `DB_PREFIX` keys, writes each `data[name]` to `DB_PREFIX + name`, and merges `settings` into `dev-home-settings` (keeping any existing tokens).
  - Script output shape identical to `createBackup()`, with `data` keys `notes`, `kanban_items`, `saved_filters`, `jira_jql_filters`, `teams`, `team_members` (each `{ nextId, rows }`), `focus_state` (map keyed by item id: `{pinnedAt, snoozedUntil, dismissedAt, updatedAt}`), `sprint_snapshots` (`Record<sprintId, Record<date, {doneCount,totalCount}>>`), and `settings: {}`.

- [ ] **Step 1: Write failing test**

```ts
// src/lib/backup.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { createBackup, restoreBackup } from "./backup";
import { DB_PREFIX } from "./localStore";

const SETTINGS = "dev-home-settings";

describe("backup", () => {
  beforeEach(() => localStorage.clear());

  it("exports data keys and non-secret settings only", () => {
    localStorage.setItem(DB_PREFIX + "notes", JSON.stringify({ nextId: 2, rows: [{ id: 1 }] }));
    localStorage.setItem("dev-home-active-tab", "prs");
    localStorage.setItem(
      SETTINGS,
      JSON.stringify({ githubUsername: "me", githubToken: "secret", jiraApiToken: "secret2", hiddenTabs: ["board"] }),
    );
    const b = createBackup(new Date("2026-09-30T00:00:00Z"));
    expect(b).toEqual({
      app: "dev-home",
      version: 1,
      exportedAt: "2026-09-30T00:00:00.000Z",
      data: { notes: { nextId: 2, rows: [{ id: 1 }] } },
      settings: { githubUsername: "me", hiddenTabs: ["board"] },
    });
    expect(JSON.stringify(b)).not.toContain("secret");
  });

  it("restores data, replaces old data keys and keeps tokens", () => {
    localStorage.setItem(DB_PREFIX + "stale", "1");
    localStorage.setItem(SETTINGS, JSON.stringify({ githubToken: "tok", githubUsername: "old" }));
    restoreBackup({
      app: "dev-home", version: 1, exportedAt: "x",
      data: { notes: { nextId: 1, rows: [] } },
      settings: { githubUsername: "new" },
    });
    expect(localStorage.getItem(DB_PREFIX + "stale")).toBeNull();
    expect(JSON.parse(localStorage.getItem(DB_PREFIX + "notes")!)).toEqual({ nextId: 1, rows: [] });
    expect(JSON.parse(localStorage.getItem(SETTINGS)!)).toEqual({ githubToken: "tok", githubUsername: "new" });
  });

  it("rejects foreign files", () => {
    expect(() => restoreBackup({ foo: 1 })).toThrow("Not a Dev Home backup file");
    expect(() => restoreBackup(null)).toThrow("Not a Dev Home backup file");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn vitest run src/lib/backup.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/lib/backup.ts`**

```ts
import { DB_PREFIX } from "./localStore";

const SETTINGS_KEY = "dev-home-settings";
const EXPORTABLE_SETTINGS = [
  "jiraBaseUrl",
  "jiraEmail",
  "githubUsername",
  "githubOrg",
  "hiddenTabs",
] as const;

type ExportableSetting = (typeof EXPORTABLE_SETTINGS)[number];

export interface Backup {
  app: "dev-home";
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
  settings: Partial<Record<ExportableSetting, unknown>>;
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function dataKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(DB_PREFIX)) keys.push(k);
  }
  return keys;
}

/** Snapshot of all local data plus non-secret settings. Tokens are never exported. */
export function createBackup(now: Date = new Date()): Backup {
  const data: Record<string, unknown> = {};
  for (const key of dataKeys()) {
    try {
      data[key.slice(DB_PREFIX.length)] = JSON.parse(localStorage.getItem(key)!);
    } catch {
      // Skip corrupt entries rather than failing the whole export.
    }
  }
  const all = readSettings();
  const settings: Backup["settings"] = {};
  for (const k of EXPORTABLE_SETTINGS) {
    if (all[k] !== undefined) settings[k] = all[k];
  }
  return { app: "dev-home", version: 1, exportedAt: now.toISOString(), data, settings };
}

function isBackup(input: unknown): input is Backup {
  const b = input as Backup;
  return (
    !!b && b.app === "dev-home" && b.version === 1 && typeof b.data === "object" && b.data !== null
  );
}

/** Replace all local data with the backup's; merge settings, keeping existing tokens. */
export function restoreBackup(input: unknown): void {
  if (!isBackup(input)) throw new Error("Not a Dev Home backup file");
  for (const key of dataKeys()) localStorage.removeItem(key);
  for (const [name, value] of Object.entries(input.data)) {
    localStorage.setItem(DB_PREFIX + name, JSON.stringify(value));
  }
  const merged = { ...readSettings() };
  for (const k of EXPORTABLE_SETTINGS) {
    if (input.settings?.[k] !== undefined) merged[k] = input.settings[k];
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
}
```

- [ ] **Step 4: Run test** — `yarn vitest run src/lib/backup.test.ts` → PASS.

- [ ] **Step 5: Implement `DataBackupCard.tsx`**

Follow the card markup used by neighbouring cards in `SettingsView.tsx` (read it first; reuse its CSS classes from `settings.css`). Behaviour:
- "Export data" button → `createBackup()`, download as `dev-home-backup-YYYY-MM-DD.json` via `Blob` + temporary `<a download>`.
- "Import data" button → hidden `<input type="file" accept="application/json">`; on change, read text, `JSON.parse`, `window.confirm("Replace all local Dev Home data with this backup?")`, `restoreBackup(...)`, then `window.location.reload()`. On error show the message.
- Success/failure feedback: follow the repo's existing toast pattern (success confirmations are fixed-position at the bottom, not inline alerts that shift layout). Errors may use the existing inline error style used elsewhere in Settings.
- Copy under the buttons: "Your data lives only in this browser. Tokens are not included in exports."

- [ ] **Step 6: Implement `scripts/export-sqlite.mjs`**

```js
#!/usr/bin/env node
// Convert a Dev Home desktop database (notes.db) into a web backup file.
// Usage: node scripts/export-sqlite.mjs <path/to/notes.db> [out.json]
// Requires the `sqlite3` CLI (preinstalled on macOS).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [dbPath, outPath = `dev-home-backup-${new Date().toISOString().slice(0, 10)}.json`] =
  process.argv.slice(2);
if (!dbPath) {
  console.error("Usage: node scripts/export-sqlite.mjs <path/to/notes.db> [out.json]");
  process.exit(1);
}

function query(sql) {
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" });
  return out.trim() ? JSON.parse(out) : [];
}

function tableExists(name) {
  return query(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).length > 0;
}

function collection(table) {
  const rows = tableExists(table) ? query(`SELECT * FROM ${table}`) : [];
  const nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  return { nextId, rows };
}

const data = {
  notes: collection("notes"),
  kanban_items: collection("kanban_items"),
  saved_filters: collection("saved_filters"),
  jira_jql_filters: collection("jira_jql_filters"),
  teams: collection("teams"),
  team_members: collection("team_members"),
};

// saved_filters.filter_config is stored as a JSON string in SQLite.
for (const row of data.saved_filters.rows) {
  try {
    row.filter_config = JSON.parse(row.filter_config);
  } catch {
    row.filter_config = { authors: [], repos: [] };
  }
}

data.focus_state = {};
if (tableExists("focus_state")) {
  for (const r of query("SELECT * FROM focus_state")) {
    data.focus_state[r.item_id] = {
      pinnedAt: r.pinned_at,
      snoozedUntil: r.snoozed_until,
      dismissedAt: r.dismissed_at ?? null,
      updatedAt: r.updated_at,
    };
  }
}

data.sprint_snapshots = {};
if (tableExists("sprint_snapshots")) {
  for (const r of query("SELECT * FROM sprint_snapshots")) {
    (data.sprint_snapshots[r.sprint_id] ??= {})[r.snapshot_date] = {
      doneCount: r.done_count,
      totalCount: r.total_count,
    };
  }
}

const backup = { app: "dev-home", version: 1, exportedAt: new Date().toISOString(), data, settings: {} };
writeFileSync(outPath, JSON.stringify(backup, null, 2));
console.log(`Wrote ${outPath}`);
```

Verify manually: `node scripts/export-sqlite.mjs data/notes.db /tmp/devhome-backup.json && head -c 400 /tmp/devhome-backup.json` → valid JSON with `"app": "dev-home"` and non-empty `kanban_items.rows`.

- [ ] **Step 7: Verify & commit**

Run: `yarn test && yarn lint && yarn tsc --noEmit -p tsconfig.json` → PASS.

```bash
git add src/lib/backup.ts src/lib/backup.test.ts src/views/settings/DataBackupCard.tsx src/views/settings/SettingsView.tsx scripts/export-sqlite.mjs
git commit -m "feat: add local data export/import and desktop sqlite migration script"
```

---

### Task 6: Per-request credentials (browser settings → headers → AsyncLocalStorage)

**Files:**
- Modify: `server/src/config.ts`, `server/src/index.ts`, `server/src/utils/errors.ts`, `src/services/config.ts`, `src/hooks/useConfig.ts`, `src/App.tsx` (hidden-tabs loading), `src/views/settings/SettingsView.tsx` (save flow; also reads hiddenTabs), `src/views/settings/BackendStatusCard.tsx` if it references removed functions, `src/views/settings/MenuItemsToggle.tsx` if it uses `window.electronAPI`
- Delete: `server/src/routes/config.ts`, `server/src/standalone.ts` if it only exists for env-based startup (check first; keep if still used by `yarn --cwd server dev`)
- Test: `server/src/config.test.ts`, `src/services/config.test.ts`

**Interfaces:**
- Produces (server):
  - `export interface ServerConfig { jiraBaseUrl: string; jiraEmail: string; jiraApiToken: string; githubToken: string; githubUsername: string; githubOrg: string }` (no `port`)
  - `export const CONFIG_HEADERS: Record<keyof ServerConfig, string>` with the exact header names from Global Constraints
  - `export function configFromHeaders(get: (name: string) => string | null | undefined): ServerConfig | null` — returns null if any required field (all except `githubOrg`) is missing/blank; strips trailing `/` from `jiraBaseUrl`
  - `export function runWithConfig<T>(config: ServerConfig | null, fn: () => T): T`
  - `export function getConfig(): ServerConfig` — throws `MissingConfigError` (has `status = 401`, message `"Missing credentials: configure Dev Home in Settings"`) when no config in context
  - `export class MissingConfigError extends Error { status = 401 }`
- Produces (client):
  - `export interface AppSettings { jiraBaseUrl: string; jiraEmail: string; jiraApiToken: string; githubToken: string; githubUsername: string; githubOrg: string; hiddenTabs: string[] }`
  - `export const SETTINGS_KEY = "dev-home-settings"`
  - `export function loadSettings(): AppSettings` (defaults for missing fields)
  - `export function saveSettings(settings: AppSettings): void` (also dispatches `window.dispatchEvent(new Event("dev-home-settings"))`)
  - `export function isConfigured(s: AppSettings): boolean`
  - `export function credentialHeaders(s: AppSettings): Record<string, string>`
  - `export const apiClient` (axios) with a request interceptor that merges `credentialHeaders(loadSettings())`
  - `useConfig()` keeps its current return shape.

- [ ] **Step 1: Write failing server test**

```ts
// server/src/config.test.ts
import { describe, expect, it } from "vitest";
import { CONFIG_HEADERS, configFromHeaders, getConfig, MissingConfigError, runWithConfig } from "./config";

const headers: Record<string, string> = {
  "x-jira-base-url": "https://acme.atlassian.net/",
  "x-jira-email": "me@acme.com",
  "x-jira-api-token": "jt",
  "x-github-token": "gt",
  "x-github-username": "me",
};
const get = (h: Record<string, string>) => (n: string) => h[n];

describe("per-request config", () => {
  it("uses the documented header names", () => {
    expect(CONFIG_HEADERS).toEqual({
      jiraBaseUrl: "x-jira-base-url",
      jiraEmail: "x-jira-email",
      jiraApiToken: "x-jira-api-token",
      githubToken: "x-github-token",
      githubUsername: "x-github-username",
      githubOrg: "x-github-org",
    });
  });

  it("parses headers, trims base url, org optional", () => {
    expect(configFromHeaders(get(headers))).toEqual({
      jiraBaseUrl: "https://acme.atlassian.net",
      jiraEmail: "me@acme.com",
      jiraApiToken: "jt",
      githubToken: "gt",
      githubUsername: "me",
      githubOrg: "",
    });
  });

  it("returns null when a required header is missing", () => {
    const { ["x-github-token"]: _, ...rest } = headers;
    expect(configFromHeaders(get(rest))).toBeNull();
  });

  it("isolates concurrent requests", async () => {
    const a = configFromHeaders(get(headers))!;
    const b = { ...a, githubUsername: "other" };
    const seen = await Promise.all([
      runWithConfig(a, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getConfig().githubUsername;
      }),
      runWithConfig(b, async () => getConfig().githubUsername),
    ]);
    expect(seen).toEqual(["me", "other"]);
  });

  it("throws 401 outside a request context", () => {
    expect(() => getConfig()).toThrow(MissingConfigError);
    try {
      getConfig();
    } catch (e: any) {
      expect(e.status).toBe(401);
    }
  });
});
```

- [ ] **Step 2: Run** — `yarn --cwd server vitest run src/config.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/src/config.ts`** (replace file)

```ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface ServerConfig {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  githubOrg: string;
}

/** Credentials arrive on every request from the browser; nothing is stored server-side. */
export const CONFIG_HEADERS: Record<keyof ServerConfig, string> = {
  jiraBaseUrl: "x-jira-base-url",
  jiraEmail: "x-jira-email",
  jiraApiToken: "x-jira-api-token",
  githubToken: "x-github-token",
  githubUsername: "x-github-username",
  githubOrg: "x-github-org",
};

const REQUIRED: (keyof ServerConfig)[] = [
  "jiraBaseUrl",
  "jiraEmail",
  "jiraApiToken",
  "githubToken",
  "githubUsername",
];

export class MissingConfigError extends Error {
  status = 401;
  constructor() {
    super("Missing credentials: configure Dev Home in Settings");
  }
}

const requestConfig = new AsyncLocalStorage<ServerConfig | null>();

export function configFromHeaders(
  get: (name: string) => string | null | undefined,
): ServerConfig | null {
  const read = (k: keyof ServerConfig) => (get(CONFIG_HEADERS[k]) ?? "").trim();
  if (REQUIRED.some((k) => !read(k))) return null;
  return {
    jiraBaseUrl: read("jiraBaseUrl").replace(/\/+$/, ""),
    jiraEmail: read("jiraEmail"),
    jiraApiToken: read("jiraApiToken"),
    githubToken: read("githubToken"),
    githubUsername: read("githubUsername"),
    githubOrg: read("githubOrg"),
  };
}

export function runWithConfig<T>(config: ServerConfig | null, fn: () => T): T {
  return requestConfig.run(config, fn);
}

/** The calling request's credentials. Throws a 401 error if none were sent. */
export function getConfig(): ServerConfig {
  const config = requestConfig.getStore();
  if (!config) throw new MissingConfigError();
  return config;
}
```

Then fix all compile errors: callers of `isConfigured`, `validateEnv`, `setRuntimeConfig`, `config.port` (`server/src/index.ts` `startServer` uses `process.env.VITE_API_PORT` directly — keep that; drop the `validateEnv` warning). In `utils/errors.ts`, use `err.status ?? err.response?.status ?? 500` so `MissingConfigError` returns 401 with its message (status < 500, so message passes through).

- [ ] **Step 4: Express middleware** (interim until Task 10) in `server/src/index.ts`, after `express.json()`:

```ts
// Bind the caller's credentials (sent as headers) to this request's async context.
app.use((req, _res, next) => {
  runWithConfig(configFromHeaders((name) => req.header(name)), next);
});
```

Remove the `/api/config` route registration and delete `server/src/routes/config.ts`. Add the credential headers to CORS `allowedHeaders` if CORS is configured with an explicit list (it isn't today — default reflects requested headers; leave as is).

- [ ] **Step 5: Run server tests** — `yarn --cwd server test && (cd server && npx tsc --noEmit -p tsconfig.json)` → PASS. Fix any route test that relied on env vars by wrapping in `runWithConfig`.

- [ ] **Step 6: Write failing client test**

```ts
// src/services/config.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { apiClient, credentialHeaders, isConfigured, loadSettings, saveSettings } from "./config";

const full = {
  jiraBaseUrl: "https://acme.atlassian.net",
  jiraEmail: "me@acme.com",
  jiraApiToken: "jt",
  githubToken: "gt",
  githubUsername: "me",
  githubOrg: "",
  hiddenTabs: ["board"],
};

describe("browser settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults when nothing stored and round-trips", () => {
    expect(loadSettings()).toEqual({
      jiraBaseUrl: "", jiraEmail: "", jiraApiToken: "", githubToken: "",
      githubUsername: "", githubOrg: "", hiddenTabs: [],
    });
    saveSettings(full);
    expect(loadSettings()).toEqual(full);
    expect(isConfigured(full)).toBe(true);
    expect(isConfigured({ ...full, githubToken: "" })).toBe(false);
  });

  it("builds credential headers, omitting empty org", () => {
    expect(credentialHeaders(full)).toEqual({
      "x-jira-base-url": "https://acme.atlassian.net",
      "x-jira-email": "me@acme.com",
      "x-jira-api-token": "jt",
      "x-github-token": "gt",
      "x-github-username": "me",
    });
  });

  it("apiClient attaches headers from current settings", async () => {
    saveSettings(full);
    let captured: Record<string, unknown> = {};
    await apiClient.get("/health", {
      adapter: async (cfg) => {
        captured = Object.fromEntries(Object.entries(cfg.headers ?? {}));
        return { data: {}, status: 200, statusText: "OK", headers: {}, config: cfg };
      },
    });
    expect(captured["x-github-token"]).toBe("gt");
  });
});
```

- [ ] **Step 7: Implement `src/services/config.ts`** (replace file)

```ts
import axios from "axios";

export interface AppSettings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  githubOrg: string;
  /** Sidebar tab keys the user has hidden. Summary is never included. */
  hiddenTabs: string[];
}

export const SETTINGS_KEY = "dev-home-settings";
export const SETTINGS_EVENT = "dev-home-settings";

const DEFAULT_SETTINGS: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  githubToken: "",
  githubUsername: "",
  githubOrg: "",
  hiddenTabs: [],
};

export function loadSettings(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

export function isConfigured(s: AppSettings): boolean {
  return !!(s.jiraBaseUrl && s.jiraEmail && s.jiraApiToken && s.githubToken && s.githubUsername);
}

/** Credentials travel with each request; the server keeps nothing. */
export function credentialHeaders(s: AppSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "x-jira-base-url": s.jiraBaseUrl.replace(/\/+$/, ""),
    "x-jira-email": s.jiraEmail,
    "x-jira-api-token": s.jiraApiToken,
    "x-github-token": s.githubToken,
    "x-github-username": s.githubUsername,
  };
  if (s.githubOrg) headers["x-github-org"] = s.githubOrg;
  return headers;
}

const API_PORT = import.meta.env.VITE_API_PORT || "3571";
export const API_BASE = `http://localhost:${API_PORT}/api`;

export const apiClient = axios.create({ baseURL: API_BASE });

apiClient.interceptors.request.use((cfg) => {
  cfg.headers.set(credentialHeaders(loadSettings()));
  return cfg;
});

export async function checkBackendHealth(): Promise<{ online: boolean; version: string }> {
  try {
    const { data } = await apiClient.get("/health");
    return { online: data.status === "ok", version: data.version || "" };
  } catch {
    return { online: false, version: "" };
  }
}
```

(`API_BASE` becomes `"/api"` in Task 9. Keep the `window.electronAPI` global declaration only if `FindInPage.tsx` still compiles against it; move the declaration into `FindInPage.tsx`'s module scope or `vite-env.d.ts` — Task 9 deletes both.)

- [ ] **Step 8: Rewrite `useConfig`** keeping its return shape:

```ts
import { useState, useEffect, useCallback } from "react";
import {
  checkBackendHealth,
  isConfigured,
  loadSettings,
  saveSettings as persistSettings,
  SETTINGS_EVENT,
  AppSettings,
} from "../services/config";

interface UseConfigReturn {
  configured: boolean;
  loading: boolean;
  backendOnline: boolean;
  backendVersion: string;
  jiraBaseUrl: string;
  githubUsername: string;
  githubOrg: string;
  saveSettings: (settings: AppSettings) => Promise<void>;
  refreshConfig: () => void;
}

export function useConfig(): UseConfigReturn {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [loading, setLoading] = useState<boolean>(true);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [backendVersion, setBackendVersion] = useState<string>("");

  const init = useCallback(async () => {
    setLoading(true);
    setSettings(loadSettings());
    const health = await checkBackendHealth();
    setBackendOnline(health.online);
    setBackendVersion(health.version);
    setLoading(false);
  }, []);

  useEffect(() => {
    init();
    const onChange = () => setSettings(loadSettings());
    window.addEventListener(SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(SETTINGS_EVENT, onChange);
  }, [init]);

  const saveSettings = useCallback(async (next: AppSettings) => {
    persistSettings(next);
    setSettings(next);
  }, []);

  return {
    configured: isConfigured(settings),
    loading,
    backendOnline,
    backendVersion,
    jiraBaseUrl: settings.jiraBaseUrl.replace(/\/+$/, ""),
    githubUsername: settings.githubUsername,
    githubOrg: settings.githubOrg,
    saveSettings,
    refreshConfig: init,
  };
}
```

- [ ] **Step 9: Update consumers**

- `src/App.tsx`: replace the `window.electronAPI?.getSettings()` effect with state initialised from `loadSettings().hiddenTabs` and updated on `SETTINGS_EVENT`.
- `SettingsView.tsx` / `MenuItemsToggle.tsx`: load initial form values from `loadSettings()` instead of `loadSettingsFromStore()`/`window.electronAPI`; save via the `saveSettings` prop/hook; hidden-tab toggles call `saveSettings({ ...loadSettings(), hiddenTabs })`.
- Grep for removed exports and fix: `grep -rn "loadSettingsFromStore\|saveSettingsToStore\|saveSettingsToBackend\|fetchBackendConfig\|initApiPort\|getSettings()" src`. Expected after fix: no hits.
- Add to Settings, next to the token fields, one line of copy: "Stored only in this browser and sent with each request. The server never saves them."
- `electron/main.ts`: leave compiling; it's deleted in Task 9.

- [ ] **Step 10: Verify & commit**

Run: `yarn test && yarn --cwd server test && yarn tsc --noEmit -p tsconfig.json && (cd server && npx tsc --noEmit -p tsconfig.json) && yarn lint`
Expected: PASS.

```bash
git add -A
git commit -m "feat: send credentials per request from browser settings; drop server-side config"
```

---

### Task 7: Teams in localStorage and stateless team dashboard

**Files:**
- Create: `shared/burnup.ts`, `shared/burnup.test.ts`, `src/services/snapshots.ts`, `src/services/snapshots.test.ts`, `src/services/teams.test.ts`
- Modify: `src/services/teams.ts`, `src/types/teams.ts` (add `snapshot` to `TeamDashboard`), `server/src/routes/teams.ts`, `server/src/services/dashboard/snapshots.ts` (keep only re-exports or delete; `snapshots.test.ts` moves to `shared/burnup.test.ts`)
- Modify callers if needed: `src/hooks/useTeams.ts`, `src/hooks/useTeamDashboard.ts`

**Interfaces:**
- Consumes: `createCollection`, `readJson`, `writeJson`, `sqliteNow` (Task 2).
- Produces:
  - `shared/burnup.ts`: `export interface SnapshotRow { date: string; doneCount: number; totalCount: number }`, `export interface BurnupPoint extends SnapshotRow { ideal: number }`, `export interface Burnup { trackingSince: string | null; points: BurnupPoint[] }`, `export function buildIdealLine(rows: SnapshotRow[]): BurnupPoint[]` (moved verbatim from server), `export function buildBurnup(rows: SnapshotRow[]): Burnup` (rows sorted by date; empty → `{trackingSince: null, points: []}`).
  - `src/services/snapshots.ts`: `export const SNAPSHOTS_KEY = "sprint_snapshots"`, `export function recordSnapshot(s: { sprintId: number; date: string; doneCount: number; totalCount: number }): void`, `export function getSnapshotRows(sprintId: number): SnapshotRow[]` (date-sorted).
  - `src/services/teams.ts`: all existing exports keep signatures. `fetchTeamDashboard(teamId, sprintId)` now: loads team + members locally (throws `Error("team not found")` if missing), `POST /teams/dashboard` with body `{ team: { id, name, jira_board_id, jira_board_name }, members: [{ accountId, displayName, githubUsername }], sprintId: sprintId ?? null }`, then if `data.snapshot` → `recordSnapshot(data.snapshot)` and sets `data.burnup = buildBurnup(getSnapshotRows(data.snapshot.sprintId))`. Exports `teamsCollection`, `teamMembersCollection`.
  - Server: `POST /api/teams/dashboard` (body above) returns the same payload as the old `GET /:id/dashboard` but `burnup` is always `{ trackingSince: null, points: [] }` and adds `snapshot: { sprintId, date, doneCount, totalCount } | null` (non-null when `currentSprint`).
  - Removed server routes: `GET/POST /api/teams`, `PUT/DELETE /api/teams/:id`, `GET/POST /api/teams/:id/members`, `DELETE /api/teams/:teamId/members/:memberId`, `GET /api/teams/:id/dashboard`.

Local team rules (ported from server): `name` required, trimmed; `boardId`/`boardName` default null; `fetchTeams` sorts by name case-insensitively and adds `member_count` and `members: [{name}]` sorted case-insensitively; `deleteTeam` also deletes its members; `addTeamMember` requires `displayName`, `jiraAccountId`, `githubUsername`; `fetchTeamMembers` sorted by `display_name` case-insensitively; stored rows keep `created_at`/`updated_at` (teams) and `created_at` (members) via `sqliteNow()` — extend the stored row type locally (`Team & { created_at; updated_at }`) without changing the public `Team` type.

- [ ] **Step 1: Move burn-up math with tests**

Move `buildIdealLine` from `server/src/services/dashboard/snapshots.ts` to `shared/burnup.ts` unchanged, add `buildBurnup`:

```ts
export function buildBurnup(rows: SnapshotRow[]): Burnup {
  if (rows.length === 0) return { trackingSince: null, points: [] };
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return { trackingSince: sorted[0].date, points: buildIdealLine(sorted) };
}
```

Port the `buildIdealLine` cases from `server/src/services/dashboard/snapshots.test.ts` into `shared/burnup.test.ts` (drop DB-backed cases), and add:

```ts
it("buildBurnup sorts rows and reports trackingSince", () => {
  const b = buildBurnup([
    { date: "2026-09-02", doneCount: 2, totalCount: 10 },
    { date: "2026-09-01", doneCount: 0, totalCount: 10 },
  ]);
  expect(b.trackingSince).toBe("2026-09-01");
  expect(b.points.map((p) => p.ideal)).toEqual([0, 10]);
});

it("buildBurnup handles no rows", () => {
  expect(buildBurnup([])).toEqual({ trackingSince: null, points: [] });
});
```

Delete `server/src/services/dashboard/snapshots.ts` and its test. If `server/src/services/dashboard/types.ts` declares `Burnup`/`BurnupPoint`, keep those types (used by the response type).

Run: `yarn vitest run shared/burnup.test.ts` → PASS.

- [ ] **Step 2: Snapshot store (test first)**

```ts
// src/services/snapshots.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { getSnapshotRows, recordSnapshot } from "./snapshots";

describe("sprint snapshots", () => {
  beforeEach(() => localStorage.clear());

  it("upserts one row per sprint per day, sorted by date", () => {
    recordSnapshot({ sprintId: 7, date: "2026-09-02", doneCount: 1, totalCount: 5 });
    recordSnapshot({ sprintId: 7, date: "2026-09-01", doneCount: 0, totalCount: 5 });
    recordSnapshot({ sprintId: 7, date: "2026-09-02", doneCount: 3, totalCount: 6 });
    recordSnapshot({ sprintId: 8, date: "2026-09-02", doneCount: 9, totalCount: 9 });
    expect(getSnapshotRows(7)).toEqual([
      { date: "2026-09-01", doneCount: 0, totalCount: 5 },
      { date: "2026-09-02", doneCount: 3, totalCount: 6 },
    ]);
  });
});
```

```ts
// src/services/snapshots.ts
import { readJson, writeJson } from "../lib/localStore";
import type { SnapshotRow } from "../../shared/burnup";

type SnapshotStore = Record<string, Record<string, { doneCount: number; totalCount: number }>>;

export const SNAPSHOTS_KEY = "sprint_snapshots";

/** Upsert today's sprint completion. One entry per sprint per day. */
export function recordSnapshot(s: {
  sprintId: number;
  date: string;
  doneCount: number;
  totalCount: number;
}): void {
  const store = readJson<SnapshotStore>(SNAPSHOTS_KEY, {});
  store[s.sprintId] = {
    ...store[s.sprintId],
    [s.date]: { doneCount: s.doneCount, totalCount: s.totalCount },
  };
  writeJson(SNAPSHOTS_KEY, store);
}

export function getSnapshotRows(sprintId: number): SnapshotRow[] {
  const bySprint = readJson<SnapshotStore>(SNAPSHOTS_KEY, {})[sprintId] ?? {};
  return Object.entries(bySprint)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

Run test → PASS. Check how `shared/` is imported elsewhere in `src/` (e.g. `src/utils/tickets.ts` imports `shared/tickets`) and follow the same import style.

- [ ] **Step 3: Teams service tests (write first)**

```ts
// src/services/teams.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addTeamMember, createTeam, deleteTeam, fetchTeamDashboard, fetchTeamMembers, fetchTeams,
  removeTeamMember, updateTeam,
} from "./teams";
import { apiClient } from "./config";

describe("teams (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("creates/updates/lists teams with member summary", async () => {
    const t = await createTeam({ name: " Zeta ", boardId: 5, boardName: "Board" });
    await createTeam({ name: "alpha" });
    await addTeamMember(t.id, { displayName: "bob", jiraAccountId: "j1", githubUsername: "b" });
    await addTeamMember(t.id, { displayName: "Alice", jiraAccountId: "j2", githubUsername: "a" });
    const teams = await fetchTeams();
    expect(teams.map((x) => x.name)).toEqual(["alpha", "Zeta"]);
    expect(teams[1]).toMatchObject({
      jira_board_id: 5, jira_board_name: "Board", member_count: 2,
      members: [{ name: "Alice" }, { name: "bob" }],
    });
    const u = await updateTeam(t.id, { boardId: null });
    expect(u).toMatchObject({ name: "Zeta", jira_board_id: null, jira_board_name: "Board" });
  });

  it("validates and cascades deletes", async () => {
    await expect(createTeam({ name: "" })).rejects.toThrow("name is required");
    const t = await createTeam({ name: "T" });
    await expect(addTeamMember(t.id, { displayName: "x", jiraAccountId: "", githubUsername: "g" })).rejects.toThrow();
    const m = await addTeamMember(t.id, { displayName: "x", jiraAccountId: "j", githubUsername: "g" });
    await removeTeamMember(t.id, m.id);
    expect(await fetchTeamMembers(t.id)).toEqual([]);
    await addTeamMember(t.id, { displayName: "y", jiraAccountId: "j", githubUsername: "g" });
    await deleteTeam(t.id);
    expect(await fetchTeams()).toEqual([]);
    expect(await fetchTeamMembers(t.id)).toEqual([]);
  });

  it("posts roster to the stateless dashboard and records the snapshot", async () => {
    const t = await createTeam({ name: "T", boardId: 3, boardName: "B" });
    await addTeamMember(t.id, { displayName: "A", jiraAccountId: "j", githubUsername: "a" });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: {
        burnup: { trackingSince: null, points: [] },
        snapshot: { sprintId: 11, date: "2026-09-30", doneCount: 2, totalCount: 8 },
      },
    } as any);
    const d = await fetchTeamDashboard(t.id, 11);
    expect(post).toHaveBeenCalledWith("/teams/dashboard", {
      team: { id: t.id, name: "T", jira_board_id: 3, jira_board_name: "B" },
      members: [{ accountId: "j", displayName: "A", githubUsername: "a" }],
      sprintId: 11,
    });
    expect(d.burnup.trackingSince).toBe("2026-09-30");
    expect(d.burnup.points).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Implement the local team CRUD + new `fetchTeamDashboard`** in `src/services/teams.ts` per the rules above (keep `searchJiraUsers`, `searchJiraBoards`, `fetchBoardSprints` on `apiClient`). Run `yarn vitest run src/services/teams.test.ts` → PASS.

- [ ] **Step 5: Server — make the dashboard stateless**

In `server/src/routes/teams.ts`:
- Delete every CRUD route and the `getDb` import.
- Replace `router.get("/:id/dashboard", ...)` with `router.post("/dashboard", ...)`. Read `team`, `members`, `sprintId` from `req.body`; validate `team` is an object with numeric `id` and string `name`, `members` is an array (400 `{ error: "team and members are required" }` otherwise). Build `roster` from `members` (`accountId`, `displayName`, `githubUsername`). Use `team.jira_board_id` exactly where the old code used the DB row. Everything else in the handler stays the same.
- Replace the burn-up block with:

```ts
  // Burn-up history lives in the browser; hand back today's point to record.
  const snapshot = currentSprint
    ? {
        sprintId: currentSprint.id,
        date: now.toISOString().slice(0, 10),
        doneCount: pace.doneCount,
        totalCount: pace.totalCount,
      }
    : null;
  const burnup: Burnup = { trackingSince: null, points: [] };
```

  and add `snapshot` to the JSON response.
- Update `server/src/routes/teams.test.ts` to drop DB-backed CRUD cases; keep/adjust any pure helper tests.

Add `snapshot?: { sprintId: number; date: string; doneCount: number; totalCount: number } | null` to `TeamDashboard` in `src/types/teams.ts`.

- [ ] **Step 6: Verify & commit**

Run: `yarn test && yarn --cwd server test && yarn tsc --noEmit -p tsconfig.json && (cd server && npx tsc --noEmit -p tsconfig.json) && yarn lint`
Expected: PASS.

```bash
git add -A
git commit -m "feat: keep teams and burn-up history in the browser; stateless team dashboard"
```

---

### Task 8: Delete server persistence

Runs after both wave-2 tracks are merged into `web-nextjs`.

**Files:**
- Delete: `server/src/db.ts`, `server/src/db.test.ts`, `server/src/routes/notes.ts`, `server/src/routes/notes.test.ts`, `server/src/routes/kanban.ts`, `server/src/routes/filters.ts`, `server/src/routes/focus.ts`, `data/` (untracked dev DB — **do not delete**; it's gitignored user data. Only remove code references.)
- Modify: `server/src/routes/jiraFilters.ts` (keep only `GET /remote` and `POST /search`), `server/src/index.ts` (unregister deleted routers, remove `closeDb` + SIGTERM/SIGINT handlers), `server/package.json` + root `package.json` (remove `better-sqlite3`, `@types/better-sqlite3`, `--external:better-sqlite3`, `asarUnpack`), `electron/main.ts` (remove `DEV_HOME_DB_PATH`)

- [ ] **Step 1:** Delete files/routes as listed.
- [ ] **Step 2:** Verify nothing references the DB: `grep -rn "getDb\|better-sqlite3\|closeDb\|DEV_HOME_DB_PATH" server src electron package.json` → no hits (lockfiles excepted until install).
- [ ] **Step 3:** Verify the frontend no longer calls removed endpoints: `grep -rnE "\"/(notes|kanban|filters|focus)|/jira-filters\"|/jira-filters/\\$\\{|/teams\"|/teams/\\$\\{" src/services` → no hits.
- [ ] **Step 4:** `yarn install && yarn --cwd server install && yarn test && yarn --cwd server test && yarn tsc --noEmit -p tsconfig.json && (cd server && npx tsc --noEmit -p tsconfig.json)` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "chore: remove SQLite and all server-side persistence"` (include lockfiles).

---

### Task 9: Next.js app shell; remove Vite and Electron

**Files:**
- Create: `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/ClientApp.tsx`, `next-env.d.ts` (generated), `vitest.config.ts` (rewrite with projects)
- Modify: root `package.json` (scripts, deps), `tsconfig.json`, `src/services/config.ts` (`API_BASE = "/api"`), `src/hooks/useUpdateCheck.ts` / `src/components/UpdateBanner.tsx` (delete) and their usage in `App.tsx`, `src/components/FindInPage.tsx` (delete) and usage, `src/vite-env.d.ts` (delete), `.gitignore` (`.next/`, `out/`), `eslint.config.js` (add `app/` to linted paths if it enumerates dirs), `.github/workflows/release.yml` (delete — desktop release pipeline), `.env.example` (remove, or reduce to nothing needed)
- Delete: `electron/`, `vite.config.ts`, `index.html`, `src/main.tsx`, `tsconfig.node.json`, `build/` icons script if Electron-only (`scripts/generate-icons.sh`), electron-builder `build` block in `package.json`, `server/src/standalone.ts` if present
- Test: existing suites

**Interfaces:**
- Produces: `yarn dev` → `next dev`; `yarn build` → `next build`; `yarn start` → `next start`; `yarn test` runs both Vitest projects; `NEXT_PUBLIC_APP_VERSION` replaces `__APP_VERSION__`.
- API routes don't exist yet after this task (Task 10); the UI will render but data calls 404 — acceptable intermediate state, noted in the commit message.

- [ ] **Step 1: Dependencies**

```bash
yarn add next@^15 react@^18.3.1 react-dom@^18.3.1
yarn remove electron electron-builder electron-store vite vite-plugin-electron vite-plugin-electron-renderer get-port concurrently cors express express-async-errors @types/cors @types/express tsc
```

Move runtime UI deps currently under `devDependencies` (`react`, `react-dom`, `react-bootstrap`, `bootstrap`, `@optiaxiom/react`, `@tabler/icons-react`, `@tanstack/react-table`, `@tanstack/table-core`, `react-markdown`, `react-is`) into `dependencies`. Keep `@vitejs/plugin-react` and `vitest` as devDeps (Vitest still uses the plugin). Merge `server/package.json` runtime deps (`axios`, `dotenv` only if still used — likely not) into root; `server/package.json`, `server/yarn.lock`, `server/tsconfig.json`, `server/eslint.config.js`, `server/vitest.config.ts` are removed in Task 10 once the server code is compiled by Next.

Scripts:

```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"lint": "eslint src/ app/ server/src/",
"lint:fix": "eslint src/ app/ server/src/ --fix",
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit"
```

Remove `pack`, `dist*`, `icons`, `build:server`, `lint:server*`, `lint:all`, `fix:all`, `test:all`, `ghtag`, `tag:push` scripts and the `main` field. Keep `bump`, `prepare`, `lint-staged` (update lint-staged globs to `{src,app,server/src}/**/*.{ts,tsx}` with the root eslint config).

- [ ] **Step 2: `next.config.ts`**

```ts
import type { NextConfig } from "next";
import pkg from "./package.json";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```

(`'unsafe-inline'` for scripts is required by Next's inline bootstrap without nonces; revisit with nonce middleware later.)

- [ ] **Step 3: App shell**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "../src/index.css";

export const metadata: Metadata = {
  title: "Dev Home",
  description: "Developer Home Dashboard - JIRA & GitHub integration",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// app/ClientApp.tsx
"use client";

import dynamic from "next/dynamic";

// The app reads localStorage during its first render, so it only runs in the browser.
const App = dynamic(() => import("../src/App"), { ssr: false });

export default function ClientApp() {
  return <App />;
}
```

```tsx
// app/page.tsx
import ClientApp from "./ClientApp";

export default function Page() {
  return <ClientApp />;
}
```

Copy any `<head>` content from `index.html` (fonts, theme bootstrap script that prevents a light/dark flash) into `layout.tsx`; an inline theme script must be placed in `<head>` via `<script dangerouslySetInnerHTML>` and stays compatible with the CSP above. The React.StrictMode wrapper from `main.tsx` is enabled by Next by default (`reactStrictMode` defaults true in App Router) — no action.

- [ ] **Step 4: Source adjustments**

- Replace `__APP_VERSION__` with `process.env.NEXT_PUBLIC_APP_VERSION` wherever still used (after deleting `useUpdateCheck`, likely only `App.tsx`/Settings via `package.json` import — keep the `packageJson` import if it works; otherwise switch).
- `src/services/config.ts`: `export const API_BASE = "/api";` and drop `import.meta.env` usage. Grep `import.meta` in `src` → must be zero.
- Delete `FindInPage` (component, CSS, usage) and `UpdateBanner`/`useUpdateCheck` (and tests) and the `window.electronAPI` global declaration.
- Any component CSS imported from components stays — App Router permits global CSS imports from any module.
- Add `"use client"` is not required inside `src/**` because everything is under the client-only dynamic boundary.

- [ ] **Step 5: tsconfig**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowJs": false,
    "incremental": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "app", "src", "shared", "server/src", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

If `server/src` fails to typecheck under the root config now (e.g. Express types gone), exclude it here for this task and re-include in Task 10.

- [ ] **Step 6: Vitest projects**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.{test,spec}.{ts,tsx}", "shared/**/*.{test,spec}.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["server/src/**/*.{test,spec}.ts"],
        },
      },
    ],
  },
});
```

- [ ] **Step 7: Verify**

Run: `yarn test && yarn typecheck && yarn lint && yarn build`
Expected: tests pass; `next build` succeeds.
Run: `yarn dev` in background, then `curl -s localhost:3000 | head -c 300` → HTML containing `Dev Home`. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Next.js app shell; remove Vite and Electron (API routes follow)"
```

---

### Task 10: API as Next.js route handlers

**Files:**
- Create: `server/src/http/nextHandler.ts`, `server/src/http/nextHandler.test.ts`, and route files:
  - `app/api/health/route.ts`
  - `app/api/jira/issues/route.ts` (GET), `app/api/jira/issues/bulk/route.ts` (POST), `app/api/jira/mentions/route.ts` (GET)
  - `app/api/jira-filters/remote/route.ts` (GET), `app/api/jira-filters/search/route.ts` (POST)
  - `app/api/github/prs/route.ts`, `.../reviews/route.ts`, `.../org-prs/route.ts`, `.../org-prs-multi-repo/route.ts`, `.../org-members/route.ts`, `.../org-repos/route.ts`, `.../mentions/route.ts`, `.../merged-prs/route.ts`, `.../job-logs/route.ts` (all GET), `app/api/github/pr/[owner]/[repo]/[number]/route.ts` (GET)
  - `app/api/teams/dashboard/route.ts` (POST)
  - `app/api/teams-jira/users/search/route.ts`, `.../boards/search/route.ts`, `app/api/teams-jira/boards/[id]/sprints/route.ts` (all GET)
- Modify: `server/src/routes/{jira,jiraFilters,github,teams,teamsJira}.ts` (Express `Router` → exported handler functions), `server/src/utils/errors.ts` (framework-agnostic `toErrorResponse`)
- Delete: `server/src/index.ts`, `server/package.json`, `server/yarn.lock`, `server/tsconfig.json`, `server/eslint.config.js`, `server/vitest.config.ts`, `server/.gitignore`

**Interfaces:**
- Produces:
  - `export interface ApiRequest { query: Record<string, string | undefined>; params: Record<string, string>; body: any; }`
  - `export interface ApiResponse { status(code: number): ApiResponse; json(body: unknown): void; }`
  - `export type ApiHandler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>;`
  - `export function nextHandler(handler: ApiHandler): (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>`
  - `server/src/utils/errors.ts`: `export function toErrorResponse(err: any, method: string, path: string): { status: number; body: { error: string } }` — same status/message rules as today's `errorHandler`, same `console.error` line (never logs headers).

- [ ] **Step 1: Write failing adapter test**

```ts
// server/src/http/nextHandler.test.ts
import { describe, expect, it } from "vitest";
import { nextHandler } from "./nextHandler";
import { getConfig } from "../config";

const creds = {
  "x-jira-base-url": "https://acme.atlassian.net",
  "x-jira-email": "me@acme.com",
  "x-jira-api-token": "jt",
  "x-github-token": "gt",
  "x-github-username": "me",
};
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

describe("nextHandler", () => {
  it("passes query, params and body; default status 200", async () => {
    const h = nextHandler((req, res) => res.json({ q: req.query.a, p: req.params.id, b: req.body }));
    const r = await h(
      new Request("http://x/api/t?a=1", { method: "POST", body: JSON.stringify({ k: 2 }), headers: { "content-type": "application/json" } }),
      ctx({ id: "9" }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ q: "1", p: "9", b: { k: 2 } });
  });

  it("supports res.status(...).json(...)", async () => {
    const h = nextHandler((_req, res) => res.status(400).json({ error: "bad" }));
    const r = await h(new Request("http://x/api/t"), ctx());
    expect(r.status).toBe(400);
  });

  it("binds credentials from headers for getConfig()", async () => {
    const h = nextHandler((_req, res) => res.json({ user: getConfig().githubUsername }));
    const r = await h(new Request("http://x/api/t", { headers: creds }), ctx());
    expect(await r.json()).toEqual({ user: "me" });
  });

  it("maps thrown errors: missing creds → 401, axios 404 passthrough, others → 500 generic", async () => {
    const noCreds = nextHandler(() => {
      getConfig();
    });
    expect((await noCreds(new Request("http://x/api/t"), ctx())).status).toBe(401);

    const upstream = nextHandler(() => {
      throw Object.assign(new Error("x"), { response: { status: 404, data: { message: "nope" } } });
    });
    const r404 = await upstream(new Request("http://x/api/t"), ctx());
    expect(r404.status).toBe(404);
    expect(await r404.json()).toEqual({ error: "nope" });

    const boom = nextHandler(() => {
      throw new Error("secret detail");
    });
    const r500 = await boom(new Request("http://x/api/t"), ctx());
    expect(r500.status).toBe(500);
    expect(await r500.json()).toEqual({ error: "An internal server error occurred" });
  });
});
```

- [ ] **Step 2: Run** — `yarn vitest run server/src/http/nextHandler.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// server/src/utils/errors.ts
/**
 * Map a thrown error to an HTTP response. Upstream (axios) statuses pass
 * through; 5xx details are hidden from the client. Never logs request headers.
 */
export function toErrorResponse(
  err: any,
  method: string,
  path: string,
): { status: number; body: { error: string } } {
  const status = err.status || err.response?.status || 500;
  const internalMessage = err.response?.data ? JSON.stringify(err.response.data) : err.message;
  console.error(`[${method} ${path}] Error:`, status, internalMessage);

  const error =
    status >= 500
      ? "An internal server error occurred"
      : err.response?.data?.message || err.message || "Request failed";
  return { status, body: { error } };
}
```

```ts
// server/src/http/nextHandler.ts
import { configFromHeaders, runWithConfig } from "../config";
import { toErrorResponse } from "../utils/errors";

export interface ApiRequest {
  query: Record<string, string | undefined>;
  params: Record<string, string>;
  body: any;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>;

/**
 * Adapts an Express-style handler to a Next.js route handler. Credentials from
 * the request headers are bound to the async context so getConfig() works in
 * the existing clients.
 */
export function nextHandler(handler: ApiHandler) {
  return async (
    request: Request,
    ctx: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const url = new URL(request.url);
    const params = (await ctx?.params) ?? {};
    let body: any = undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    }

    let status = 200;
    let payload: unknown = null;
    const res: ApiResponse = {
      status(code) {
        status = code;
        return res;
      },
      json(value) {
        payload = value;
      },
    };

    const config = configFromHeaders((name) => request.headers.get(name));
    try {
      await runWithConfig(config, () =>
        handler({ query: Object.fromEntries(url.searchParams), params, body }, res),
      );
      return Response.json(payload, { status });
    } catch (err) {
      const { status: errStatus, body: errBody } = toErrorResponse(err, request.method, url.pathname);
      return Response.json(errBody, { status: errStatus });
    }
  };
}
```

Run test → PASS.

- [ ] **Step 4: Convert route modules**

For each of `jira.ts`, `jiraFilters.ts`, `github.ts`, `teams.ts`, `teamsJira.ts`:
- Replace `import { Router, Request, Response } from "express"` with `import type { ApiRequest as Request, ApiResponse as Response } from "../http/nextHandler";`.
- Replace each `router.<verb>("<path>", async (req, res) => {...})` with a named export, e.g. `export async function getPrs(req: Request, res: Response) {...}` (names: `getIssues`, `postIssuesBulk`, `getJiraMentions`, `getRemoteFilters`, `postJqlSearch`, `getPrs`, `getReviews`, `getOrgPrs`, `getOrgPrsMultiRepo`, `getOrgMembers`, `getOrgRepos`, `getGithubMentions`, `getMergedPrs`, `getJobLogs`, `getPrDetail`, `postTeamDashboard`, `searchUsers`, `searchBoards`, `getBoardSprints`). Handler bodies stay as they are.
- `req.query.x` was `string | string[] | ParsedQs` under Express; now `string | undefined`. Fix any casts (`as string`) the compiler flags; if a route read repeated query params as arrays, use comma-joined strings as the frontend already does (`repos.join(",")`).
- Remove `export default router` and `const router = Router()`.

- [ ] **Step 5: Route files** — one per endpoint, e.g.:

```ts
// app/api/github/prs/route.ts
import { nextHandler } from "@server/http/nextHandler";
import { getPrs } from "@server/routes/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = nextHandler(getPrs);
```

```ts
// app/api/github/pr/[owner]/[repo]/[number]/route.ts
import { nextHandler } from "@server/http/nextHandler";
import { getPrDetail } from "@server/routes/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = nextHandler(getPrDetail);
```

```ts
// app/api/health/route.ts
import pkg from "../../../package.json";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", version: pkg.version, timestamp: new Date().toISOString() });
}
```

Add `"@server/*": ["./server/src/*"]` to `tsconfig.json` `paths`. Add `export const maxDuration = 60;` to `teams/dashboard`, `github/org-prs`, `github/org-prs-multi-repo`, `github/reviews`, `github/prs`, `jira/issues`.

- [ ] **Step 6: Remove the Express server package** — delete the files listed under "Delete"; ensure `tsconfig.json` includes `server/src`; `grep -rn "from \"express\"\|express-async-errors\|cors" server app src` → no hits.

- [ ] **Step 7: Verify end-to-end**

Run: `yarn test && yarn typecheck && yarn lint && yarn build` → PASS.
Run `yarn dev` in background, then:
- `curl -s localhost:3000/api/health` → `{"status":"ok",...}`
- `curl -s -o /dev/null -w "%{status_code}" localhost:3000/api/github/prs` → `401`
- `curl -s -I localhost:3000/ | grep -i content-security-policy` → present.
Then use the Playwright MCP tools: open `http://localhost:3000`, confirm Settings shows (unconfigured), fill dummy credentials, save, confirm localStorage `dev-home-settings` exists and a network request to `/api/github/prs` carries `x-github-token`. Create a note and reload — it persists. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: serve the API from Next.js route handlers; remove Express"
```

---

### Task 11: Deploy docs and README

**Files:**
- Modify: `README.md`
- Create: `docs/deploy.md`

- [ ] **Step 1: README** — replace desktop install/build instructions with: what the web app is; local dev (`yarn`, `yarn dev`, open `localhost:3000`, enter credentials in Settings); "Where is my data?" (browser localStorage only, export/import in Settings, tokens never exported, forwarded per request and never stored or logged by the server); migrating from desktop (`node scripts/export-sqlite.mjs "~/Library/Application Support/Dev Home/notes.db"` then Import — verify the actual userData folder name from `package.json` `productName` "Dev Home"); link to `docs/deploy.md`. Keep existing feature descriptions, minus Claude and desktop-only features.
- [ ] **Step 2: `docs/deploy.md`** — sections:
  - **Vercel (Hobby):** import repo, framework auto-detected, no env vars required; note Hobby is for personal/non-commercial use and function duration limits (`maxDuration = 60` set on heavy routes).
  - **Cloudflare Workers (OpenNext):** `yarn add -D @opennextjs/cloudflare wrangler`, `wrangler.jsonc` with `compatibility_flags: ["nodejs_compat"]`, `compatibility_date` current, build/deploy commands `opennextjs-cloudflare build && opennextjs-cloudflare deploy`; free tier limits in one line; do not commit these deps unless chosen.
  - **Any Node host / Docker:** `yarn build` produces `.next/standalone`; run `node .next/standalone/server.js` with `.next/static` and `public` copied alongside.
  - **Security note:** serve only over HTTPS; the app has no login — anyone with the URL can use it with *their own* credentials; consider putting it behind company SSO if hosting for an org.
- [ ] **Step 3: Verify** — `yarn build` passes; every command in docs is copy-pasteable (paths exist).
- [ ] **Step 4: Commit** — `git commit -am "docs: web usage, data storage and deployment guide"`.

---

## Self-review notes

- Spec coverage: SQLite inventory → Tasks 3, 4, 7 (+8 deletes); credentials → 6; backup/migration → 5; teams/burn-up → 7; Claude removal → 1; Electron removal → 9; Next layout/routes/adapter → 9, 10; security headers → 9; hosting docs → 11.
- Types used across tasks: `AppSettings`, `SETTINGS_KEY` (6) read by `backup.ts` (5) via the literal key only; `createCollection`/`readJson`/`writeJson`/`sqliteNow`/`DB_PREFIX` (2) used in 3, 4, 5, 7; `buildBurnup`/`SnapshotRow` (7); `nextHandler`/`ApiRequest`/`ApiResponse`/`toErrorResponse` (10); `configFromHeaders`/`runWithConfig`/`getConfig`/`MissingConfigError` (6) used in 10.
