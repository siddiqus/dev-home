# Workday V2 (ticket deck) Implementation Plan

Spec: `docs/superpowers/specs/2026-10-13-workday-v2-deck-design.md` (binding authority; every task cites its sections, read them in full before starting).

**Goal:** a new `Workday V2` page whose Focus mode is a ticket deck (rail + one card), and whose Standup mode reuses v1's `StandupMode`.

**Architecture:** pure logic (`signals.ts`, `buildDeck.ts`, `deckSearch.ts`) with full unit tests; persisted personal state in `useDeckState.ts`; thin React components in `src/views/workdayV2/`. v1 code under `src/views/workday/` is only touched by behaviour-preserving exports.

**Tech:** React 18, TypeScript, Vite, Vitest + Testing Library, react-bootstrap, `@tabler/icons-react`.

## Global Constraints

- **No new network requests.** Build only from the data `WorkdayView` already receives (spec §6.1). The only on-demand fetch allowed is `getPrDetail` (in `src/api/github/index.ts`) for opening a PR that isn't in the deck from ⌘K (spec §5.11).
- **v1 is untouched in behaviour.** Allowed v1 edits: exporting `selfNeeds` / `failingChecks` from `src/views/workday/buildFocus.ts` (or moving them into `prState.ts`), and exporting `isTypingTarget` / `useStoredState` helpers if reused. Existing tests in `src/views/workday/` must pass unchanged.
- **All new code lives in `src/views/workdayV2/`** (tests beside the code as `*.test.ts(x)`), except App wiring in `src/App.tsx` and `src/config/navTabs.ts`.
- **Persisted state:** one localStorage key `dev-home-workday-v2`, JSON `{ v: 1, ... }` with the fields in spec §6.3. UI preferences (hide key hints, show only current, closed group folded) use `usePersistedState` (`src/hooks/usePersistedState.ts`) with their own `dev-home-workday-v2-*` keys.
- **Read-only towards GitHub/Jira.** Notes go through the existing notes service (`addNote` prop) only.
- **Confirmations** ("Copied branch", "Note saved", "Nothing new") use the existing bottom-fixed `Toast` (`src/components/Toast`) via `usePRCopyActions` or equivalent; never inline alerts that shift layout.
- **Data hooks gate on `configured`.** Render the same not-configured `EmptyState` as v1.
- **Keyboard guards:** single-key shortcuts are ignored when the event target is an input/textarea/select/contenteditable, when any modifier other than the documented ones is held, when the PR modal, Jira drawer or note editor is open; never bind ⌘+digit (used by `useKeyboardShortcuts`).
- **Visuals:** existing tokens/themes, `Badge` tones from `src/components/primitives/Badge` (`danger | warning | info | success | purple | neutral`). Amber = current, blue dot = unseen, stripe = state. Mono font for keys and PR numbers. Rail ≈268px fixed; card `max-width: 600px` centred; card body scrolls past ~70vh; < 900px slim rail. Animations ≤150ms and disabled under `prefers-reduced-motion`.
- **Shared rules:** signals must reuse v1's `ACTIONABLE_REASONS` (`src/utils/prCategories`), `selfNeeds`, `failingChecks`, `myPRState`, `readyToMerge`, `ciFailing`, `reviewingState`, `titleWithoutKey`, `repoRef`, `compactAge`, `ticketKeyOf` (`src/utils/tickets`) so v1 and v2 never disagree.
- **Verification commands:** `yarn vitest run src/views/workdayV2 src/views/workday` while iterating; before each commit `yarn test`, `yarn typecheck`, `yarn lint` must all pass.
- Commit per task with a conventional message `feat(workday-v2): …`. Do not push.

## Existing building blocks (verified)

- `WorkdayViewProps` in `src/views/workday/WorkdayView.tsx` — WorkdayV2 takes the same props plus optional `onOpenNote?: (note: Note) => void` (App passes the same handler it gives other views; spec §5.10 "opens the existing note editor").
- `StandupMode` + `StandupModeProps`, `LOOKBACKS` in `StandupMode.tsx`; it needs `sections` from `buildWorkday`, `useWorkdayExtras(configured, since, refreshKey)`, `workdayToMarkdown`, `sinceFor`, `formatSinceLabel`, `filterWorkday`. Copy exactly how `WorkdayView` wires Standup (sprint filter, lookback, copy button, notes), minus v1's item filter.
- `buildWorkday(...).workingOn.items` yields `TicketGroup`s incl. in-progress assigned tickets with no PR (`prs: []`) and `TicketRef` (`statusName`, `offSprint`, `summary`, `updated`). Use it (or its helpers `statusCategoryOf`) for "No PR yet" tickets and ticket refs.
- `buildFocus.ts` builds `MentionItem`s from `githubMentions` / `jiraMentions` (see `MentionItem` in `types.ts`) — reuse/extract that mapping rather than reimplementing.
- `prPin(pr) = "pr:" + html_url`, `ticketPin(key) = "ticket:" + key` in `pins.ts` — same id formats as deck state `current`.
- `TicketChip` (used by `TicketKey` in `CompactRow.tsx`) opens the Jira drawer; `OffSprintPill` exported from `CompactRow.tsx`.
- `PRDetailModal`, `Toast`, `SegmentedTabs`, `EmptyState`, `usePRCopyActions` (gives `copy(text, msg)`, `onCopyLink`, `toast`).
- Notes: `prNoteKey(pr)`, `normalizeNoteRef(ref)` in `src/utils/prNotes.ts`; `usePRNoteCounts` shows the indexing pattern. Notes arrive as the `notes` prop.
- `isTypingTarget` and `useStoredState` are module-private in `WorkdayView.tsx`; export them (no behaviour change) for reuse.

---

## Task 1: Shared exports and `signals.ts`

Spec: §5.5, §7 (refactors), §9 `signals.test.ts`.

Files: modify `src/views/workday/buildFocus.ts` (export `selfNeeds`, `failingChecks`, and `diffSize` if useful — no logic change); create `src/views/workdayV2/types.ts`, `src/views/workdayV2/signals.ts`, `src/views/workdayV2/signals.test.ts`.

Produces (consumed by Task 2+):
```ts
// types.ts — the spec §6.2 interfaces: Signal, DeckPR, DeckTicket, DeckData, plus
export interface DeckInputs {
  openPRs: GitHubPR[]; reviewRequests: GitHubPR[]; reviewingPRs: GitHubPR[];
  assignedIssues: JiraIssue[]; allIssues: JiraIssue[];
  githubMentions: GitHubComment[]; jiraMentions: JiraComment[]; notes: Note[];
}
// signals.ts
export const MAX_CHIPS = 4;
export const PRIORITY: Record<BadgeVariant, number>; // danger 0, warning 1, info 2, success 3, purple 4, neutral 5 (lower = needs me more)
export function mySignals(pr: GitHubPR, now: Date): Signal[];        // spec §5.5 "My PRs", worst first
export function reviewSignals(pr: GitHubPR, requested: boolean): Signal[]; // spec §5.5 "PRs I'm reviewing"
export function prPriority(signals: Signal[]): number;               // PRIORITY of worst signal; neutral if none
export function visibleChips(signals: Signal[]): { shown: Signal[]; more: Signal[] }; // cut at MAX_CHIPS
export function headline(signals: Signal[]): string;                 // label of worst non-context signal (rail status line)
```
Rules: one signal per table row in §5.5 using the exact labels (`✗ CI failing: <checks>`, `✗ Conflict with <base>`, `✗ Changes requested · N threads`, `N open threads`, `No reviewer`, `✓ Ready to merge`, `✓ Approved · <who>`, `In merge queue`, `⏳ Waiting on <reviewers> · <age>`, `Draft`, `CI ✓` / `CI …`; review: `Re-requested by <author>`, `New commits since your review`, `Review requested · +A −D`). Derive conditions from `selfNeeds`/`ACTIONABLE_REASONS`, `readyToMerge`, `ciFailing`, `reviewingState` — don't re-derive. Draft suppresses review signals. CI context chip is never the only chip and has tone `neutral` with lowest priority among chips. Use real `GitHubPR` field names (check `src/types`); if a field the spec names differs (e.g. `noReviewer`), use the real helper/field and note it in the report.

Tests: every table row, draft suppression, `+N` cut-off (6 signals → 4 shown, 2 more), priority order, Approved-vs-Ready distinction, waiting chip only when nothing above applies.

Commit: `feat(workday-v2): PR signals and needs-me priority`

## Task 2: `buildDeck` — grouping, ticket fields, card order

Spec: §5.2, §5.3 (status line, review chip, stripe, key shortening), §5.4 (PR order), §5.5 tie-break, §6.2 steps 1–4, §9 `buildDeck.test.ts` (first eight bullets).

Files: create `src/views/workdayV2/buildDeck.ts`, `buildDeck.test.ts`.

Produces:
```ts
export interface DeckState {           // persisted shape minus `v` (Task 4 owns storage)
  arrival: Record<string, number>; current: string[]; currentTickets: string[];
  seen: Record<string, string>; closed: Record<string, string>;
  selected: string | null; seeded: boolean;
}
export const EMPTY_DECK_STATE: DeckState;
export interface DeckStateUpdates {    // patch the hook applies (Task 4)
  arrival?: Record<string, number>;     // new entries only
  reopen?: string[];                   // ticket ids to delete from closed
  dropCurrent?: string[];              // current ids whose PR left the deck
  seen?: Record<string, string>;       // first-run seeding
  seeded?: true;
}
export function buildDeck(inputs: DeckInputs, state: DeckState, now: Date): DeckData & { stateUpdates: DeckStateUpdates };
export function shortKey(key: string, deck: DeckTicket[]): string; // number only when every keyed ticket shares one prefix
```
In this task `state` is honoured only for `current` flags on PRs/tickets; groups: everything goes in `open`, ordered by `state.arrival` when present else by oldest PR `created_at` (spec §8 phase 1). `stateUpdates.arrival` assigns new ids sequence numbers continuing from `max(existing)+1` in `created_at` order. `closed: []`, `unmatched: []` for now, `unseen` false, `unseenComment`/`note`/`jiraMention` null (Task 3 and Task 9 fill them). Collection: `openPRs` = mine; `reviewRequests` (requested); `reviewingPRs` only where `new_commits_since_review` and my latest review isn't APPROVED (use `reviewingState`). De-dup by `html_url`, mine wins. Ticketless PR → id `pr:<html_url>`, title `repoRef(pr) + " " + title`. "No PR yet" tickets: in-progress tickets assigned to me without PRs (same rule v1 `workingOn` uses). Title = Jira summary (from `allIssues`/`assignedIssues`) else `titleWithoutKey(firstPR.title, key)`. `status` = `#<n> <headline>` of top PR plus ` · N new comments` (count wired in Task 3), or `No PR yet`. `stripe` = worst tone; `reviewOnly` when every PR is a review PR. `counts.tickets/current`.

Tests: the first eight `buildDeck.test.ts` bullets in spec §9, plus key shortening both ways, plus arrival stability across re-sorted inputs.

Commit: `feat(workday-v2): buildDeck grouping, signals and order`

## Task 3: `buildDeck` — groups, closing, reopening, seen

Spec: §5.3 group order, §5.6, §5.8, §5.9, §6.2 step 5, §9 remaining `buildDeck.test.ts` bullets.

Files: modify `buildDeck.ts`, `buildDeck.test.ts`.

Behaviour:
- `current` group = tickets with any current item, ordered by `state.currentTickets` (ids not listed go last in arrival order). `open` = rest by arrival. `closed` = ids in `state.closed`, most recently closed first, unless reopened.
- Reopen (derived, also emitted in `stateUpdates.reopen`): any PR `updated_at > closedAt`, or a PR id on the ticket that has no `seen` entry and no prior arrival-time knowledge (a newly joined PR — treat "PR `created_at` or review-request newer than closedAt" as the rule; document choice in a comment).
- `dropCurrent`: `pr:<url>` entries in `state.current` whose PR is no longer in the deck; `ticket:<KEY>` entries whose ticket has left.
- Unseen: `pr.updated_at > seen[url]`; missing `seen` entry ⇒ unseen, except first run: when `!state.seeded`, emit `seen` = every PR's `updated_at` and `seeded: true`, and treat all as seen in this result.
- `unseenComment`: newest `githubMentions` entry for that PR (match by PR url/number+repo — check `GitHubComment` fields) with `created_at > seen[url]`, mapped to `MentionItem` (extract/reuse buildFocus's mapping). Ticket `jiraMention`: newest unseen Jira mention on the key where `created` > the ticket's newest seen time (use max seen of its PRs, or `state.seen["ticket:<KEY>"]` for PR-less tickets — `markSeen` writes that key). `unmatched`: mentions with no matching PR/ticket in the deck, newest first.
- Status line gets ` · N new comments` = count of unseen GitHub mentions on the top PR.
- `counts.unseen` = tickets with unseen.
- Selected PR default isn't buildDeck's concern.

Tests: remaining spec §9 bullets (current ordering + unmark returns to arrival slot, auto-close on merge/closure/fulfilled review — i.e. PR absent from inputs, reopen on `updated_at` and new PR, pruning current, first-run seeding + new arrivals unseen, newest unseen comment, unmatched mentions).

Commit: `feat(workday-v2): deck groups, close/reopen and seen state`

## Task 4: `useDeckState`

Spec: §6.3, §9 `useDeckState.test.ts`.

Files: create `src/views/workdayV2/useDeckState.ts`, `useDeckState.test.ts`.

Produces:
```ts
export const DECK_STATE_KEY = "dev-home-workday-v2";
export const ARRIVAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export function useDeckState(): {
  state: DeckState;
  toggleCurrent(itemId: string, ticketId: string): void; // maintains current + currentTickets (append on first, remove on last)
  markSeen(entries: Record<string, string>): void;        // url|ticket:<KEY> → iso; never moves a value backwards
  markUnread(prUrl: string): void;                        // delete seen entry
  close(ticketId: string, at?: Date): void;
  reopen(ticketId: string): void;
  select(ticketId: string | null): void;
  applyUpdates(u: DeckStateUpdates, presentIds: string[], now: Date): void; // also prunes arrival ids absent > 30 days
};
```
Pruning needs last-seen-present times: store `lastPresent: Record<ticketId, iso>` as an extra field (ledger-approved addition; spec says "absent tabs are pruned after 30 days"). Reads tolerate missing/garbled/other-version JSON (fall back to empty). Writes batched: state updates through one `useState`, persisted in one `useEffect` after commit, so a refresh's `applyUpdates` causes one `localStorage.setItem`. `applyUpdates` with an empty patch must not change identity (no render loop).

Tests: round-trip, version key/invalid JSON, toggleCurrent ordering both directions, markSeen monotonic, batching (spy on `setItem`: one call per applyUpdates), 30-day pruning.

Commit: `feat(workday-v2): persisted deck state`

## Task 5: `useSeenTimer` and `useDeckKeys`

Spec: §5.8 dwell rule, §5.12, §9 `useSeenTimer.test.ts`.

Files: create `useSeenTimer.ts`, `useSeenTimer.test.ts`, `useDeckKeys.ts`, `useDeckKeys.test.ts`; modify `src/views/workday/WorkdayView.tsx` to export `isTypingTarget` (no behaviour change).

```ts
export const SEEN_DWELL_MS = 1500;
export function useSeenTimer(cardId: string | null, onSeen: () => void): void;
// starts a timer when cardId set and document.visibilityState === "visible"; restarts on cardId change;
// pauses on visibilitychange→hidden, restarts on visible; calls onSeen once per card display.
export interface DeckKeyHandlers {
  next(): void; prev(): void; down(): void; up(): void; toggleCurrent(): void;
  open(): void; openExternal(): void; note(): void; close(): void; unread(): void;
  nextUpdated(): void; toggleOnlyCurrent(): void; refresh(): void;
  palette(): void; focusMode(): void; standupMode(): void; help(): void;
}
export function useDeckKeys(h: DeckKeyHandlers, opts: { enabled: boolean; blocked: boolean }): void;
```
Key map exactly spec §5.12 (`g c` is a two-key sequence within ~1s; `⌘K`/`Ctrl+K` → palette works even while `blocked` is false and target is not typing; `⌘⏎` → openExternal; `F`/`S` match shift or not like v1). `blocked` = modal/drawer/note editor/palette open. Call `preventDefault` for handled keys (Space must not scroll). Ignore `e.repeat` for toggles. Never handle ⌘+digit.

Tests: fake timers (marks after 1.5s, not when hidden, resets on card change); keys fire handlers, ignored in input/textarea/contenteditable, ignored when blocked, `g` then `c` sequence, ⌘1 not handled.

Commit: `feat(workday-v2): seen dwell timer and deck key map`

## Task 6: Page shell, App wiring, Standup reuse

Spec: §4, §5.1 header, §6.1, §7 app wiring, §8 phase 1.

Files: create `WorkdayV2View.tsx`, `deck.css`, `WorkdayV2View.test.tsx`; modify `src/App.tsx` (lazy import, render branch with the same props as `WorkdayView` plus `onOpenNote`, icon entry — reuse a tabler icon such as `IconCards`), `src/config/navTabs.ts` (`{ key: "workday-v2", label: "Workday V2" }` after Workday), `PAGE_REFRESH` (find where it's defined; `workday-v2` reuses `workday` sources). Export `useStoredState` from v1 `WorkdayView.tsx` if reused.

`WorkdayV2View` (props = `WorkdayViewProps & { onOpenNote?(note: Note): void }`): not-configured `EmptyState`; header with title "Workday V2", summary `N tickets · N current · N updated` (Focus only), `⌘K find & act` hint button, `SegmentedTabs` Focus|Standup (own key `workday-v2.mode`), refresh spinner while `loading` after first data, Refresh button; Standup branch wires v1 `StandupMode` the same way v1 does (lookback, sprint filter, copy standup, notes). Focus branch renders `DeckMode` (Task 7) — in this task render a placeholder `<div data-testid="deck-mode" />` if Task 7 not done yet. Shared `PRDetailModal` + `Toast`. `F`/`S` switching.

Tests: mode toggle, Standup renders v1 sections, not-configured state, App renders the tab (if an App-level test pattern exists; otherwise skip).

Commit: `feat(workday-v2): page shell with Standup reuse`

## Task 7: Rail and card (read-only) + navigation

Spec: §5.1, §5.3, §5.4, §5.7 (←/→ ↑/↓ only), §5.14 roles, §5.15.

Files: create `DeckMode.tsx`, `DeckRail.tsx`, `DeckRailRow.tsx`, `DeckCard.tsx`, `DeckPRRow.tsx`; modify `WorkdayV2View.tsx`, `deck.css`, `WorkdayV2View.test.tsx`.

`DeckMode` props: `{ deck: DeckData; selectedId; onSelect(id); selectedPrUrl; onSelectPr(url); onOpen(pr); jiraBaseUrl; now; ... }` — WorkdayV2View owns `buildDeck` (memoised) and wires `useDeckKeys`. Rail: groups Current / Open / Closed · N (folded, Task 8 enables), listbox + `aria-activedescendant`, `role="group"` + `aria-label`, row stripe/key (`shortKey`)/title with `title` tooltip/`review` chip/status/dot (`aria-label="new activity"`), selected raised, current amber outline; click selects and blurs. Card: `region` labelled `<key> <title>`; header key (TicketChip → Jira drawer), title, status pill, `OffSprintPill` when off-sprint, sub-line `N PRs · N current · updated <compactAge>`; PR rows as `option`s in a listbox: ▶ marker, `#number` mono, title without key, author when not mine, `visibleChips` as `Badge`s + `+N` with tooltip, age right. First current PR selected on open else top row. "No PR yet" variant. Two decorative ghost cards (`aria-hidden`). Card max-width 600px, body scroll past 70vh. ←/→ wrap through Current+Open (skip Closed); ↑/↓ PRs; ⏎ opens `PRDetailModal`; ⌘⏎ opens `pr.html_url` in a new tab.

Tests: renders tickets from fixture data; ←/→ wraps; ↑/↓ moves selected PR; ⏎ opens modal; keys ignored while modal open and in inputs.

Commit: `feat(workday-v2): deck rail and card with navigation`

## Task 8: Personal state in the UI

Spec: §5.3 (Closed group), §5.6, §5.7 (`n`, persisted selection), §5.8, §5.9, §8 phase 2.

Files: modify `WorkdayV2View.tsx`, `DeckMode.tsx`, `DeckRail.tsx`, `DeckCard.tsx`, `DeckPRRow.tsx`, tests.

Wire `useDeckState`: `buildDeck(inputs, state, now)` then `applyUpdates(stateUpdates, presentIds, now)` in an effect keyed on the patch content (guard against loops). Space → `toggleCurrent(prPin(pr), ticketId)` or `ticketPin(key)` for PR-less tickets. `x` → close, select next ticket. Closed group folded by default (persisted pref), click reopens + selects. `u` → markUnread. `n` → next ticket after selected in rail order with `unseen`, else toast "Nothing new". `useSeenTimer(selectedId, …)` marks every PR on the card seen at its `updated_at` (and `ticket:<KEY>` for PR-less / jira mention); ⏎ marks that PR seen immediately. Selection persisted via `select`; missing → first ticket. Unseen dots on rail rows and PR rows. `g c` show-only-current filter (persisted pref) hides Open.

Tests (spec §9 component bullets): Space moves a ticket into Current and back to its slot; `x` closes, clicking Closed row reopens in place; ←/→ skips Closed; `n` with nothing new shows the toast; selection survives remount.

Commit: `feat(workday-v2): current, close/reopen and seen in the deck`

## Task 9: Card context — comment quotes, Jira mentions, notes

Spec: §5.4 (quotes, notes), §5.10, §6.4, §8 phase 3.

Files: modify `buildDeck.ts` (+tests) for `note` (newest unresolved note per PR, indexed by `normalizeNoteRef(reference_id)` vs `prNoteKey(pr)`; PR-less ticket note by `jira_ticket` + key — add `note` to `DeckTicket` if needed), `DeckCard.tsx`, `DeckPRRow.tsx`, `WorkdayV2View.tsx`, tests.

Unseen comment line under PR row: blue dot, author, age, one-line snippet, a link to the comment `url` (new tab). Jira mention quote under card header. 📝 newest unresolved note line; click calls `onOpenNote(note)`. `.` opens inline one-line composer under the selected PR row (input autofocus; ⏎ saves via `addNote("github_pr", text, prNoteKey(pr))` or `addNote("jira_ticket", text, KEY)`; Esc cancels; toast "Note saved"). Keys are already ignored while typing. Check the real `Note` fields for "resolved".

Tests: buildDeck note selection; composer saves with the right type/reference and shows toast; Esc cancels; comment quote renders with link.

Commit: `feat(workday-v2): comment quotes, mentions and notes on the card`

## Task 10: `deckSearch.ts`

Spec: §5.11 typing + pasted links, §9 `deckSearch.test.ts`.

Files: create `deckSearch.ts`, `deckSearch.test.ts`.

```ts
export type LinkTarget = { kind: "pr"; repo: string; number: number; url: string } | { kind: "ticket"; key: string };
export function parseLink(query: string): LinkTarget | null; // GitHub PR URLs any sub-path/hash/query (via normalizeNoteRef), Jira /browse/KEY and ?selectedIssue=KEY, bare KEY
export interface SearchResult { ticketId: string | null; pr: GitHubPR | null; ticketKey: string | null; label: string; sub: string; closed: boolean; score: number; external?: LinkTarget }
export function searchDeck(query: string, deck: DeckData): SearchResult[];
```
Fuzzy (subsequence, case-insensitive) over key, summary, PR number (`1199`, `#1199`, `repo#1199`), PR title, author, requested reviewers, repo, branch. Exact key or number match ranks first. Closed tabs included with `closed: true`. A parsed link not in the deck returns a single result with `external` set.

Tests: spec §9 `deckSearch.test.ts` bullets.

Commit: `feat(workday-v2): deck search and link parsing`

## Task 11: ⌘K command palette

Spec: §5.11, §5.14 combobox, §8 phase 4.

Files: create `CommandPalette.tsx`, `CommandPalette.test.tsx`; modify `WorkdayV2View.tsx`.

Modal-ish overlay (react-bootstrap `Modal` or custom with focus trap), `role="combobox"` input + `listbox`. Empty query: "Updated since you looked" (unseen PRs/tickets + `deck.unmatched`, newest first) and Commands (Next updated `n`, Show only current `g c`, Show closed, Refresh `r`, Switch to Standup/Focus, Hide/Show key hints). Typing: `searchDeck`. Actions under the selected result with shortcuts exactly per spec table (⏎ jump, Space when query empty or ⌘⇧Space toggle current, ⌥⏎ open modal, ⌘⏎ GitHub, ⌘B copy branch (`pr.head.ref` — verify field), ⌘L copy link, ⌘. add note (jumps to card and opens composer), ⌘⌫ close/reopen, ⌘U mark unread). Tab cycles results↔actions; footer `↑↓ move · ⏎ jump · Tab actions · esc close`. External PR → `getPrDetail` then `PRDetailModal` (check its args/return); external ticket → Jira drawer (find how `TicketChip` opens it and call the same API/context). Unmatched mention ⏎ opens its url. Per spec §11 risk: if the browser reserves ⌘L/⌘B, also accept plain `l`/`b` when the query is empty.

Tests: ⌘K opens/Esc closes; pasted PR URL jumps to its card; ⌘B copies branch + toast; Space toggles current with empty query; external PR calls `getPrDetail` (mocked).

Commit: `feat(workday-v2): command palette`

## Task 12: Polish — states, slim rail, motion, hints, help, a11y

Spec: §5.1 (key hint bar, narrow screens), §5.4 peeking motion, §5.12 `?`, §5.13, §5.14, §8 phase 5.

Files: modify `DeckMode.tsx`, `DeckRail.tsx`, `DeckCard.tsx`, `WorkdayV2View.tsx`, `deck.css`; create `ShortcutSheet.tsx`; tests.

- Key hint bar (single line, bottom), hideable from ⌘K, persisted pref.
- `?` opens a shortcut sheet listing §5.12.
- First-load skeleton (6 rail rows + card skeleton) when loading with no data; header spinner on refresh.
- Empty deck: "Nothing open. Nice." + counts of Closed tabs and assigned not-started tickets (from `buildWorkday`'s notStarted section) with "Show closed" / "Switch to Standup" links.
- All-current: Open group hidden.
- Source error banner at top of rail: determine what error signal props exist (if none are passed today, add optional `githubError?: string | null; jiraError?: string | null` props wired from App's existing dashboard error state, no new requests). Text "Jira unavailable, showing PRs only · retry" (retry = onRefresh).
- Slim rail < 900px (CSS media query: keys, stripes, dots only; hover/focus-within expands as overlay).
- → slide ≤150ms, disabled under `prefers-reduced-motion`.
- A11y pass against §5.14.

Tests: empty state, source-error banner, `?` sheet opens, hint bar hide persists.

Commit: `feat(workday-v2): empty/loading/error states, slim rail, motion and shortcut sheet`
