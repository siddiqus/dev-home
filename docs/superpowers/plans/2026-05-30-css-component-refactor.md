# CSS + Component Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the 2032-line `src/index.css` monolith into co-located component CSS, with all theme values driven by CSS custom properties. Extract repeating UI patterns into reusable React primitives. Split 4 oversized view components into focused subcomponents grouped under `src/views/`.

**Architecture:** Phase A creates the token system and slims `index.css` to globals only (sequential, blocks B). Phase B runs 7 parallel tasks — one per primitive set or view folder — each touching its own files plus the `index.css` blocks it owns. Phase C is a sequential cleanup + verification pass.

**Tech Stack:** React 18, TypeScript, Vite, plain CSS (co-located `.css` files imported from `.tsx`), Bootstrap 5 (kept), Electron.

**Spec:** `docs/superpowers/specs/2026-05-30-css-component-refactor-design.md`

---

## How this plan is verified

This is a CSS/structural refactor. There is no automated visual regression test infrastructure. Verification for every task is:

1. `yarn lint` — must pass with no new errors.
2. `yarn build` — must succeed.
3. **Manual visual diff against `master`** — the agent (or reviewer) launches the app in both themes and confirms the affected view is pixel-identical. Note in the commit message which views were checked.

If a step says "Verify," it means run those three things.

---

## Color → token reference table (used by every task)

When migrating a hardcoded color, look it up in this table. If it's not here, add it to `tokens.css` first (Phase A only), using a `--color-*` name that describes its **purpose** (not value).

| Dark value                       | Light value                       | Token                           |
| -------------------------------- | --------------------------------- | ------------------------------- |
| `#0d1117`                        | `#ffffff`                         | `--color-bg-app`                |
| `#161b22`                        | `#ffffff`                         | `--color-bg-panel`              |
| `#161b22` (sidebar/table-stripe) | `#f6f8fa`                         | `--color-bg-elevated`           |
| `#1c2128`                        | `#f6f8fa` (or `#eaeef2` for tabs) | `--color-bg-hover`              |
| `#0d1117` (input)                | `#ffffff`                         | `--color-bg-input`              |
| `#21262d`                        | `#eaeef2`                         | `--color-border-subtle`         |
| `#30363d`                        | `#d1d9e0`                         | `--color-border`                |
| `#484f58`                        | `#8b949e` (light disabled)        | `--color-border-strong`         |
| `#c9d1d9`                        | `#1f2328`                         | `--color-text-primary`          |
| `#8b949e`                        | `#656d76`                         | `--color-text-secondary`        |
| `#484f58`                        | `#8b949e`                         | `--color-text-muted`            |
| `#58a6ff`                        | `#0969da`                         | `--color-accent`                |
| `#1f6feb`                        | `#0550ae`                         | `--color-accent-hover`          |
| `#3fb950`                        | `#1a7f37`                         | `--color-status-success`        |
| `#d29922`                        | `#9a6700`                         | `--color-status-warning`        |
| `#f85149`                        | `#cf222e`                         | `--color-status-danger`         |
| `#a371f7`                        | `#8250df`                         | `--color-status-purple`         |
| `rgba(56,139,253,0.15)`          | `rgba(9,105,218,0.1)`             | `--color-status-info-bg`        |
| `rgba(63,185,80,0.15)`           | `rgba(26,127,55,0.1)`             | `--color-status-success-bg`    |
| `rgba(210,153,34,0.15)`          | `rgba(154,103,0,0.1)`             | `--color-status-warning-bg`    |
| `rgba(248,81,73,0.15)`           | `rgba(207,34,46,0.1)`             | `--color-status-danger-bg`     |
| `rgba(163,113,247,0.15)`         | `rgba(130,80,223,0.1)`            | `--color-status-purple-bg`     |
| `rgba(139,148,158,0.15)`         | (same)                            | `--color-status-neutral-bg`    |
| `rgba(88,166,255,0.4)`           | `rgba(9,105,218,0.4)`             | `--color-focus-ring`            |
| `rgba(88,166,255,0.08)`          | `rgba(9,105,218,0.08)`            | `--color-accent-bg-subtle`      |

Spacing tokens (use everywhere a literal px/rem appears for padding/margin/gap):
`--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`, `--space-8: 32px`.

Radius: `--radius-sm: 4px`, `--radius-md: 6px`, `--radius-lg: 8px`, `--radius-pill: 9999px`.

---

# PHASE A — Foundation (sequential, single agent, blocks Phase B)

## Task A1: Create `src/styles/` skeleton and `tokens.css`

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/reset.css`
- Create: `src/styles/bootstrap-overrides.css`
- Create: `src/styles/utilities.css`
- Create: `src/styles/index.css`

- [ ] **Step 1: Create `src/styles/tokens.css` with the full token set**

```css
/* ============================================
   Design Tokens
   Dark = default (matches current dark theme)
   Light overrides via [data-theme="light"]
   ============================================ */

:root {
  /* Surfaces */
  --color-bg-app: #0d1117;
  --color-bg-panel: #161b22;
  --color-bg-elevated: #161b22;
  --color-bg-hover: #1c2128;
  --color-bg-input: #0d1117;

  /* Borders */
  --color-border-subtle: #21262d;
  --color-border: #30363d;
  --color-border-strong: #484f58;

  /* Text */
  --color-text-primary: #c9d1d9;
  --color-text-secondary: #8b949e;
  --color-text-muted: #484f58;

  /* Accent */
  --color-accent: #58a6ff;
  --color-accent-hover: #1f6feb;
  --color-accent-bg-subtle: rgba(88, 166, 255, 0.08);
  --color-focus-ring: rgba(88, 166, 255, 0.4);

  /* Status — foreground */
  --color-status-success: #3fb950;
  --color-status-warning: #d29922;
  --color-status-danger: #f85149;
  --color-status-purple: #a371f7;

  /* Status — translucent backgrounds */
  --color-status-info-bg: rgba(56, 139, 253, 0.15);
  --color-status-success-bg: rgba(63, 185, 80, 0.15);
  --color-status-warning-bg: rgba(210, 153, 34, 0.15);
  --color-status-danger-bg: rgba(248, 81, 73, 0.15);
  --color-status-purple-bg: rgba(163, 113, 247, 0.15);
  --color-status-neutral-bg: rgba(139, 148, 158, 0.15);

  /* Alert backgrounds (slightly more translucent than badge bgs) */
  --color-alert-info-bg: rgba(56, 139, 253, 0.1);
  --color-alert-info-border: rgba(56, 139, 253, 0.3);
  --color-alert-warning-bg: rgba(210, 153, 34, 0.1);
  --color-alert-warning-border: rgba(210, 153, 34, 0.3);
  --color-alert-danger-bg: rgba(248, 81, 73, 0.1);
  --color-alert-danger-border: rgba(248, 81, 73, 0.3);

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-pill: 9999px;

  /* Shadow */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.25);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.3);

  /* Z-index */
  --z-sticky: 100;
  --z-dropdown: 1000;
  --z-modal: 1050;
  --z-tooltip: 1100;

  /* Font */
  --font-mono: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
}

[data-theme="light"] {
  /* Surfaces */
  --color-bg-app: #ffffff;
  --color-bg-panel: #ffffff;
  --color-bg-elevated: #f6f8fa;
  --color-bg-hover: #f6f8fa;
  --color-bg-input: #ffffff;

  /* Borders */
  --color-border-subtle: #eaeef2;
  --color-border: #d1d9e0;
  --color-border-strong: #8b949e;

  /* Text */
  --color-text-primary: #1f2328;
  --color-text-secondary: #656d76;
  --color-text-muted: #8b949e;

  /* Accent */
  --color-accent: #0969da;
  --color-accent-hover: #0550ae;
  --color-accent-bg-subtle: rgba(9, 105, 218, 0.08);
  --color-focus-ring: rgba(9, 105, 218, 0.4);

  /* Status — foreground */
  --color-status-success: #1a7f37;
  --color-status-warning: #9a6700;
  --color-status-danger: #cf222e;
  --color-status-purple: #8250df;

  /* Status — translucent backgrounds */
  --color-status-info-bg: rgba(9, 105, 218, 0.1);
  --color-status-success-bg: rgba(26, 127, 55, 0.1);
  --color-status-warning-bg: rgba(154, 103, 0, 0.1);
  --color-status-danger-bg: rgba(207, 34, 46, 0.1);
  --color-status-purple-bg: rgba(130, 80, 223, 0.1);
  --color-status-neutral-bg: rgba(139, 148, 158, 0.1);

  /* Alert backgrounds */
  --color-alert-info-bg: rgba(9, 105, 218, 0.08);
  --color-alert-info-border: rgba(9, 105, 218, 0.3);
  --color-alert-warning-bg: rgba(154, 103, 0, 0.08);
  --color-alert-warning-border: rgba(154, 103, 0, 0.3);
  --color-alert-danger-bg: rgba(207, 34, 46, 0.08);
  --color-alert-danger-border: rgba(207, 34, 46, 0.3);

  /* Shadow lighter in light mode */
  --shadow-sm: 0 1px 2px rgba(31, 35, 40, 0.08);
  --shadow-md: 0 4px 8px rgba(31, 35, 40, 0.1);
  --shadow-lg: 0 8px 24px rgba(31, 35, 40, 0.12);
}
```

- [ ] **Step 2: Create `src/styles/reset.css`**

Copy-paste from current `src/index.css:1–75`, then convert hardcoded colors using the table above. The complete file:

```css
/* ============================================
   Reset & Base
   ============================================ */

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body,
#root {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans",
    "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--color-bg-app);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  line-height: 1.5;
  -webkit-app-region: no-drag;
}

/* Electron title bar drag region */
.top-bar {
  -webkit-app-region: drag;
  background-color: #010409 !important;
  border-bottom: 1px solid var(--color-border-subtle);
  padding-top: 0;
  padding-bottom: 0;
}

.top-bar .navbar-brand,
.top-bar .nav-link,
.top-bar button,
.top-bar input {
  -webkit-app-region: no-drag;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--color-bg-app);
}

::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-sm);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-strong);
}

/* Selection / focus */
*:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

/* Smooth transitions for interactive elements */
button,
a,
.nav-link,
.list-group-item {
  transition: all 150ms ease;
}

/* App body layout */
.app-body {
  display: flex;
  height: calc(100vh - 38px);
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow: auto;
  padding: var(--space-3) var(--space-4) var(--space-6);
  min-width: 0;
}

.tab-content-area {
  animation: fadeIn 200ms ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.container-fluid {
  max-width: 100%;
}
```

(Note: the dark-blue `#010409` for the Electron drag region is intentional and stays hardcoded — it's a single fixed value used only there. Light theme keeps its own override in `bootstrap-overrides.css` if needed.)

- [ ] **Step 3: Create `src/styles/bootstrap-overrides.css`**

Move all Bootstrap class overrides here. Source line ranges in current `index.css`:
- Bootstrap CSS Variable Overrides: lines 76–87
- Links: lines 88–99
- Cards: lines 100–116
- Tables: lines 262–298
- Badges (base `.badge` only, not the variants): lines 299–311
- Alerts: lines 344–374
- Buttons: lines 375–403
- ListGroup: lines 404–430
- Spinner: lines 431–437
- "Override Bootstrap dark-variant components in light mode": lines 1031–1052 — keep only the parts that target Bootstrap classes; delete the rest (covered by tokens)
- "Bootstrap Badge overrides": lines 1053–1083 — these become token-driven, so most can be deleted. Keep only `.badge.bg-secondary { background-color: var(--color-bg-hover) !important; color: var(--color-text-secondary); }`

Convert every hardcoded color to a token. Example for `.card`:

```css
.card {
  background-color: var(--color-bg-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-primary);
}

.card-header {
  background-color: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
}

.card-body {
  background-color: transparent;
}
```

Note: the `[data-theme="light"] .card-header` rule (line 753 currently sets `background-color: #f6f8fa`) is now handled automatically — the token `--color-bg-elevated` evaluates to `#161b22` in dark and `#f6f8fa` in light.

- [ ] **Step 4: Create `src/styles/utilities.css`**

```css
/* ============================================
   Utility classes
   ============================================ */

.text-muted-custom {
  color: var(--color-text-muted) !important;
}

.text-secondary-custom {
  color: var(--color-text-secondary) !important;
}

.text-truncate-custom {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-block {
  background-color: var(--color-bg-app);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--color-text-primary);
  white-space: pre;
  overflow-x: auto;
}

.priority-icon {
  width: 16px;
  height: 16px;
  display: block;
}
```

- [ ] **Step 5: Create `src/styles/index.css` aggregator**

```css
/* Import order matters: tokens → reset → bootstrap-overrides → utilities */
@import "./tokens.css";
@import "./reset.css";
@import "./bootstrap-overrides.css";
@import "./utilities.css";
```

- [ ] **Step 6: Commit**

```bash
git add src/styles/
git commit -m "feat(styles): add design token system and style file structure"
```

---

## Task A2: Migrate `src/index.css` to consume tokens and re-export from `src/styles/`

**Files:**
- Modify: `src/index.css` (drastically slim it)
- Modify: `src/main.tsx` (no change to import path, but verify)

This task removes everything from `src/index.css` that has been moved into `src/styles/*` in Task A1. What's left in `src/index.css` after this task is **only** the sections that Phase B will own:
- Sidebar (current lines 124–237)
- Branch tag (471–486)
- Status indicator dot (487–505)
- Type indicator dots (506–541)
- Empty state (556–571)
- Avatar (572–586)
- Ticket group header (594–644)
- Comment card (652–667)
- Summary item rows (668–678)
- See more button (679–701)
- Section headers (702–714)
- Description Modal (1095–1332)
- Tiptap Editor (1333–1557)
- Form Controls (1558–1714)
- Kanban Board (1715–2001)
- Find-in-page (2002–2032)

- [ ] **Step 1: Replace top of `src/index.css` with an `@import` of the new styles dir**

The new first line of `src/index.css`:

```css
@import "./styles/index.css";
```

- [ ] **Step 2: Delete all content from current `src/index.css` that now lives in `src/styles/`**

Specifically, delete these line ranges from current `src/index.css`:
- Lines 1–116 (reset, top-bar, bootstrap vars, links, cards) → now in `reset.css` + `bootstrap-overrides.css`
- Lines 117–123 (`.app-body`) → in `reset.css`
- Lines 238–261 (`.main-content`, `.tab-content-area`, `fadeIn`) → in `reset.css`
- Lines 262–437 (tables, badges base, alerts, buttons, listgroup, spinner) → in `bootstrap-overrides.css`
- Lines 438–470 (scrollbar, code-block) → in `reset.css` + `utilities.css`
- Lines 542–555 (muted text, container-fluid) → in `utilities.css` + `reset.css`
- Lines 645–651 (`.text-truncate-custom`) → in `utilities.css`
- Lines 715–728 (focus-visible, transitions) → in `reset.css`

- [ ] **Step 3: Replace every hardcoded color in remaining `src/index.css` content with the corresponding token**

Use the color → token reference table at the top of this plan. Examples:

`.badge-status-blue` becomes:
```css
.badge-status-blue {
  background-color: var(--color-status-info-bg);
  color: var(--color-accent);
}
```

`.status-dot.online`:
```css
.status-dot.online {
  background-color: var(--color-status-success);
  box-shadow: 0 0 6px var(--color-status-success-bg);
}
```

`.sidebar-tab.active`:
```css
.sidebar-tab.active {
  color: var(--color-accent);
  background-color: var(--color-accent-bg-subtle);
  font-weight: 600;
}
```

(do this for every `.sidebar*`, `.badge-status-*`, `.type-indicator.*`, `.alert-*`, `.btn-outline-*`, `.list-group-item`, `.table`, `.branch-tag`, `.empty-state`, `.avatar-*`, `.ticket-group-*`, `.comment-card`, `.summary-item`, `.see-more-*`, `.section-header`, and every selector inside the Description Modal / Tiptap / Form Controls / Kanban / Find-in-page sections)

- [ ] **Step 4: Delete the entire "Light Mode Overrides" section (current lines 729–1094)**

Every `[data-theme="light"] .foo { ... }` rule is now obsolete — its values live in `[data-theme="light"]` token overrides in `tokens.css`. After deletion, search `src/index.css` for `[data-theme="light"]` — there should be zero matches.

If a rule referenced something not covered by tokens (e.g., a specific light-only icon swap), file an issue inline as a `/* TODO(refactor): light-mode case not covered by tokens — needs a new token */` comment so Phase C can address it. (At plan-write time the only known case is the `.code-block` light treatment around line 990+ — already covered because tokens drive `--color-bg-app` and `--color-border`.)

- [ ] **Step 5: Verify**

```bash
yarn lint && yarn build
```

Then launch the app (`yarn dev`), toggle between light and dark themes, and confirm every screen looks identical to `master`. Pay special attention to: sidebar, tables, badges, alerts, cards, the top bar, scrollbar appearance.

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "refactor(styles): migrate base CSS to token-driven, delete light-mode override block"
```

---

# PHASE B — Parallel (7 independent tasks, dispatch one agent each)

All Phase B tasks share these rules:

- **Use tokens for every color.** If you need a value not in `tokens.css`, add it (with both dark and light values) and note the addition in the commit message so Phase C reviewers know.
- **Class names** in your new co-located CSS files must be prefixed with the component name (e.g. `.card-comment-author`, not `.author`) to prevent collisions.
- **No `[data-theme="light"]` selectors** in any new CSS file. If you find yourself wanting one, you actually want a new token instead.
- **Delete from `src/index.css` exactly the line ranges you own.** Do not touch other ranges. After your task, `src/index.css` is smaller by exactly your ranges and no other diff in that file.
- **Verify** = `yarn lint && yarn build` + manual visual diff of *your* view in both themes.

## Task B1: Extract reusable primitives

**Owns these `src/index.css` line ranges (current numbering):** 313–343 (badge variants), 471–486 (branch tag), 487–541 (status dots + type indicators), 556–571 (empty state), 572–586 (avatar), 652–667 (comment card), 679–701 (see more), 702–714 (section header).

**Files:**
- Create: `src/components/primitives/Card.tsx`, `Card.css`
- Create: `src/components/primitives/Badge.tsx`, `Badge.css`
- Create: `src/components/primitives/StatusDot.tsx`, `StatusDot.css`
- Create: `src/components/primitives/Avatar.tsx`, `Avatar.css`
- Create: `src/components/primitives/BranchTag.tsx`, `BranchTag.css`
- Create: `src/components/primitives/SectionHeader.tsx`, `SectionHeader.css`
- Create: `src/components/primitives/SeeMoreButton.tsx`, `SeeMoreButton.css`
- Create: `src/components/primitives/CommentCard.tsx`, `CommentCard.css`
- Modify: `src/components/EmptyState.tsx` (already exists), create `src/components/EmptyState.css`
- Modify: `src/index.css` (delete the listed ranges)
- Modify: every consumer JSX that currently uses these classes — search-and-replace to the new components.

### Step list

- [ ] **Step 1: Build `Badge` primitive**

`src/components/primitives/Badge.tsx`:

```tsx
import React from "react";
import "./Badge.css";

export type BadgeVariant = "info" | "success" | "warning" | "danger" | "purple" | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ variant = "neutral", className = "", children }) => (
  <span className={`badge badge-status badge-status--${variant} ${className}`.trim()}>
    {children}
  </span>
);
```

`src/components/primitives/Badge.css`:

```css
.badge-status {
  font-weight: 500;
  font-size: 0.6875rem;
  letter-spacing: 0.02em;
  padding: 3px var(--space-2);
  border-radius: var(--radius-pill);
  color: #ffffff;
}

.badge-status--info     { background-color: var(--color-status-info-bg); }
.badge-status--success  { background-color: var(--color-status-success-bg); }
.badge-status--warning  { background-color: var(--color-status-warning-bg); }
.badge-status--danger   { background-color: var(--color-status-danger-bg); }
.badge-status--purple   { background-color: var(--color-status-purple-bg); }
.badge-status--neutral  { background-color: var(--color-status-neutral-bg); }

[data-theme="light"] .badge-status--info     { color: var(--color-accent); }
[data-theme="light"] .badge-status--success  { color: var(--color-status-success); }
[data-theme="light"] .badge-status--warning  { color: var(--color-status-warning); }
[data-theme="light"] .badge-status--danger   { color: var(--color-status-danger); }
[data-theme="light"] .badge-status--purple   { color: var(--color-status-purple); }
[data-theme="light"] .badge-status--neutral  { color: var(--color-text-secondary); }
```

(Light-mode override here is the **one allowed exception** to the no-`[data-theme="light"]` rule in component CSS: text color flips from white to a status-colored value in light mode. This matches the current behavior at `index.css:824–851`. If a cleaner solution exists with tokens, prefer it.)

Replace every JSX usage of `<span className="badge badge-status-blue">` with `<Badge variant="info">`, and similarly for green→success, yellow→warning, red→danger, purple→purple, neutral→neutral. Grep:

```bash
grep -rn "badge-status-" src/
```

- [ ] **Step 2: Build `StatusDot` primitive**

`src/components/primitives/StatusDot.tsx`:

```tsx
import React from "react";
import "./StatusDot.css";

export type StatusDotVariant = "online" | "offline" | "info" | "success" | "warning" | "danger" | "purple" | "neutral";

interface StatusDotProps {
  variant: StatusDotVariant;
  label?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({ variant, label }) => (
  <span className="status-dot-wrapper">
    <span className={`status-dot status-dot--${variant}`} />
    {label && <span className="status-dot-label">{label}</span>}
  </span>
);
```

`src/components/primitives/StatusDot.css`:

```css
.status-dot-wrapper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot--online,
.status-dot--success {
  background-color: var(--color-status-success);
  box-shadow: 0 0 6px var(--color-status-success-bg);
}

.status-dot--offline,
.status-dot--danger {
  background-color: var(--color-status-danger);
  box-shadow: 0 0 6px var(--color-status-danger-bg);
}

.status-dot--warning { background-color: var(--color-status-warning); }
.status-dot--info    { background-color: var(--color-accent); }
.status-dot--purple  { background-color: var(--color-status-purple); }
.status-dot--neutral { background-color: var(--color-text-secondary); }

.status-dot-label {
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
}
```

Replace usages: search for `class.*status-dot` in JSX, swap to `<StatusDot variant="online" />` etc. Also fold the `.type-indicator` block (lines 506–541) into a sibling component if used:

Add to `StatusDot.css` the type-indicator block (because it's the same family of icons, just larger):

```css
.type-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.type-indicator--jira-issue     { background-color: var(--color-status-info-bg);    color: var(--color-accent); }
.type-indicator--jira-comment   { background-color: var(--color-status-purple-bg);  color: var(--color-status-purple); }
.type-indicator--github-mention { background-color: var(--color-status-neutral-bg); color: var(--color-text-secondary); }
.type-indicator--github-pr      { background-color: var(--color-status-success-bg); color: var(--color-status-success); }
.type-indicator--github-review  { background-color: var(--color-status-warning-bg); color: var(--color-status-warning); }
```

Existing usages with `.type-indicator.jira-issue` etc. switch to BEM-style `.type-indicator.type-indicator--jira-issue`. Search:

```bash
grep -rn "type-indicator" src/
```

- [ ] **Step 3: Build `Avatar` primitive**

`src/components/primitives/Avatar.tsx`:

```tsx
import React from "react";
import "./Avatar.css";

interface AvatarProps {
  src: string;
  alt: string;
  size?: "sm" | "md";
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt, size = "sm", className = "" }) => (
  <img src={src} alt={alt} className={`avatar avatar--${size} ${className}`.trim()} />
);
```

`src/components/primitives/Avatar.css`:

```css
.avatar {
  border-radius: 50%;
  object-fit: cover;
}

.avatar--sm { width: 24px; height: 24px; }
.avatar--md { width: 32px; height: 32px; }
```

Replace `<img className="avatar-sm">` with `<Avatar size="sm" ... />`. Search: `grep -rn "avatar-sm\|avatar-md" src/`.

- [ ] **Step 4: Build `BranchTag` primitive**

`src/components/primitives/BranchTag.tsx`:

```tsx
import React from "react";
import "./BranchTag.css";

interface BranchTagProps {
  name: string;
  title?: string;
}

export const BranchTag: React.FC<BranchTagProps> = ({ name, title }) => (
  <span className="branch-tag" title={title ?? name}>{name}</span>
);
```

`src/components/primitives/BranchTag.css`:

```css
.branch-tag {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 500;
  background-color: var(--color-status-info-bg);
  color: var(--color-accent);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}
```

Replace `<span className="branch-tag">` with `<BranchTag name="..." />`. Search: `grep -rn "branch-tag" src/`.

- [ ] **Step 5: Build `SectionHeader` primitive**

`src/components/primitives/SectionHeader.tsx`:

```tsx
import React from "react";
import "./SectionHeader.css";

interface SectionHeaderProps {
  children: React.ReactNode;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ children, action }) => (
  <div className="section-header">
    <span className="section-header-title">{children}</span>
    {action && <span className="section-header-action">{action}</span>}
  </div>
);
```

`src/components/primitives/SectionHeader.css`:

```css
.section-header {
  color: var(--color-text-secondary);
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.section-header-title { flex: 1; }
.section-header-action { display: inline-flex; }
```

Replace existing `<div className="section-header">` usages. Search: `grep -rn "section-header" src/`.

- [ ] **Step 6: Build `SeeMoreButton` primitive**

`src/components/primitives/SeeMoreButton.tsx`:

```tsx
import React from "react";
import "./SeeMoreButton.css";

interface SeeMoreButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const SeeMoreButton: React.FC<SeeMoreButtonProps> = ({ onClick, children }) => (
  <button type="button" className="see-more-btn" onClick={onClick}>
    {children}
  </button>
);
```

`src/components/primitives/SeeMoreButton.css`:

```css
.see-more-row {
  border-top: 1px solid var(--color-border-subtle);
  text-align: center;
}

.see-more-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  transition: color 150ms ease, background-color 150ms ease;
}

.see-more-btn:hover {
  color: var(--color-accent);
  background-color: var(--color-accent-bg-subtle);
}
```

Replace `<button className="see-more-btn">` usages. Search: `grep -rn "see-more" src/`.

- [ ] **Step 7: Build `CommentCard` primitive**

`src/components/primitives/CommentCard.tsx`:

```tsx
import React from "react";
import "./CommentCard.css";

interface CommentCardProps {
  children: React.ReactNode;
  className?: string;
}

export const CommentCard: React.FC<CommentCardProps> = ({ children, className = "" }) => (
  <div className={`comment-card ${className}`.trim()}>{children}</div>
);
```

`src/components/primitives/CommentCard.css`:

```css
.comment-card {
  background-color: var(--color-bg-panel);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 14px var(--space-4);
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.comment-card:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-border);
}
```

Replace `<div className="comment-card">` usages. Search: `grep -rn "comment-card" src/`.

- [ ] **Step 8: Build `Card` primitive**

The base `.card` from Bootstrap already exists. This primitive is a thin wrapper that gives JSX a typed component without needing to remember Bootstrap conventions.

`src/components/primitives/Card.tsx`:

```tsx
import React from "react";
import "./Card.css";

interface CardProps {
  variant?: "default" | "interactive";
  className?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ variant = "default", className = "", children }) => (
  <div className={`card card--${variant} ${className}`.trim()}>{children}</div>
);
```

`src/components/primitives/Card.css`:

```css
.card--interactive {
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease;
}

.card--interactive:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-border-strong);
}
```

(Base `.card` styling stays in `bootstrap-overrides.css` — this just adds the interactive variant.)

Do NOT mass-rewrite existing `<Card>` Bootstrap usages — only adopt this primitive in new code or where there's a clear win. This step exists so the pattern is available.

- [ ] **Step 9: Migrate `EmptyState` to use co-located CSS**

`src/components/EmptyState.tsx` already exists at 28 lines — verify it still compiles, then create `src/components/EmptyState.css`:

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px var(--space-6);
  gap: var(--space-2);
  text-align: center;
}

.empty-state .empty-icon {
  color: var(--color-text-muted);
  opacity: 0.5;
}
```

Add `import "./EmptyState.css";` to the top of `EmptyState.tsx`.

- [ ] **Step 10: Delete owned ranges from `src/index.css`**

After all replacements are done, delete the following CSS blocks (in whatever line numbers they sit at now — search by selector, not by line):
- `.badge-status-*` rules (was 313–343 in original)
- `.branch-tag { ... }` (was 471–486)
- `.status-dot*` rules (was 487–505)
- `.type-indicator*` rules (was 506–541)
- `.empty-state*` rules (was 556–571)
- `.avatar-*` rules (was 572–586)
- `.comment-card*` rules (was 652–667)
- `.see-more-*` rules (was 679–701)
- `.section-header*` rules (was 702–714)

Also delete `[data-theme="light"] .badge-status-*` blocks if any survived A2 (they shouldn't have).

- [ ] **Step 11: Verify**

```bash
yarn lint && yarn build
```

Launch app. Open Summary view, Org PRs view, Mentions view, Kanban — check that badges, status dots, type indicators, branch tags, avatars, empty states, and comment cards all render identically to `master` in both themes.

- [ ] **Step 12: Commit**

```bash
git add src/components/primitives/ src/components/EmptyState.css src/components/EmptyState.tsx src/index.css
# plus any consumer .tsx files you modified
git commit -m "refactor(components): extract Badge/StatusDot/Avatar/BranchTag/SectionHeader/SeeMoreButton/CommentCard/Card primitives"
```

---

## Task B2: Extract `views/summary/`

**Owns `src/index.css` line ranges:** 594–644 (ticket group header), 668–678 (summary item rows).

**Files:**
- Create: `src/views/summary/SummaryView.tsx` (moved from `src/components/SummaryView.tsx`)
- Create: `src/views/summary/SummaryItem.tsx`
- Create: `src/views/summary/TicketGroupHeader.tsx`
- Create: `src/views/summary/summary.css`
- Delete: `src/components/SummaryView.tsx`
- Modify: every importer of `SummaryView` (likely `src/App.tsx`)
- Modify: `src/index.css` (delete owned ranges)

### Step list

- [ ] **Step 1: Read current `src/components/SummaryView.tsx` end-to-end**

Identify three logical chunks: (1) the top-level layout / data wiring, (2) the rendering of an individual summary row, (3) the rendering of a ticket-group header row. These become the three TSX files.

- [ ] **Step 2: Create `src/views/summary/summary.css`**

Move the ticket-group-header + summary-item blocks here, with hardcoded colors replaced by tokens:

```css
/* ============================================
   Summary view
   ============================================ */

.summary-item {
  border-bottom: 1px solid var(--color-border-subtle);
  transition: background-color 120ms ease;
  cursor: pointer;
}

.summary-item:hover {
  background-color: var(--color-bg-hover);
}

.ticket-group-header {
  cursor: pointer;
  user-select: none;
}

.ticket-group-header:hover > td {
  background-color: var(--color-bg-hover);
}

.ticket-group-header > td {
  background-color: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border-subtle);
  padding: 6px var(--space-3) !important;
}

.ticket-group-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  color: var(--color-text-muted);
  vertical-align: middle;
}

.ticket-group-label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  vertical-align: middle;
}

.ticket-group-count {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  margin-left: var(--space-2);
  font-weight: 500;
  vertical-align: middle;
}

.ticket-group-title {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-left: var(--space-2);
  vertical-align: middle;
}
```

- [ ] **Step 3: Extract `TicketGroupHeader.tsx`**

Identify the JSX that renders a ticket-group header row in `SummaryView.tsx` and move it into a focused component. Signature:

```tsx
// src/views/summary/TicketGroupHeader.tsx
import React from "react";

interface TicketGroupHeaderProps {
  groupKey: string;
  count: number;
  title?: string;
  collapsed: boolean;
  onToggle: () => void;
  colSpan: number;
}

export const TicketGroupHeader: React.FC<TicketGroupHeaderProps> = ({
  groupKey, count, title, collapsed, onToggle, colSpan,
}) => (
  <tr className="ticket-group-header" onClick={onToggle}>
    <td colSpan={colSpan}>
      <span className="ticket-group-chevron">
        {collapsed ? "▶" : "▼"}
      </span>
      <span className="ticket-group-label">{groupKey}</span>
      <span className="ticket-group-count">({count})</span>
      {title && <span className="ticket-group-title">{title}</span>}
    </td>
  </tr>
);
```

Adjust prop names if the original JSX uses different ones; preserve current behavior exactly.

- [ ] **Step 4: Extract `SummaryItem.tsx`**

Move the JSX that renders a single summary row into `src/views/summary/SummaryItem.tsx`. Keep the prop interface narrow — pass in the row data + click handler.

- [ ] **Step 5: Move `SummaryView.tsx` into `src/views/summary/`**

```bash
git mv src/components/SummaryView.tsx src/views/summary/SummaryView.tsx
```

Update `SummaryView.tsx` to:
- Import `./summary.css` at the top.
- Use the new `TicketGroupHeader` and `SummaryItem` components.
- Delete the inlined JSX that was moved.

- [ ] **Step 6: Update importers**

```bash
grep -rn "from.*components/SummaryView" src/
```

Update each import to `from "../views/summary/SummaryView"` (or appropriate relative path).

- [ ] **Step 7: Delete owned ranges from `src/index.css`**

Remove the `.ticket-group-*` and `.summary-item*` blocks.

- [ ] **Step 8: Verify**

```bash
yarn lint && yarn build && yarn dev
```

Open the Summary view in both themes; confirm row rendering, hover, group collapse/expand, and group header colors are unchanged.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(views): extract views/summary/ with SummaryItem and TicketGroupHeader subcomponents"
```

---

## Task B3: Extract `views/kanban/`

**Owns `src/index.css` line ranges:** 1715–2001 (Kanban Board section, including search and light-mode kanban sub-block).

**Files:**
- Create: `src/views/kanban/KanbanBoard.tsx` (moved from `src/components/KanbanBoard.tsx`)
- Create: `src/views/kanban/KanbanColumn.tsx`
- Create: `src/views/kanban/KanbanCard.tsx`
- Create: `src/views/kanban/KanbanSearch.tsx`
- Create: `src/views/kanban/kanban.css`
- Delete: `src/components/KanbanBoard.tsx`
- Modify: importers of `KanbanBoard`
- Modify: `src/index.css`

### Step list

- [ ] **Step 1: Read current `src/components/KanbanBoard.tsx` end-to-end and identify subcomponent boundaries**

Look for: the board container, a single column, a single card, and the search/filter bar. These become the four TSX files.

- [ ] **Step 2: Create `src/views/kanban/kanban.css`**

Copy the entire Kanban Board section from current `src/index.css` (lines 1715–2001) into this file. Then:
- Replace every hardcoded color with the appropriate token (use the table at the top of this plan).
- Delete the "Light mode kanban" sub-block (was lines 1868–1934) entirely — its values are now provided by `[data-theme="light"]` token overrides.
- Verify there are no `[data-theme="light"]` selectors remaining in `kanban.css`.

The file should be ~150 lines after cleanup (down from ~287). If you find a kanban-specific color that doesn't fit any existing token (e.g. a unique column-tinting), add a new token in `tokens.css` with both dark and light values and note it in the commit message.

- [ ] **Step 3: Extract `KanbanSearch.tsx`**

```tsx
// src/views/kanban/KanbanSearch.tsx
import React from "react";

interface KanbanSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const KanbanSearch: React.FC<KanbanSearchProps> = ({ value, onChange, placeholder }) => (
  <input
    type="text"
    className="kanban-search-input"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder ?? "Search…"}
  />
);
```

Reuse the existing class names from `kanban.css` so styles still apply.

- [ ] **Step 4: Extract `KanbanCard.tsx` and `KanbanColumn.tsx`**

Identify the JSX subtrees that render a single card and a single column. Move them into `KanbanCard.tsx` and `KanbanColumn.tsx` respectively. Keep prop interfaces narrow (the card receives the ticket; the column receives its title + array of tickets + the drop handler).

- [ ] **Step 5: Move `KanbanBoard.tsx` into `src/views/kanban/`**

```bash
git mv src/components/KanbanBoard.tsx src/views/kanban/KanbanBoard.tsx
```

Update it to import `./kanban.css`, `./KanbanColumn`, `./KanbanCard`, `./KanbanSearch`, and replace the moved JSX with subcomponent usage.

- [ ] **Step 6: Update importers**

```bash
grep -rn "from.*components/KanbanBoard" src/
```

Update each.

- [ ] **Step 7: Delete owned ranges from `src/index.css` (lines 1715–2032 — the whole Kanban + Find-in-page block, but only the Kanban subset)**

Specifically delete lines that were 1715–1935 in the original numbering (kanban + light kanban). Find-in-page (was 1936–2032) is owned by Task B7 — do not touch it.

- [ ] **Step 8: Verify**

```bash
yarn lint && yarn build && yarn dev
```

Open the Kanban view in both themes; test drag-drop, search, column rendering, card hover, status colors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(views): extract views/kanban/ with Column/Card/Search subcomponents"
```

---

## Task B4: Extract `views/orgPRs/`

**Owns `src/index.css` line ranges:** none directly — all OrgPRs styling currently lives inside generic blocks (badges, tables, cards) already handled elsewhere. This task is purely a TSX restructure.

**Files:**
- Create: `src/views/orgPRs/OrgPRsView.tsx` (moved from `src/components/OrgPRsView.tsx`)
- Create: `src/views/orgPRs/` subcomponents identified during reading
- Create: `src/views/orgPRs/orgPRs.css` (if any orgPRs-specific styles exist after reading the file)
- Delete: `src/components/OrgPRsView.tsx`
- Modify: importers

### Step list

- [ ] **Step 1: Read `src/components/OrgPRsView.tsx` (409 lines) end-to-end**

Identify natural subcomponent boundaries. Likely candidates: PR row, repo group header, filter bar, summary cell. Pick 3–4 subcomponents that each have a single responsibility.

- [ ] **Step 2: Search for any orgPRs-specific selectors currently in `src/index.css`**

```bash
grep -n "org-pr\|org_pr\|orgPr" src/index.css
```

If matches exist, move them to a new `src/views/orgPRs/orgPRs.css`, replacing colors with tokens. If no matches, skip creating the CSS file.

- [ ] **Step 3: Extract each identified subcomponent**

For each, create a `src/views/orgPRs/<Name>.tsx` file with a narrow prop interface. Move the JSX subtree from `OrgPRsView.tsx`. Use existing primitives where applicable (`Badge`, `StatusDot`, `BranchTag`, `Avatar`, `SectionHeader`).

- [ ] **Step 4: Move `OrgPRsView.tsx` into `src/views/orgPRs/`**

```bash
git mv src/components/OrgPRsView.tsx src/views/orgPRs/OrgPRsView.tsx
```

Update it to import its subcomponents and (if created) `./orgPRs.css`.

- [ ] **Step 5: Update importers**

```bash
grep -rn "from.*components/OrgPRsView" src/
```

- [ ] **Step 6: Verify**

```bash
yarn lint && yarn build && yarn dev
```

Open the Org PRs view in both themes; check PR rows, filters, sorting, hover states.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(views): extract views/orgPRs/ with focused subcomponents"
```

---

## Task B5: Extract `views/notes/`

**Owns `src/index.css` line ranges:** 1095–1332 (Description Modal section — but **only** the parts that target notes/modal-shared CSS; the Description Modal proper is owned by Task B7, so this task touches just the notes-related selectors within that section) and 1333–1557 (Tiptap Editor).

**Clarification on shared ranges:** Read lines 1095–1332 carefully — selectors like `.note-content`, `.note-meta`, `.note-3-line-clamp`, `.markdown-body` etc. belong to notes (Task B5); selectors like `.description-modal`, `.modal-content`, `.modal-header`, `.modal-body` belong to the modal infrastructure (Task B7). When in doubt: if removing the selector breaks the note editor or note preview, it's yours.

**Files:**
- Create: `src/views/notes/PersonalNotes.tsx` (moved from `src/components/PersonalNotes.tsx`)
- Create: `src/views/notes/NoteEditorModal.tsx` (moved from `src/components/NoteEditorModal.tsx`)
- Create: `src/views/notes/` subcomponents identified during reading
- Create: `src/views/notes/notes.css`
- Create: `src/views/notes/tiptap.css`
- Delete: `src/components/PersonalNotes.tsx`, `src/components/NoteEditorModal.tsx`
- Modify: importers
- Modify: `src/index.css`

### Step list

- [ ] **Step 1: Read both source files and the relevant `index.css` ranges**

Identify subcomponents in `NoteEditorModal.tsx` (387 lines — likely candidates: editor toolbar, editor body, attachments list, footer actions) and `PersonalNotes.tsx` (238 lines — likely: note card, note list, filter bar).

- [ ] **Step 2: Create `src/views/notes/tiptap.css`**

Copy the entire Tiptap Editor section (current lines 1333–1557, ~225 lines) into this file. Replace hardcoded colors with tokens. Delete the "Light mode overrides" sub-block within Tiptap (was lines 1483–1557). The file should be ~140 lines after cleanup.

- [ ] **Step 3: Create `src/views/notes/notes.css`**

Copy the notes-related selectors from lines 1095–1332 into this file. Skip selectors that belong to the modal infrastructure (those go to Task B7's file later, but for now leave them in `src/index.css` — Task B7 will pick them up). Replace hardcoded colors with tokens.

Specifically include in `notes.css`:
- `.note-content`, `.note-meta`, `.note-author`, `.note-3-line-clamp`
- `.markdown-body` and its descendants (current lines 1137–1247)
- `.note-list`, `.note-card` (if present)

- [ ] **Step 4: Extract subcomponents from `NoteEditorModal.tsx`**

For each chunk identified in Step 1, create a focused `.tsx` file under `src/views/notes/`. Keep prop interfaces narrow. Use existing primitives.

- [ ] **Step 5: Extract subcomponents from `PersonalNotes.tsx`**

For each chunk identified in Step 1 (likely a `NoteCard.tsx` for the per-note rendering and a `NoteList.tsx` for the list container; possibly a `NoteFilterBar.tsx`), create a focused `.tsx` file under `src/views/notes/`. Keep prop interfaces narrow — pass the note data + click handlers. Use existing primitives (`Card`, `CommentCard`, `Avatar`) where they fit naturally.

- [ ] **Step 6: Move both files into `src/views/notes/`**

```bash
git mv src/components/PersonalNotes.tsx src/views/notes/PersonalNotes.tsx
git mv src/components/NoteEditorModal.tsx src/views/notes/NoteEditorModal.tsx
```

Update each to import the new CSS and subcomponents.

- [ ] **Step 7: Update importers**

```bash
grep -rn "from.*components/PersonalNotes\|from.*components/NoteEditorModal" src/
```

- [ ] **Step 8: Delete moved ranges from `src/index.css`**

Delete the notes-specific selectors from current `index.css` (the ones now in `notes.css`) and the entire Tiptap section.

- [ ] **Step 9: Verify**

```bash
yarn lint && yarn build && yarn dev
```

Open Notes view, create/edit a note, test the editor toolbar, markdown rendering, attachments, both themes.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(views): extract views/notes/ with isolated Tiptap CSS"
```

---

## Task B6: Extract `views/settings/`

**Owns `src/index.css` line ranges:** 1558–1714 (Form Controls section, including the theme picker block and its light-mode override sub-block).

**Files:**
- Create: `src/views/settings/SettingsView.tsx` (moved from `src/components/SettingsView.tsx`)
- Create: `src/views/settings/` subcomponents identified during reading
- Create: `src/views/settings/settings.css`
- Create: `src/views/settings/formControls.css`
- Delete: `src/components/SettingsView.tsx`
- Modify: importers
- Modify: `src/index.css`

### Step list

- [ ] **Step 1: Read `src/components/SettingsView.tsx` (310 lines) end-to-end**

Identify natural subcomponent boundaries: likely the settings section card, the form field group, the theme picker, the credentials panel.

- [ ] **Step 2: Create `src/views/settings/formControls.css`**

Copy the entire Form Controls section (current lines 1558–1714) into this file. Replace hardcoded colors with tokens. Delete the "Light mode overrides" and "Light mode form controls" sub-blocks (was lines 1585–1609 and 1697–1714). Theme-picker option styles stay but are token-driven.

- [ ] **Step 3: Create `src/views/settings/settings.css`**

If there are any settings-specific selectors not covered by `formControls.css`, put them here. If everything fits in `formControls.css`, this file can stay empty or not be created.

- [ ] **Step 4: Extract subcomponents**

For each identified chunk, create a focused `.tsx` file under `src/views/settings/`. Use existing primitives.

- [ ] **Step 5: Move `SettingsView.tsx`**

```bash
git mv src/components/SettingsView.tsx src/views/settings/SettingsView.tsx
```

Update imports.

- [ ] **Step 6: Update importers**

```bash
grep -rn "from.*components/SettingsView" src/
```

- [ ] **Step 7: Delete owned ranges from `src/index.css` (was 1558–1714)**

- [ ] **Step 8: Verify**

```bash
yarn lint && yarn build && yarn dev
```

Open Settings view in both themes; test every form control, theme switching, the theme-picker preview swatches.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(views): extract views/settings/ with co-located form controls CSS"
```

---

## Task B7: Co-locate misc component CSS (FindInPage, DescriptionModal, others)

**Owns `src/index.css` line ranges:** 1095–1332 (Description Modal section — only the modal infrastructure selectors, not the notes selectors handled by B5), 2002–2032 (Find-in-page).

**Files:**
- Create: `src/components/FindInPage.css`
- Create: `src/components/DescriptionModal.css`
- Modify: `src/components/FindInPage.tsx`, `src/components/DescriptionModal.tsx` (add CSS imports)
- For each other small component (`JiraComments`, `JiraTasks`, `GitHubMentions`, `MentionsView`, `ChecksStatusIcon`, `StatusBadge`, `UpdateBanner`, `ErrorBoundary`, `SearchableDropdown`): check if it has any styles in `src/index.css` and co-locate if so.
- Modify: `src/index.css`

### Step list

- [ ] **Step 1: Create `src/components/DescriptionModal.css`**

Copy modal-infrastructure selectors from current `index.css:1095–1332` (the ones NOT moved to `notes.css` by Task B5). Specifically:
- `.description-modal` and its descendants
- `.modal-content`, `.modal-header`, `.modal-body`, `.modal-footer` if these are overridden
- The "Light mode overrides for modal" section (was lines 1248–1322 — delete after migration, since tokens now drive these)
- The "3-line truncation for note content preview" rule (1324–1331) — actually, this one's notes; let B5 take it. Coordinate.

Replace all hardcoded colors with tokens. After this, the file should have ~80 lines and no `[data-theme="light"]` selectors.

Add `import "./DescriptionModal.css";` to `src/components/DescriptionModal.tsx`.

- [ ] **Step 2: Create `src/components/FindInPage.css`**

Copy the entire Find-in-page section (current lines 2002–2032 — note: this is at the end of the original index.css under the Kanban section block). Replace hardcoded colors with tokens. Delete the "Light theme overrides" sub-block (was lines 2002–2031). Should be ~30 lines.

Add `import "./FindInPage.css";` to `src/components/FindInPage.tsx`.

- [ ] **Step 3: Audit remaining small components**

Run:

```bash
for comp in JiraComments JiraTasks GitHubMentions MentionsView ChecksStatusIcon StatusBadge UpdateBanner ErrorBoundary SearchableDropdown; do
  echo "=== $comp ==="
  grep -n "$comp\|$(echo $comp | tr '[:upper:]' '[:lower:]')" src/index.css || echo "  (no styles)"
done
```

For each component that has remaining CSS in `src/index.css`, create `src/components/<Name>.css`, move the styles, import in the `.tsx`. Use tokens.

- [ ] **Step 4: Delete owned ranges from `src/index.css`**

After all of the above, `src/index.css` should contain only the sidebar block + a few sub-utilities. Confirm with:

```bash
wc -l src/index.css
```

Expected: under 200 lines, ideally under 100.

- [ ] **Step 5: Verify**

```bash
yarn lint && yarn build && yarn dev
```

Open the description modal from any ticket, test the find-in-page (Cmd+F), check each component touched in both themes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(components): co-locate CSS for FindInPage, DescriptionModal, and misc small components"
```

---

# PHASE C — Cleanup & verification (sequential, single agent)

## Task C1: Final cleanup and full-app verification

**Files:**
- Modify: `src/index.css` (final reduction)
- Modify: `src/main.tsx` (verify import path is `./index.css`)

### Step list

- [ ] **Step 1: Confirm `src/index.css` final state**

After all Phase B tasks merge, `src/index.css` should contain only:
- The `@import "./styles/index.css";` line
- The Sidebar block (it's app-shell-level, not view-level — keep it in `src/index.css` or move it to `src/styles/sidebar.css` and `@import` from `styles/index.css`). **Decision:** move to `src/styles/sidebar.css` for consistency.

Create `src/styles/sidebar.css` with the sidebar styles (token-driven). Add `@import "./sidebar.css";` to `src/styles/index.css`. Delete the sidebar block from `src/index.css`.

The final `src/index.css`:

```css
@import "./styles/index.css";
```

That's it. One line.

- [ ] **Step 2: Confirm `src/styles/index.css` order**

```css
@import "./tokens.css";
@import "./reset.css";
@import "./bootstrap-overrides.css";
@import "./utilities.css";
@import "./sidebar.css";
```

- [ ] **Step 3: Grep for any remaining `[data-theme="light"]` selectors outside of `tokens.css` and `Badge.css`**

```bash
grep -rn '\[data-theme="light"\]' src/ | grep -v "tokens.css\|Badge.css"
```

Expected: zero matches. If any found, migrate them to tokens.

- [ ] **Step 4: Grep for any remaining hardcoded colors in CSS files**

```bash
grep -rnE "#[0-9a-fA-F]{3,6}|rgba?\(" src/ --include="*.css" | grep -v "tokens.css"
```

A few exceptions are acceptable: `#010409` in the Electron top-bar (intentional), `#ffffff` white text on colored badges. Anything else: replace with a token.

- [ ] **Step 5: Run full verification**

```bash
yarn lint
yarn build
yarn dev
```

Manually walk through every view:
- Summary
- Kanban
- Org PRs
- Mentions
- Notes (create / edit / view)
- Settings (every form field, theme toggle)
- Description modal (open from a ticket)
- Find-in-page (Cmd+F)

In both themes. Note any visual deltas vs. `master` and fix.

- [ ] **Step 6: Final line-count check**

```bash
wc -l src/index.css src/styles/*.css src/components/primitives/*.css src/views/**/*.css
```

Expected aggregate: similar to original ~2032 lines but distributed across ~25 files, with `src/index.css` at 1 line.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(styles): final cleanup — index.css reduced to single @import, sidebar extracted"
```

---

## Done criteria

- `src/index.css` is exactly one line: `@import "./styles/index.css";`
- `src/styles/` contains tokens, reset, bootstrap-overrides, utilities, sidebar.
- 9 primitives exist under `src/components/primitives/` with co-located CSS.
- 5 view folders exist under `src/views/` (summary, kanban, orgPRs, notes, settings), each with subcomponents and co-located CSS.
- `src/components/` contains only the small components, each with a co-located `.css` file if it needs one.
- No CSS file outside `tokens.css` and `Badge.css` contains `[data-theme="light"]`.
- No CSS file outside `tokens.css` contains hardcoded colors (with two documented exceptions: top-bar `#010409`, badge text `#ffffff`).
- `yarn lint && yarn build` pass.
- Manual visual check confirms parity with `master` in both themes across all views.
