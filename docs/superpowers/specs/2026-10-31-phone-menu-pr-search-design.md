# Phone: app menu, deck bar, PR search

Date: 2026-10-31 · Status: design agreed (mockups: `.superpowers/brainstorm/…/phone-nav.html`, option A)

## Goal

On a phone, Dev Home is Workday Focus alone. Give it a way to reach other pages, starting with a
PR search, and give the deck a pinned header that says how much is on it.

## Scope

In:

1. The top bar's ☰ becomes an app menu (drawer): **Workday**, **PR search**, **Settings**.
2. The Tickets drawer button moves from the top bar into a **deck bar** pinned at the top of the
   deck, with "**5** Jira tickets · **15** PRs open" at its right end.
3. A phone **PR search** page: All PRs' filters and data, results as Workday PR cards with the
   author always shown.

Out (for now): other menu items (Team, Notes, Issue search); saved filters on the phone (they
aren't synced across devices, so the phone has none); any desktop UI change.

## 1. App menu

- `App.tsx` owns the top bar's left cell on a phone: a ☰ button (`IconMenu2`, no count) that opens
  a new `PhoneMenu` drawer (react-bootstrap `Offcanvas`, `placement="start"`, like the Tickets
  drawer). Back closes it (`useBackClose`).
- Items, each an icon + label: Workday (`IconSun`, as in the sidebar), PR search (`IconSearch`),
  a separator, Settings (`IconSettings`). The current page gets the faint accent tint (the
  SegmentedTabs selected style). Picking an item sets the active tab and closes the drawer.
- PR search shows only when `isTabVisible("org-prs", …)`: a GitHub org is configured and All PRs
  isn't hidden in Settings.
- The Settings gear stays in the top bar too.
- The `topBarStart` portal (WorkdayView's rail button in the top bar) goes away.

## 2. Deck bar (Workday Focus, phone)

- A bar at the top of `deck-mode--phone`, above the carousel. The deck column doesn't scroll (each
  slide scrolls its own card), so the bar stays put without `position: fixed`.
- Left: the Tickets button, moved here from the top bar. It keeps its look and count and gets a
  list icon (`IconListDetails`) so it isn't confused with the menu's ☰. It opens the same drawer.
- Right: "**N** Jira tickets · **M** PRs open", muted text with bold numbers, from a pure helper
  `deckCounts(rail)` over the tickets the drawer lists:
  - Jira tickets = rail tickets with a Jira key;
  - PRs open = distinct open PRs on them (by `html_url`; mine and the ones I review; merged ones
    don't count).
  - Singular forms: "1 Jira ticket", "1 PR open".
  - While the deck's first load is still skeletons, the bar shows the button without counts.

## 3. PR search (phone)

Route: the existing `org-prs` tab. `effectiveTabFor` lets a phone through to `workday`,
`settings`, and `org-prs` when visible; anything else still falls back to `workday`.

`App` renders `PhonePRSearch` instead of `OrgPRsView` on a phone. Layout, top to bottom (the page
scrolls in `main-content`, so pull to refresh works):

- Title "PR search".
- `Open | Merged` (SegmentedTabs), remembered like desktop (`dev-home-org-prs-subtab`).
- A row of filter chips, each opening a bottom sheet (`Offcanvas placement="bottom"`, Back
  closes it):
  - **Authors**: "Anyone", "shunjid", or "3 authors". The sheet has a search box and a checkbox
    row per org member (avatar + login), selected first.
  - **Repos**: "All repos", "cmp-server", or "2 repos". The same sheet pattern over org repos.
  - Chips with a value set get the accent tint.
- A count line: "14 open PRs" / "6 merged PRs".
- Results as `DeckPRRow` cards (one per PR, in a `role="listbox"`), with the author always shown
  next to repo#number. Tapping one opens `PRDetailModal`.
- **Load more** at the bottom when the open search has a next page (single author/repo only, as
  on desktop).
- No authors or repos picked: an empty state, "Pick authors or repos to search", with the
  Authors and Repos chips still above it.

Chips per PR (`searchPR(pr, now)`, a pure helper that builds the `DeckPR`):

- open PRs: `mySignals(pr, now)`, the PR's next step from its author's side ("⏳ Waiting for
  review · 2d", "✗ Fix CI: …", "✓ Approved", …), since a searcher wants to know where a PR
  stands. Merge stays limited to my own ready PRs (`useCanMerge` already checks).
- merged PRs: one purple "Merged 2d ago by x" chip, like Workday's merged tabs (extract
  `mergedDeckPR`'s chip into a shared helper).
- No unseen dot, note, quote, or "current" label.

Refresh: pull to refresh and the top-bar Refresh call `refresh([])`, which bumps `refreshKey`
(the search reloads open and merged PRs on it, as desktop does). `PhonePRSearch` reports its
loading through `onLoadingChange`, which App uses for the spinner and the pull indicator.

## Shared code changes

- **`useOrgPRSearch` hook** (new, `src/views/orgPRs/useOrgPRSearch.ts`): the search state
  `OrgPRsView` keeps today (members, repos, authors, selected repos, open PRs with paging and the
  localStorage caches, merged PRs, the open/merged sub-tab, `refreshKey` handling). `OrgPRsView`
  keeps its UI and uses the hook, with no behavior change; `PhonePRSearch` uses the same hook.
  Saved filters stay in `OrgPRsView` (desktop only), applying through the hook's author and repo
  setters.
- **`DeckPRRow`**: a new `alwaysShowAuthor` prop. Default off, so Workday is unchanged.
- **`effectiveTabFor`**: phone allow-list as above.

## Testing

- `effectiveTabFor`: phone allows `org-prs` when visible, falls back to `workday` when it isn't
  (no org, or hidden), and still allows `settings`.
- `deckCounts`: Jira-keyed tickets only; open PRs de-duplicated; merged excluded; singular forms.
- `PhoneMenu`: lists the three items, hides PR search when not visible, marks the current page,
  navigates and closes.
- Deck bar: the Tickets button opens the drawer; the counts render.
- `searchPR`: open → author-side chips; merged → the merged chip.
- `DeckPRRow`: `alwaysShowAuthor` shows my own login; default still hides it.
- `useOrgPRSearch` (mocked services): first page on filter change, multi mode for >1 author or
  repo, load more, merged list, reload on `refreshKey`.
- `PhonePRSearch`: empty state; chips' labels; a sheet picks authors and updates the search;
  results render as cards with authors; load more; tapping a card opens the PR modal.
- Desktop `OrgPRsView` keeps working after the hook extraction (smoke test: renders with cached
  filters and shows results; applying a saved filter still sets authors and repos).
