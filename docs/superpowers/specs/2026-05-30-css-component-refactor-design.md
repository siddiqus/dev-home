# CSS + Component Refactor Design

**Date:** 2026-05-30
**Status:** Approved, ready for implementation plan

## Problem

`src/index.css` is a 2032-line monolith covering every styling concern in the app: resets, Bootstrap overrides, layout, every component variant, a separate "Light Mode Overrides" section (~365 lines) that duplicates structure from the dark theme, plus view-specific blocks for the description modal, Tiptap editor, form controls, and the Kanban board.

Symptoms:

- Hardcoded color hex codes (`#0d1117`, `#161b22`, `#c9d1d9`, etc.) are repeated throughout the file. Changing the theme palette requires hunting through ~2000 lines.
- Light-mode rules live at the bottom of each section, not next to the dark-mode rules they override. Adding a new component requires remembering to update two places.
- View-specific selectors are intermixed with generic primitives. There is no boundary between "Card styling" and "Summary view layout."
- Reusable visual patterns (cards, badges, status dots, branch tags, avatars, section headers, empty states, "see more" buttons, comment cards) are CSS-only — every consumer hand-writes the markup.
- Four view components are large enough to be hard to reason about: `SummaryView` (482 lines), `KanbanBoard` (443), `OrgPRsView` (409), `NoteEditorModal` (387). Their CSS is also embedded in `index.css` instead of co-located.

## Goals

1. `src/index.css` shrinks to a small set of `@import`s — no rules of its own.
2. All theme-able values are CSS custom properties defined in one file. The "Light Mode Overrides" section is deleted entirely.
3. Repeating UI patterns become small reusable React primitives with co-located CSS.
4. The four large views are split into focused subcomponents, each in its own folder with co-located CSS.
5. The app looks visually identical in both themes before and after the refactor.

## Non-Goals

- No framework swap (Bootstrap stays; overrides just move into their own file).
- No move to CSS Modules, Tailwind, or CSS-in-JS. Plain co-located CSS, matching the existing pattern in `MultiSelectDropdown.css` and `SavedFiltersDropdown.css`.
- No behavior changes. This is a structural refactor only.
- No new features, no test infrastructure changes.

## Target file structure

```
src/
  index.css                          # 10-line file that @imports styles/index.css
  styles/
    index.css                        # imports tokens, reset, bootstrap-overrides, utilities
    tokens.css                       # all design tokens (colors, spacing, radius, z, shadow)
    reset.css                        # box-sizing reset, html/body/#root, base font, scrollbar
    bootstrap-overrides.css          # only what we override on Bootstrap classes
    utilities.css                    # truly generic helpers (.truncate, .muted, etc.)
  components/
    primitives/                      # NEW — pure presentational components
      Card.tsx + Card.css
      Badge.tsx + Badge.css
      StatusDot.tsx + StatusDot.css
      Avatar.tsx + Avatar.css
      BranchTag.tsx + BranchTag.css
      SectionHeader.tsx + SectionHeader.css
      SeeMoreButton.tsx + SeeMoreButton.css
      CommentCard.tsx + CommentCard.css
      EmptyState.tsx + EmptyState.css   # existing EmptyState gets its own CSS
    [other existing components stay where they are, gain a sibling .css]
  views/                             # NEW — large views moved here, decomposed
    summary/
      SummaryView.tsx
      SummaryItem.tsx
      TicketGroupHeader.tsx
      summary.css
    kanban/
      KanbanBoard.tsx
      KanbanColumn.tsx
      KanbanCard.tsx
      KanbanSearch.tsx
      kanban.css
    orgPRs/
      OrgPRsView.tsx
      [subcomponents]
      orgPRs.css
    notes/
      PersonalNotes.tsx
      NoteEditorModal.tsx
      [subcomponents]
      notes.css
      tiptap.css                     # Tiptap editor styles, isolated
    settings/
      SettingsView.tsx
      [subcomponents]
      settings.css
      formControls.css
```

## Design tokens

All hardcoded colors in `index.css` are mapped to CSS custom properties in `styles/tokens.css`. Naming is by **purpose**, not value, so the same token works in both themes.

Initial token set:

**Colors — surfaces and borders**
- `--color-bg-app`, `--color-bg-panel`, `--color-bg-elevated`, `--color-bg-hover`, `--color-bg-input`
- `--color-border`, `--color-border-strong`, `--color-border-subtle`

**Colors — text**
- `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-text-link`

**Colors — accent & status**
- `--color-accent`, `--color-accent-hover`
- `--color-status-success`, `--color-status-warning`, `--color-status-danger`, `--color-status-info`
- `--color-status-success-bg`, `--color-status-warning-bg`, etc. (translucent backgrounds)

**Spacing**
- `--space-1` (4px) through `--space-8` (32px)

**Radius**
- `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`

**Shadow**
- `--shadow-sm`, `--shadow-md`, `--shadow-lg`

**Z-index**
- `--z-sticky`, `--z-dropdown`, `--z-modal`, `--z-tooltip`

Tokens are defined on `:root` (dark default — matches current default behavior) and overridden in `[data-theme="light"]`. The existing theme-switching mechanism (`document.documentElement.setAttribute("data-theme", theme)` in `App.tsx:73`) is unchanged.

The entire "Light Mode Overrides" section (lines 729–1094 of current `index.css`) is **deleted**, replaced by per-token overrides in `tokens.css`. Per-component CSS files reference tokens only — they never hardcode a color and never have their own light-mode block.

## Reusable primitives

Each primitive is a small React component (props for content/variant only) with a co-located `.css` file. Class names are prefixed with the component name to avoid collisions (e.g., `.badge-status`, `.card-comment`).

| Primitive       | Replaces (current `index.css` section)         | Notes                                                              |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `Card`          | "Cards" (lines 100–116)                        | `variant` prop (default / elevated / interactive)                  |
| `Badge`         | "Badges" + "Status badge colors" (299–343)     | `variant` prop (success / warning / danger / info / neutral)       |
| `StatusDot`     | "Status indicator dot" + "Type indicator dots" | `variant` prop, optional label                                     |
| `Avatar`        | "Avatar" (572–586)                             | Size prop                                                          |
| `BranchTag`     | "Branch tag" (471–486)                         | Just text + icon                                                   |
| `SectionHeader` | "Section headers" (702–714)                    | Title + optional action slot                                       |
| `SeeMoreButton` | "See more button" (679–701)                    | Toggle button                                                      |
| `CommentCard`   | "Comment card" (652–667)                       | Author, body, timestamp                                            |
| `EmptyState`    | "Empty state" (556–571)                        | Existing component; gains a co-located CSS file with these styles  |

Each primitive's CSS file uses tokens only — no hardcoded colors.

## View decomposition

Each large view becomes a folder under `src/views/`. The top-level view component is now a thin composition; logic and markup move into focused subcomponents.

**`views/summary/`** — split `SummaryView` (482 lines):
- `SummaryView.tsx` — top-level layout, data fetching glue
- `SummaryItem.tsx` — single row in a summary group
- `TicketGroupHeader.tsx` — the existing ticket group header pattern
- `summary.css` — all summary-specific styles (currently in `index.css` lines 594–678)

**`views/kanban/`** — split `KanbanBoard` (443 lines):
- `KanbanBoard.tsx` — board layout + column orchestration
- `KanbanColumn.tsx` — single column
- `KanbanCard.tsx` — single card on the board
- `KanbanSearch.tsx` — search bar
- `kanban.css` — all kanban styles (currently `index.css` lines 1715–1935)

**`views/orgPRs/`** — split `OrgPRsView` (409 lines): subcomponents identified during implementation; folder shape identical to above.

**`views/notes/`** — group `PersonalNotes` (238) and `NoteEditorModal` (387):
- `PersonalNotes.tsx`, `NoteEditorModal.tsx`, plus subcomponents found during the split
- `notes.css` — notes-specific styles (currently `index.css` lines 1095–1332)
- `tiptap.css` — Tiptap editor styles (currently `index.css` lines 1333–1557), isolated so they only load with the editor in scope

**`views/settings/`** — group `SettingsView` (310):
- `SettingsView.tsx` plus subcomponents
- `settings.css` — settings-specific styles
- `formControls.css` — current "Form Controls" section (`index.css` lines 1558–1714)

Other existing components (`FindInPage`, `DescriptionModal`, `JiraComments`, etc.) gain co-located CSS files in `components/` but don't need view-level decomposition.

## Implementation phases

Designed for parallel agent execution after Phase A.

### Phase A — foundation (sequential, single agent, blocks everything else)

A1. Create `src/styles/` with `tokens.css`, `reset.css`, `bootstrap-overrides.css`, `utilities.css`, `index.css` (aggregator).
A2. Migrate every hardcoded color in current `index.css` to a token reference. Reset, layout, base body styles move to `reset.css`. Bootstrap-specific overrides move to `bootstrap-overrides.css`.
A3. Delete the "Light Mode Overrides" section (lines 729–1094 of current `index.css`); equivalent values now live as light-theme token overrides.
A4. Update `src/main.tsx` import from `./index.css` to whatever still makes sense (the new `src/index.css` re-exports `styles/index.css`).
A5. Verify both themes still look identical to `master` via screenshot diff (manual visual check is acceptable).

**Deliverable:** existing `index.css` reduced to only the section-scoped blocks that haven't yet been extracted (the Description Modal, Tiptap, Form Controls, Kanban Board sections plus per-component blocks). The "Light Mode Overrides" section is gone.

### Phase B — parallel agents (one task per agent, all independent of each other after A)

B1. **Primitives.** Build all 9 primitives in `components/primitives/` with co-located CSS. Replace usage sites across the codebase. Delete the corresponding blocks from `index.css`.
B2. **`views/summary/`.** Create folder, split `SummaryView`, move summary CSS, update import sites.
B3. **`views/kanban/`.** Same pattern; also moves the Kanban Board CSS section.
B4. **`views/orgPRs/`.** Same pattern.
B5. **`views/notes/`.** Same pattern; moves Description Modal + Tiptap CSS sections.
B6. **`views/settings/`.** Same pattern; moves Form Controls CSS section.
B7. **Misc components.** `FindInPage`, `DescriptionModal`, `JiraComments`, `JiraTasks`, `GitHubMentions`, `MentionsView`, `ChecksStatusIcon`, `StatusBadge`, `UpdateBanner`, `ErrorBoundary`, `SearchableDropdown`: add co-located CSS files where any styles still target them in `index.css`.

Each B-agent must:
- Touch only files in their assigned area, plus the lines of `index.css` they are extracting.
- Use only tokens — no hardcoded colors.
- Verify their view renders identically in both themes (manual check).
- Report what they removed from `index.css` so Phase C can confirm nothing was missed.

### Phase C — cleanup (sequential, single agent)

C1. Verify `src/index.css` contains only `@import` statements.
C2. Verify `src/styles/index.css` contains only `@import` statements.
C3. Run `yarn lint` and `yarn build`. Fix any issues.
C4. Manual screenshot diff vs. `master` for every major view in both themes.
C5. Remove any dead CSS files / orphaned utility classes.

## Risks and mitigations

- **Visual regressions are the primary risk.** Mitigation: each B-agent verifies their view in both themes before reporting done; Phase C does a final pass across every view.
- **Class-name collisions** across primitive CSS files. Mitigation: every class in a primitive CSS file is prefixed with the component name (e.g. `.badge-status-success`, not `.success`).
- **Bootstrap interaction.** Bootstrap is imported globally in `main.tsx`. The `bootstrap-overrides.css` file must load *after* Bootstrap to keep specificity working. The aggregator `styles/index.css` enforces import order.
- **Tiptap editor styles** are tightly coupled to the Tiptap DOM. Moving them to `views/notes/tiptap.css` must preserve selector specificity — these are not converted to primitives.
- **Two existing component CSS files** (`MultiSelectDropdown.css`, `SavedFiltersDropdown.css`) already work. Leave them alone; they validate the target pattern.

## Out of scope (explicitly)

- Replacing Bootstrap.
- Adding tests for visual regression (would be useful but is a separate project).
- Refactoring hooks, services, or business logic.
- Renaming files outside the refactor scope.
- Performance optimization.
