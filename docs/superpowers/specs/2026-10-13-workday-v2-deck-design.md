# Workday V2: the ticket deck. Design

Date: 2026-10-13
Status: approved in brainstorming, pending implementation
Builds on: `2026-10-11-workday-design.md`, `2026-10-12-workday-modes-design.md`
Mockups (gitignored, regenerate from this spec if lost):
`.superpowers/brainstorm/86268-1791912341/content/deck-v3.html` (approved layout),
plus `deck-layouts.html` and `deck-hybrid.html`, the earlier rounds.

---

## 1. Why

Workday v1's Focus mode ("Lock in") was meant to make 15+ parallel PRs
manageable. In practice it makes the engineer feel *more* scattered than the
workflow it was meant to replace, which was switching between terminal windows
and picking whichever one caught their eye.

The causes we found:

| # | Problem | What it feels like |
|---|---|---|
| 1 | **No clear "next."** Items are sorted into tiers (Ship / Unblock yourself / Unblock others), not into a path through the work | "I have to re-decide the order every time I look" |
| 2 | **Stale and already-handled items.** Rows only clear when GitHub state changes | "I pushed the fix / handed it to Claude, and it still says *Fix CI*" |
| 3 | **Can't see what's new.** "3 unresolved threads" never says whether anything changed | "Which PRs have new comments since I last checked?" |
| 4 | **Intent isn't captured.** The real next step ("ask Claude about X") lives only in your head | "The list doesn't know what I'm actually doing" |
| 5 | **The list moves under you.** Each refresh re-ranks rows | "I go back to see what updated and lose the row I was working on" |

Why terminals worked better:

1. **Stable positions.** A tab stays where you put it, so you build spatial memory.
2. **Activity markers that don't steal focus.** A tab lights up, but you stay where you are.
3. **One thing on screen at a time.**
4. **You decide when something is done.**

Workday V2 brings those four back and adds a fast **look, decide, move on**
loop: a deck you can flip through, where each card shows just enough signal
to decide in about a second whether to work on it now.

## 2. Who it's for

Engineers who use AI heavily and run many PRs in parallel: their own feature
PRs (often several per Jira ticket), plus review requests from teammates. The
bottleneck is no longer typing code. It's **human attention**: knowing which of
15 threads needs you, and getting back to the one you were on.

## 3. Product principles

These are the tie-breakers for every detail below.

1. **Nothing moves unless you move it.** Data refreshes never reorder anything.
   Only your own actions (marking current, closing) change positions.
2. **Show change, don't reshuffle.** New activity is a dot and a quote, never a
   jump in position.
3. **One thing in focus, everything else in your peripheral vision.** The card
   is the focus; the rail is the overview you can glance at.
4. **Light touch.** Every personal action is a single keystroke and always
   optional. Untouched items still look correct.
5. **Keyboard first, mouse friendly.** Every action has a key. ⌘K reaches all of
   them.
6. **No new network cost.** Built from data the app already fetches. Nothing
   loads that isn't shown.
7. **No tracking overhead.** No Claude session detection and no "delegated"
   states. The user explicitly rejected these as too much overhead.

## 4. Scope

- A **new page, WorkdayV2**, alongside the existing Workday. v1 is untouched so
  the user can compare them and decide later.
- WorkdayV2 has the same **Focus | Standup** toggle as v1.
  - **Focus**: the ticket deck. All new.
  - **Standup**: reuses v1's `StandupMode` as-is, with the same sections, notes
    and copied text.

### Out of scope

- Write actions on GitHub or Jira (merge, request review, transition). The page
  stays read-only towards external systems. Personal state is local.
- Detecting Claude Code sessions, worktrees, or "with Claude" states.
- Replacing or removing Workday v1.
- Syncing deck state across devices (it lives in localStorage).
- Changes to the copied standup format.

---

## 5. The experience

### 5.1 Layout

```
┌ Workday V2 ─ 10 tickets · 2 current · 4 updated ───────── ⌘K find & act   [Focus|Standup] ┐
├──────────────────────────┬─────────────────────────────────────────────────────────────────┤
│ ▶ CURRENT            2   │            ┌─────────────────────────────────────┐ ← peeking   │
│ ▌412 Asset sync queue  ● │            │ CCP-412  Move asset sync to a queue │   cards     │
│ ▌    #1203 Conflict · 2… │            │ 3 PRs · 1 current · updated 4m      │             │
│ ▌401 Webhook retry     ● │            │ ▶ #1203 backend: queue worker       │             │
│ OPEN                 8   │            │   ✗ Conflict  2 threads  CI ✓       │             │
│ ▌388 Bulk tag editor     │            │   ● tomas 4m: "should retry be…"    │             │
│ ▌395 Image crop  review ●│            │   📝 ask Claude why retry is sync    │             │
│ ▌399 Audit log export    │            │   #1207 frontend  ✓ Ready to merge  │             │
│ ...                      │            │   #1210 infra     ⏳ tomas · 1d      │             │
│ CLOSED · 3           ▸   │            └─────────────────────────────────────┘             │
│                          │             ← back      Space · I'm on it      skip →           │
├──────────────────────────┴─────────────────────────────────────────────────────────────────┤
│ ←→ back/skip  ↑↓ pick PR  Space current  ⏎ open  . note  x close  n next updated  ⌘K       │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Rail**: always expanded, fixed width (about 268px), scrolls on its own.
- **Stage**: the card is centred, `max-width: 600px`, and never stretched to
  fill the screen. Two "ghost" cards peek behind it to hint that there's a deck.
- **Key hint bar**: a single line at the bottom. It can be hidden from ⌘K
  ("Hide key hints"), and that choice is persisted.
- **Header**: title, a summary line (`N tickets · N current · N updated`), a ⌘K
  hint, the mode toggle, and Refresh.
- **Narrow screens (< 900px)**: the rail collapses to keys, stripes and dots
  only (the "slim rail" from the mockups). Hovering or focusing expands it as
  an overlay.

### 5.2 Tabs: what's in the deck

A **tab is a Jira ticket.** It holds:

- my open PRs that reference the ticket (including drafts),
- PRs on the ticket where my review is requested or re-requested, or where
  there are new commits since my non-approving review,
- or nothing yet: a ticket **assigned to me and in progress** with no PR shows
  as a "No PR yet" tab.

A PR with no ticket key becomes its **own tab** (`ticketId = pr:<html_url>`),
labelled with `repo#number` and the PR title.

A ticket with my PRs *and* someone else's PR that I'm reviewing is **one tab**.
Rows for PRs I'm reviewing are marked `review` and show the author.

The tab label is the ticket summary from Jira, falling back to the first PR's
title with the key stripped (`titleWithoutKey`).

### 5.3 Rail

Three groups, top to bottom:

| Group | Contents | Order |
|---|---|---|
| **▶ Current** | Tickets with at least one current item | Order you marked them (newest at the bottom) |
| **Open** | Everything else that's open | **Arrival order**: when the ticket first appeared in the deck. New tickets go at the end |
| **Closed · N** (folded by default) | Tabs you closed | Most recently closed first |

Each rail row has:

```
▌ 412  Move asset sync to a queue   [review]   ●
▌      #1203 Conflict · 2 new comments
```

- **Stripe** (left, 3px): the worst tone across the ticket's PRs (see 5.5).
- **Key** (mono, accent colour), shortened to the number when every ticket in
  the deck shares one project prefix. Otherwise the full key.
- **Title**, truncated with an ellipsis. The full title is in a tooltip.
- **`review` chip**: shown when *every* PR on the tab is one I'm reviewing.
- **Status line**: the PR that needs me most and its headline signal, plus
  "N new comments" if there are any unseen. "No PR yet" for PR-less tickets.
- **Activity dot** (blue): at least one PR on the tab has unseen activity.
- **Selected row**: raised background. **Current rows**: faint amber outline.

Rows move **only** when I mark or unmark current (Current ↔ Open), close or
reopen (Open/Current ↔ Closed), or when a ticket arrives or leaves because of
merges or closures. Refreshing data never reorders anything.

Clicking a row selects that ticket and shows its card. Clicking a row in
**Closed** reopens it into its original arrival position, then selects it.

### 5.4 Card

```
CCP-412  Move asset sync to a queue                       [In Progress]
3 PRs · 1 current · updated 4m ago

┃▶ #1203  backend: queue worker + retry                           4m
┃         ✗ Conflict with main   2 open threads   CI ✓
┃         ● tomas 4m: "should the retry here be async? …"
┃         📝 ask Claude why retry is sync
   #1207  frontend: sync progress UI                               2h
          ✓ Approved · abu   CI ✓   Ready to merge
   #1210  infra: SQS queue config                                  1d
          ⏳ Waiting on tomas · 1d   CI ✓
```

**Header**
- Ticket key (clicking opens the Jira drawer), summary, and Jira status pill.
  An off-sprint ticket also gets the dashed **Off-sprint** pill from v1.
- Sub-line: `N PRs · N current · updated <relative>`, using the newest PR's
  `updated_at`.
- Unseen **Jira mentions** on this ticket show as a quote under the header.

**PR rows**, in this order: current PRs first, then by "needs me" priority
(5.5), then newest first.

Each row has:
- the ▶ current marker (amber; the row gets an amber border and tint),
- `#number` and the title (key stripped), plus the author when it isn't mine,
- **signal chips** (5.5), at most four, with "+N" and a tooltip for the rest,
- **the newest unseen comment**, if any: author, age and a one-line snippet,
  with a blue dot. Clicking it opens the comment on GitHub,
- **my newest unresolved note** for the PR (📝), from the notes service,
- the age (`compactAge(pr.updated_at)`) on the right.

The **selected PR** (↑/↓) has a focus outline. Space, ⏎, `.`, and copy actions
apply to it. When a card opens, the first current PR is selected. If there's
none, the top row is.

A "No PR yet" ticket shows the header, the Jira status, and a single line,
"No PR yet". Space marks the *ticket* current.

**Peeking cards.** The two ghosts behind the card are decorative. Going → plays
a short slide (≤150ms, disabled when `prefers-reduced-motion` is set).

### 5.5 Signals

Signals reuse v1's rules (`ACTIONABLE_REASONS` / `selfNeeds`, `myPRState`,
`readyToMerge`, `reviewingState`) so v1 and v2 never disagree.

**My PRs**

| Signal chip | Tone | Rule |
|---|---|---|
| ✗ CI failing: `lint + unit` | danger | `ciFailing(pr)`. Check names from `failingChecks` |
| ✗ Conflict with `<base>` | danger | `pr.has_conflict` |
| ✗ Changes requested (· N threads) | danger | `review_status === "CHANGES_REQUESTED"` |
| N open threads | warning | `unresolved_thread_count > 0` (when not already folded into Changes requested) |
| No reviewer | warning | `noReviewer(pr)`, non-draft |
| ✓ Ready to merge | success | `readyToMerge(pr)` |
| ✓ Approved · `<who>` | success | approved but not ready (CI pending, etc.) |
| In merge queue | purple | `pr.in_merge_queue` |
| ⏳ Waiting on `<reviewers>` · age | neutral | requested reviewers, nothing above applies |
| Draft | neutral | `pr.draft` (review signals are suppressed) |
| CI ✓ / CI … | neutral | shown as context alongside the above, never on its own |

**PRs I'm reviewing**

| Signal chip | Tone | Rule |
|---|---|---|
| Re-requested by `<author>` | warning | requested and `viewer_engaged` |
| New commits since your review | warning | `new_commits_since_review` and my latest review isn't APPROVED |
| Review requested · +A −D | info | requested, not engaged. Includes diff size |

**"Needs me" priority** (for the rail status line, PR order on the card, and
the ticket stripe):

```
danger (my blocked PRs) > warning (re-requests, threads, no reviewer, new commits)
  > info (fresh review requests) > success (ready to merge / approved)
  > purple (merge queue) > neutral (waiting / draft / no PR yet)
```

Ties go to the PR with unseen activity, then the newest.

### 5.6 Current ("I'm on it")

- **Space** toggles current on the selected PR (or on the ticket when it has no
  PRs). This is the "yes" in the look-and-decide loop. It does nothing else: no
  copy, no navigation.
- I can have **any number** of current items, across tickets and within one
  ticket.
- The first current item on a ticket moves the ticket into **▶ Current**
  (appended at the bottom of the group). Unmarking the last one returns it to
  **Open** at its original arrival position.
- A current PR that merges or closes is removed from current automatically. The
  ticket stays if it still has other PRs.
- The header summary counts current tickets.

### 5.7 Moving through the deck

- **→ / ←**: next or previous ticket in *rail order* (Current, then Open).
  Wraps around. Skips Closed. Skipping is pure navigation; it changes nothing.
- **n**: the next ticket (in rail order, after the selected one) with unseen
  activity. If there's none, a quiet toast says "Nothing new".
- **↑ / ↓**: the previous or next PR on the card.
- Clicking a rail row jumps straight to it.
- The selected ticket is remembered across reloads. If it has gone, the first
  ticket is selected.

### 5.8 Seen and new activity

- A PR has **unseen activity** when `pr.updated_at > seen[pr]`.
- **Marking seen**: when a card has been on screen for **1.5s** while the window
  is visible (`document.visibilityState === "visible"`), every PR on it is
  marked seen as of that PR's `updated_at`. Opening a PR (⏎) marks that PR seen
  immediately.
- **u** marks the selected PR unread again.
- **First run and new arrivals.** On the very first load (empty state), every
  current item is seeded as seen, so the deck starts calm. After that, a PR
  that newly appears (a new PR, or a new review request) starts **unseen**.
- **The unseen comment quote** is the newest entry in `githubMentions` (which
  includes other people's non-bot comments on my PRs) for that PR with
  `created_at > seen[pr]`. Jira mentions attach to the ticket the same way.
- **Unmatched mentions** (on PRs or tickets that aren't in the deck) appear in
  ⌘K's "Updated since you looked" group.

> Known approximation: `updated_at` also changes on label edits and bot
> activity, so a dot can light up for noise. If that turns out to be annoying,
> switch to comparing the newest non-bot comment, commit, check or review time.

### 5.9 Closing and reopening

- **Automatic close**: a PR leaves the deck when it's merged or closed, or when
  my review request is fulfilled (submitted, not re-requested, no new commits
  since a non-approving review). A ticket tab disappears when it has no PRs
  left and isn't in progress and assigned to me.
- **Manual close**: `x` closes the selected tab into **Closed**. Selection
  moves to the next ticket.
- **Reopen** happens when any of these is true:
  - any PR on the ticket has `updated_at > closedAt` (new activity),
  - a new PR or review request joins the ticket,
  - I click it in the Closed group,
  - I pick it in ⌘K, or use "Reopen" on it.
- A reopened tab goes back to its **original arrival position**. Closing never
  rewrites arrival order.

### 5.10 Notes

- `.` opens an inline one-line composer under the selected PR row. ⏎ saves and
  Esc cancels.
- Notes are saved through the existing notes service: `type: "github_pr"`,
  `reference_id: prNoteKey(pr)`. That way they also appear in the Notes tab and
  in v1's note counts.
- The card shows the newest unresolved note for each PR. Clicking it opens the
  existing note editor.
- For "No PR yet" tickets, the note uses `type: "jira_ticket"`,
  `reference_id: <KEY>`.

### 5.11 ⌘K: find and act

Opened with ⌘K / Ctrl+K from anywhere on the page. Esc closes it.

**Empty query**
1. **Updated since you looked**: unseen items, newest first, including
   unmatched mentions. ⏎ jumps to the ticket (or opens the mention).
2. **Commands**: Next updated ticket (`n`), Show only current (`g c`, filters
   the rail to Current until cleared), Show closed, Refresh (`r`), Switch to
   Standup / Focus (`S` / `F`), Hide or show key hints.

**Typing**
- Fuzzy matches against: ticket key, ticket summary, PR number (`1199`,
  `#1199`, `repo#1199`), PR title, author, requested reviewers, repo name and
  branch name. Closed tabs are included, marked "closed".
- **Pasted links** jump straight to the item:
  - GitHub PR URLs (any sub-path: `/files`, `/commits`, `#discussion_r…`),
    parsed with the existing `normalizeNoteRef`,
  - Jira URLs (`/browse/KEY`, `?selectedIssue=KEY`) and bare keys.
- **Not in the deck?** The result still shows. ⏎ opens the PR in the existing
  `PRDetailModal` (fetched on demand through `getPrDetail`) or the ticket in
  the Jira drawer.

**Actions on the selected result** (listed under it, each with its own
shortcut that works while the palette is open):

| Action | Key |
|---|---|
| Jump to card | ⏎ |
| Toggle "I'm on it" | Space (when the query is empty), or ⌘⇧Space |
| Open PR (modal) | ⌥⏎ |
| Open on GitHub | ⌘⏎ |
| Copy branch name | ⌘B |
| Copy PR link | ⌘L |
| Add note… | ⌘. |
| Close / Reopen tab | ⌘⌫ |
| Mark unread | ⌘U |

**Tab** cycles focus between results and actions. Footer hints show
`↑↓ move · ⏎ jump · Tab actions · esc close`.

### 5.12 Full keyboard map (Focus mode)

| Key | Action |
|---|---|
| → / ← | Next / previous ticket |
| ↑ / ↓ | Next / previous PR on the card |
| Space | Toggle "I'm on it" on the selected PR or ticket |
| ⏎ | Open the selected PR in the PR modal |
| ⌘⏎ | Open the selected PR on GitHub |
| `.` | Add note to the selected PR |
| `x` | Close tab |
| `u` | Mark the selected PR unread |
| `n` | Next ticket with unseen activity |
| `g c` | Show only current (toggle) |
| `r` | Refresh |
| ⌘K | Finder |
| `F` / `S` | Focus / Standup mode |
| `?` | Show the shortcut sheet |

Shortcuts are ignored while typing in an input, textarea or contenteditable,
and while the PR modal, Jira drawer or note editor is open. They must not
collide with the app's global ⌘-digit tab shortcuts in `useKeyboardShortcuts`.

### 5.13 Empty, loading and error states

- **Loading (first load)**: the rail shows 6 skeleton rows and the stage shows
  a card skeleton. Later refreshes keep showing existing data. A small spinner
  in the header shows a refresh is in progress.
- **Empty deck**: the stage says "Nothing open. Nice." and lists the counts of
  Closed tabs and assigned not-started tickets, with links to "Show closed" and
  "Switch to Standup".
- **All open tickets are current**: Open is hidden. Current shows normally.
- **Source error** (GitHub or Jira): a one-line inline banner at the top of the
  rail ("Jira unavailable, showing PRs only · retry"). Other sources keep
  rendering.
- **Not configured**: the existing app-level setup prompt. Hooks wait on
  `configured` (see memory: data hooks gate on configured).

### 5.14 Accessibility

- The rail is a `listbox` with `aria-activedescendant` for the selected ticket.
  Group labels use `role="group"` with `aria-label`.
- The card is a `region` labelled with the ticket key and title. PR rows are
  `option`s inside a listbox for ↑/↓.
- Every status uses text plus colour, never colour alone. Dots have an
  `aria-label` of "new activity".
- The ⌘K palette follows the combobox pattern (`role="combobox"` + `listbox`).
- Animations respect `prefers-reduced-motion`.
- Mouse clicks blur the row so the focus ring doesn't stay visible after a
  modal closes (same fix as v1, commit 62a5ec8).

### 5.15 Visual language

- It follows the app's existing tokens, `Badge` tones (`danger`, `warning`,
  `info`, `success`, `purple`, `neutral`), and its dark and light themes.
- Amber is reserved for **current**, blue dots for **unseen**, and the stripe
  colours for **state**. No other decorative colour.
- Mono font for keys and PR numbers. The rail and card share the same type
  scale.
- Any success confirmations ("Copied branch", "Note saved") use the existing
  bottom-fixed toast, never inline alerts that shift layout (see memory: no
  layout-shift confirmations).

---

## 6. Data

### 6.1 Inputs (no new requests)

| Input | Source | Used for |
|---|---|---|
| `openPRs` | `useDashboard` | my PRs |
| `reviewRequests` (with `viewer_engaged`) | `useDashboard` | requested / re-requested reviews |
| `reviewingPRs` (with `viewer_review_state`, `new_commits_since_review`) | `useDashboard` | re-review on new commits |
| `assignedJiraIssues`, `jiraIssues` | `useDashboard` | in-progress tickets, summaries, status, off-sprint |
| `githubMentions` | `useDashboard` | unseen comment quotes, mentions |
| `jiraComments` (mentions) | `useDashboard` | ticket mention quotes |
| `notes` | `useNotes` / `NotesContext` | 📝 notes |
| `workday` extras | `useWorkdayExtras` | Standup mode only |

WorkdayV2 takes the same props as `WorkdayView` (see `App.tsx`), so it is wired
the same way and shares the `PAGE_REFRESH.workday` sources.

### 6.2 Composition: `buildDeck`

A pure function with full unit tests, like `buildWorkday` / `buildFocus`:

```ts
buildDeck(inputs: DeckInputs, state: DeckState, now: Date): DeckData

interface DeckData {
  current: DeckTicket[];   // rail group order
  open: DeckTicket[];      // arrival order
  closed: DeckTicket[];    // most recently closed first
  unmatched: MentionItem[];// mentions not attached to any tab (for ⌘K)
  counts: { tickets: number; current: number; unseen: number };
}

interface DeckTicket {
  id: string;              // Jira key, or "pr:<html_url>"
  key: string | null;
  title: string;
  ticket: TicketRef | null;// status, off-sprint, updated
  prs: DeckPR[];           // card order (5.4)
  stripe: BadgeVariant;    // worst tone
  status: string;          // rail status line
  reviewOnly: boolean;
  unseen: boolean;
  current: boolean;        // any item current
  jiraMention: MentionItem | null;
}

interface DeckPR {
  pr: GitHubPR;
  mine: boolean;
  signals: Signal[];       // ordered, worst first
  priority: number;        // "needs me" rank (5.5)
  unseenComment: MentionItem | null;
  note: Note | null;
  current: boolean;
  unseen: boolean;
}

interface Signal { label: string; tone: BadgeVariant; detail?: string }
```

Steps:
1. Collect PRs: `openPRs` (mine), plus `reviewRequests`, plus the
   `reviewingPRs` that qualify for re-review. De-duplicate by `html_url`, with
   "mine" winning.
2. Group by `ticketKeyOf(pr)`. Ticketless PRs become singleton tabs.
3. Add in-progress assigned tickets that have no PRs.
4. Compute signals, priority, the unseen flag, the unseen comment and the note
   for each PR. Then compute the stripe, status, `reviewOnly` and `unseen` for
   each ticket.
5. Split into groups using `state.current`, `state.closed` and `state.arrival`,
   applying the reopen rules (5.9) as a *derived* result. The caller persists
   any resulting state changes (see 6.3).

`buildDeck` never mutates state. It returns `DeckData` plus a `stateUpdates`
patch: new arrivals, auto-reopens, pruned PRs and pruned current entries. The
hook applies that patch.

### 6.3 Personal state: `useDeckState`

Stored in localStorage under one versioned key, `dev-home-workday-v2`
(JSON, `{ v: 1, ... }`):

| Field | Type | Meaning |
|---|---|---|
| `arrival` | `Record<ticketId, number>` | Monotonic sequence number from the first time the tab appeared. Never rewritten. Absent tabs are pruned after 30 days |
| `current` | `string[]` | Ordered ids: `pr:<url>` or `ticket:<KEY>` |
| `currentTickets` | `string[]` | Ticket ids in the order they entered ▶ Current |
| `seen` | `Record<prUrl, iso>` | `updated_at` value as of my last look |
| `closed` | `Record<ticketId, iso>` | Closed at |
| `selected` | `string \| null` | Last selected ticket id |
| `seeded` | `boolean` | First-run seeding done (5.8) |

UI preferences (key hints hidden, "show only current") use the existing
`usePersistedState` hook with their own keys.

The hook exposes `toggleCurrent`, `markSeen`, `markUnread`, `close`, `reopen`,
`select` and `applyUpdates`. Writes are batched so a refresh produces one
write.

### 6.4 Notes integration

`useNotes` / `NotesContext` already provides `addNote` and the unresolved
notes. Index notes by `normalizeNoteRef(reference_id)` (as
`usePRNoteCounts` does) to find each PR's newest one.

---

## 7. Components and files

All new code goes in `src/views/workdayV2/`. Imports from `src/views/workday/`
for shared logic and Standup.

| File | Responsibility |
|---|---|
| `WorkdayV2View.tsx` | Shell: header, mode toggle, refresh, shared `PRDetailModal`, toast, keyboard layer. Renders `DeckMode` or v1's `StandupMode` |
| `DeckMode.tsx` | Rail + stage layout. Owns the selection and the ↑/↓ PR focus |
| `DeckRail.tsx` | The three groups, rows, the folded Closed group, and the source-error banner |
| `DeckRailRow.tsx` | One rail row (stripe, key, title, chip, status, dot) |
| `DeckCard.tsx` | Card header plus PR rows, and the "No PR yet" variant |
| `DeckPRRow.tsx` | Signals, unseen comment quote, note, current marker, inline note composer |
| `CommandPalette.tsx` | ⌘K: search, link parsing, results, actions, commands |
| `buildDeck.ts` | Pure composition (6.2) |
| `signals.ts` | PR → `Signal[]` and priority, built on v1's `prState` / `prCategories` |
| `deckSearch.ts` | Fuzzy matching and link/number parsing for ⌘K |
| `useDeckState.ts` | Persisted personal state (6.3) |
| `useDeckKeys.ts` | Focus-mode keyboard map (5.12), with the input/modal guards |
| `useSeenTimer.ts` | The 1.5s visible-dwell rule that marks a card seen |
| `deck.css` | Styles, using existing tokens |

App wiring:
- `src/config/navTabs.ts`: add `{ key: "workday-v2", label: "Workday V2" }`
  after Workday.
- `src/App.tsx`: a lazy import plus a render branch with the same props as
  `WorkdayView`, and an icon entry.
- `PAGE_REFRESH`: reuse the `workday` sources for `workday-v2`.

Refactors allowed so v1 and v2 share logic (with no behaviour change to v1):
- Export `selfNeeds` and `failingChecks` from `buildFocus.ts`, or move them
  into `prState.ts`.
- Export `StandupMode`'s required props cleanly if it currently depends on
  `WorkdayView` internals.

---

## 8. Phases (each one shippable)

1. **Skeleton deck.** The page, nav tab, mode toggle with Standup reused,
   `buildDeck` (grouping, signals, priority, stripe, status), and a read-only
   rail and card. ←/→ and ↑/↓ work. No persisted state yet; arrival order is
   by `created_at`.
2. **Personal state.** `useDeckState`: arrival order, current (Space plus the
   Current group), close and reopen (plus the Closed group), seen dots with the
   dwell timer, `u`, `n`, and first-run seeding. The selection persists.
3. **Context on the card.** Unseen comment quotes, Jira mention quotes, notes
   display plus the `.` composer, off-sprint pill, and the "No PR yet" variant.
4. **⌘K.** Search, link and number parsing, actions with shortcuts, commands,
   unmatched mentions, and opening PRs that aren't in the deck through
   `getPrDetail`.
5. **Polish.** Peeking-card motion, slim rail on narrow screens, the empty,
   loading and error states, the `?` shortcut sheet, a hideable key-hint bar,
   and an accessibility pass.

## 9. Testing

**Unit (Vitest)**
- `buildDeck.test.ts`:
  - grouping by ticket, including mixed mine/review on one ticket
  - ticketless singletons and "No PR yet" tickets
  - de-duplication across `openPRs`, `reviewRequests` and `reviewingPRs`
  - the `reviewOnly` flag
  - PR order on the card
  - stripe as the worst tone, and the rail status line text
  - arrival order is stable across refreshes with re-sorted inputs
  - current group ordering, and unmarking returns a ticket to its arrival slot
  - auto-close on merge, closure or a fulfilled review
  - reopen on new `updated_at` and on a new PR joining
  - pruning of current entries for merged PRs
  - first-run seeding, and new arrivals start unseen
  - the unseen comment picks the newest after `seen`
  - unmatched mentions
- `signals.test.ts`: every row of the 5.5 tables, the draft suppression, the
  "+N" cut-off and the priority order.
- `deckSearch.test.ts`:
  - GitHub URL variants (`/files`, `#discussion_r…`, query strings)
  - Jira `/browse/` and `selectedIssue`
  - bare key, `#123`, `repo#123`
  - fuzzy ranking: exact key or number first
- `useDeckState.test.ts`: persistence round-trip, version key, batching and
  pruning after 30 days.
- `useSeenTimer.test.ts`: fake timers. Marks after 1.5s, not when hidden, and
  resets on card change.

**Component (Testing Library)**
- `WorkdayV2View.test.tsx`:
  - the mode toggle and Standup rendering
  - ←/→ wraps and skips Closed
  - Space moves a ticket into Current and back
  - `x` closes, and clicking a Closed row reopens in place
  - keys are ignored in inputs and while the modal is open
  - ⌘K opens, a pasted URL jumps, and the action shortcuts fire
  - the empty state and the source-error banner
- Regression: v1 Workday tests keep passing unchanged.

**Manual and visual**
- Run the app with real data (`run` skill) and check, in both light and dark
  themes:
  - with 15+ PRs, the rail never reorders on refresh
  - the card stays at 600px on a wide screen
  - the slim rail below 900px
  - reduced motion

## 10. Success criteria

- From opening the page, the user can say "what I'm on and what's next" in
  **under 5 seconds**.
- The ticket the user is working on **never changes position** because of a
  refresh.
- Finding a PR someone mentions in Teams takes **⌘K plus a paste plus ⏎**.
- After handing something off, the user can **close it in one key** and trust
  it to come back when something happens.
- The user prefers V2 over V1 after a week of daily use. That's the decision
  this page exists to inform.

## 11. Open questions and risks

| Item | Plan |
|---|---|
| `updated_at` noise lighting up dots | Measure in daily use. If noisy, compare against the newest non-bot comment, commit or check time |
| 1.5s dwell might feel too eager or too slow | Make it a constant. Tune after use |
| Many review requests from other teams flooding the deck | Watch it. A possible later filter: "reviews from my team only" |
| Tickets with 5+ PRs make a tall card | The card scrolls internally past about 70vh. Revisit if common |
| localStorage state lost when switching browsers | Accepted (out of scope). The deck reseeds calmly on first run |
| Project-prefix shortening is ambiguous with multiple projects | Only shorten when every ticket shares one prefix |
| Browsers may reserve ⌘L / ⌘B / ⌘K in the web build | Check during phase 4. If a browser grabs one, fall back to plain letter keys inside the palette (`b`, `l` when the query is empty) |
