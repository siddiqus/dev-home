# PR-attached notes — design spec

**Date:** 2026-07-28
**Branch:** `feat/pr-notes`

## Goal

When a PR is opened in the modal (`DescriptionModal`), show the note(s) attached to
that PR and allow full note management (view / add / edit / resolve / pin / delete)
without leaving the modal. Also show a small badge on PR rows that have notes.

## Key decisions (from brainstorming)

1. **Full note management** inside the modal (not view-only).
2. **Match both** stable-key notes *and* legacy URL-based PR notes for the same PR.
3. **Dedicated Notes column** in the fullscreen modal (next to Description / Checks).
4. **Badge** on PR rows that have unresolved notes.
5. **Data flow via React Context** (`NotesContext`) — chosen over prop-drilling.

## What already exists (do not rebuild)

- `notes` table + `/api/notes` CRUD. `type` includes `"github_pr"`, plus
  `reference_id`, `title`, `content`, `resolved`, `pinned`. **No server/schema
  change needed** — `POST /notes` already accepts `{type:"github_pr", reference_id, ...}`.
- `useNotes` hook (`src/hooks/useNotes.ts`) exposes: `notes`, `unresolvedNotes`,
  `loading`, `error`, `addNote(type, content, referenceId?, title?)`, `editNote(id, {title?,content?,reference_id?})`,
  `resolveNote`, `unresolveNote`, `pinNote`, `unpinNote`, `removeNote`, `refresh`.
- `DescriptionModal` (`src/components/DescriptionModal.tsx`) is the PR modal, rendered
  by `PRTable` which owns `selectedPR` state and renders the rows via `PRCard`.
- Canonical PR key convention: `useKanban.makePrItemId` → `` `${repo_full_name}#${number}` ``.
- `utils/text.ts`: `getNoteDisplayTitle`, `getReferenceUrl`, `formatGitHubTitle`
  (**display only** — produces `repo#123` WITHOUT owner; do not use for matching).

## Canonical key

PR key for matching is **`owner/repo#number`** = `` `${pr.repo_full_name}#${pr.number}` `` —
same as `makePrItemId`. New notes created from the modal store this exact string in
`reference_id` with `type: "github_pr"`.

---

## Tasks

### T1 — `src/utils/prNotes.ts` (+ `prNotes.test.ts`)

Pure, unit-tested. TDD.

- `prNoteKey(pr: Pick<GitHubPR, "repo_full_name" | "number">): string`
  → `` `${pr.repo_full_name}#${pr.number}` ``
- `normalizeNoteRef(referenceId: string | null | undefined): string | null`
  - `null`/empty → `null`
  - already canonical `owner/repo#123` (regex `^[^\s/]+\/[^\s/]+#\d+$`) → return as-is
  - GitHub PR URL `https://github.com/<owner>/<repo>/pull/<n>` (tolerate trailing
    `?query`/`#frag`, and a trailing `/`) → `` `${owner}/${repo}#${n}` ``
  - anything else (bare repo URL, jira, generic link, free text) → `null`
- `notesForPr(notes: Note[], pr: Pick<GitHubPR,"repo_full_name"|"number">): Note[]`
  → `notes.filter(n => normalizeNoteRef(n.reference_id) === prNoteKey(pr))`
  Preserve input order (already `pinned DESC, created_at DESC` from the API).

Test cases: canonical passthrough; PR URL with/without query+fragment+trailing slash;
bare repo URL → null; jira key/url → null; generic link → null; empty/null → null;
`notesForPr` matches a canonical note and a URL note for the same PR, excludes others.

### T2 — `src/context/NotesContext.tsx`

- `type NotesApi = ReturnType<typeof useNotes>` (import the hook's return type; do NOT
  re-run the hook here).
- `NotesContext = createContext<NotesApi | null>(null)`
- `NotesProvider` = thin wrapper: `({value, children}) => <NotesContext.Provider value={value}>`
  — accepts the already-created api as a `value` prop (App owns the single `useNotes`
  instance; provider just distributes it). Keep it minimal.
- `useNotesContext(): NotesApi` — reads context, throws
  `"useNotesContext must be used within a NotesProvider"` if null.

### T3 — `src/App.tsx` provider wiring + gating change

- Change `useNotes(configured && activeSources.has("notes"))` →
  `useNotes(configured)` so PR notes load regardless of the notes source toggle.
  (Aligns with the "data hooks gate on configured" convention.)
- Build the api object from the existing destructured hook values and wrap the
  dashboard content (the region rendering `PRsView` / `PRTable` / `PersonalNotes`)
  in `<NotesProvider value={notesApi}>`. Existing prop-based consumers
  (SummaryView, PersonalNotes, Kanban, NoteEditorModal, command palette) stay
  unchanged — same single hook instance feeds both paths.
- Do not otherwise refactor App.

### T4 — `src/components/PrNotesPanel.tsx` (+ test) and wire into `DescriptionModal`

`PrNotesPanel`:
- Props: `{ pr: GitHubPR }`. Reads `useNotesContext()` and `notesForPr(notes, pr)`.
- Header: `Notes (n)` where n = count of **unresolved** matches, + an `+ Add` button.
- List of matched notes (all matches; resolved ones visually de-emphasized). Each item
  shows `getNoteDisplayTitle` + content, and inline actions: resolve/unresolve, pin/unpin,
  delete (keep the existing `window.confirm` on delete), and inline edit (toggle a
  textarea → `editNote(id, {content, title?})`).
- `+ Add`: inline composer (textarea for content, optional title input) — NOT a stacked
  modal. On save: `addNote("github_pr", content, prNoteKey(pr), title?)`. Empty content
  is a no-op. Clear + collapse composer after save.
- Reuse existing note styling/classes (`note-card`, tabler icons: `IconCheck`,
  `IconPin`/`IconPinFilled`, `IconTrash`) for visual consistency; add a small
  `PrNotesPanel.css` only if needed.

`DescriptionModal`:
- Add a Notes column in the `Row` split, rendered **only when `pr` is defined**:
  `<Col className="modal-notes-col"><PrNotesPanel pr={pr} /></Col>`.
- Recompute column widths so Description keeps the largest share and the optional
  columns (checks / sessions / notes) split the remainder and stay readable. Centralize
  the width calculation (a small helper or inline `useMemo`) rather than scattering
  ternaries. Fullscreen modal, so there is room for 3 columns.

Test (`PrNotesPanel.test.tsx`, RTL): render inside a `NotesContext.Provider` with a
stub api; asserts (a) only matching notes render, (b) `+ Add` → save calls `addNote`
with `("github_pr", <content>, "o/r#1", ...)`, (c) resolve/delete call the right api fns.

### T5 — PR row badge (`PRTable` + `PRCard`)

- In `PRTable`: read `useNotesContext()`, build a memoized
  `Map<string, number>` of `prKey → unresolved note count` from `notesForPr`/`normalizeNoteRef`
  (build once per notes change, not per row). Pass `noteCount` to each `PRCard`.
- In `PRCard`: add optional prop `noteCount?: number`. When `> 0`, render a small chip
  in the meta row (e.g. `IconNote` + count) with a title like `"n note(s)"`. No click
  behavior beyond the row's existing open-modal.
- Add a `PRCard.test.tsx` case: `noteCount={2}` renders the badge; `0`/undefined does not.

## Out of scope (YAGNI)

Server/schema changes; note threading/replies; note reordering; migrating existing
prop-based notes consumers to context; a separate "resolved notes" viewer in the panel.

## Verification

`yarn lint`, `yarn build` (tsc), `yarn test` must all pass before finishing.
