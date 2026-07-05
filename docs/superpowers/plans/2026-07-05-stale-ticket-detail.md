# Stale Ticket Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show per-ticket staleness explanation ("No update · Nd" with escalating color) at every point where stale tickets surface in the team dashboard.

**Architecture:** Build a `Map<issueKey, daysSinceUpdate>` lookup in TeamDashboardView from `dashboard.issues` and pass it to NeedsAttentionPanel, LoadDistribution, and JiraIssueDrawer. A shared `staleTone(days)` function returns amber or red. Pure frontend — no backend changes.

**Tech Stack:** React, TypeScript, Vitest, @testing-library/react

---

### Task 1: Create `staleTone` utility

**Files:**
- Create: `src/views/teams/cockpit/staleTone.ts`
- Create: `src/views/teams/cockpit/staleTone.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/teams/cockpit/staleTone.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { staleTone } from "./staleTone";

describe("staleTone", () => {
  it("returns amber for days <= 4", () => {
    expect(staleTone(3)).toBe("#e0a458");
    expect(staleTone(4)).toBe("#e0a458");
  });

  it("returns red for days > 4", () => {
    expect(staleTone(5)).toBe("#dc3545");
    expect(staleTone(9)).toBe("#dc3545");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/teams/cockpit/staleTone.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/views/teams/cockpit/staleTone.ts`:

```typescript
// Color bands are keyed off server-side staleDays (2) — threshold × 2 = 4 is the escalation point.
export function staleTone(days: number): string {
  return days > 4 ? "#dc3545" : "#e0a458";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/teams/cockpit/staleTone.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/teams/cockpit/staleTone.ts src/views/teams/cockpit/staleTone.test.ts
git commit -m "feat(cockpit): add staleTone color utility for stale ticket severity"
```

---

### Task 2: Add staleness detail to NeedsAttentionPanel

**Files:**
- Modify: `src/views/teams/cockpit/NeedsAttentionPanel.tsx`
- Modify: `src/views/teams/cockpit/NeedsAttentionPanel.test.tsx`

**Context:** The panel receives `needsAttention.stale` as `Ref[]` (bare `{kind, key}` pointers). A new optional `staleDays` prop (`Map<string, number>`) maps issue keys to their `daysSinceUpdate`. When the "Stale" row is expanded, each issue chip appends ` · No update Nd` with a color from `staleTone()`. Non-issue refs and keys not in the map render as today.

- [ ] **Step 1: Write the failing test**

Add to `src/views/teams/cockpit/NeedsAttentionPanel.test.tsx`:

```typescript
import { staleTone } from "./staleTone";

// ... add inside the existing describe("NeedsAttentionPanel") block:

it("shows staleness detail on stale chips when staleDays map is provided", () => {
  const staleDaysMap = new Map([["PLAT-101", 4]]);
  render(
    <NeedsAttentionPanel
      needsAttention={dashboardFixture.needsAttention}
      staleDays={staleDaysMap}
    />,
  );

  const staleRow = screen.getByText("Stale").closest("div");
  fireEvent.click(staleRow!);

  expect(screen.getByText(/No update/)).toBeInTheDocument();
  expect(screen.getByText(/4d/)).toBeInTheDocument();
});

it("renders stale chips without staleness detail when staleDays map is absent", () => {
  render(
    <NeedsAttentionPanel needsAttention={dashboardFixture.needsAttention} />,
  );

  const staleRow = screen.getByText("Stale").closest("div");
  fireEvent.click(staleRow!);

  expect(screen.getByText("PLAT-101")).toBeInTheDocument();
  expect(screen.queryByText(/No update/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/teams/cockpit/NeedsAttentionPanel.test.tsx`
Expected: FAIL — `staleDays` prop not recognized, no "No update" text

- [ ] **Step 3: Implement the changes**

Modify `src/views/teams/cockpit/NeedsAttentionPanel.tsx`:

1. Add `staleTone` import at the top:
```typescript
import { staleTone } from "./staleTone";
```

2. Add `staleDays` to the Props interface:
```typescript
interface Props {
  needsAttention: NeedsAttention;
  onOpenRef?: (ref: Ref) => void;
  staleDays?: Map<string, number>;
}
```

3. Destructure `staleDays` in the component signature:
```typescript
export function NeedsAttentionPanel({ needsAttention, onOpenRef, staleDays }: Props) {
```

4. Replace the ref button rendering (inside the `expandedRow === row.key` block, the `.map((ref, idx) => ...)`) with staleness-aware rendering. Replace the existing button element:

```tsx
{row.refs.map((ref, idx) => {
  const days = row.key === "stale" && ref.kind === "issue" ? staleDays?.get(ref.key) : undefined;
  return (
    <button
      key={idx}
      className="btn btn-sm btn-outline-secondary"
      onClick={(e) => {
        e.stopPropagation();
        handleRefClick(ref);
      }}
    >
      {formatRef(ref)}
      {days != null && (
        <span className="ms-1" style={{ color: staleTone(days), fontSize: "0.75rem" }}>
          · No update {days}d
        </span>
      )}
    </button>
  );
})}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/views/teams/cockpit/NeedsAttentionPanel.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/teams/cockpit/NeedsAttentionPanel.tsx src/views/teams/cockpit/NeedsAttentionPanel.test.tsx
git commit -m "feat(cockpit): show per-ticket staleness detail in NeedsAttentionPanel"
```

---

### Task 3: Add staleness detail to LoadDistribution

**Files:**
- Modify: `src/views/teams/cockpit/LoadDistribution.tsx`
- Modify: `src/views/teams/cockpit/LoadDistribution.test.tsx`

**Context:** Each `WorkloadEntry` has a `stalest: Ref | null` that renders as `stalest: PLAT-101`. A new optional `staleDays` prop maps issue keys to day counts, appending ` · Nd` with color to the stalest link. When the key isn't in the map or `staleDays` is absent, renders as today.

- [ ] **Step 1: Write the failing test**

Add to `src/views/teams/cockpit/LoadDistribution.test.tsx`:

```typescript
it("shows day count on stalest link when staleDays map is provided", () => {
  const staleDaysMap = new Map([["PLAT-101", 4]]);
  render(
    <LoadDistribution
      workload={dashboardFixture.workload}
      loadBalance={dashboardFixture.loadBalance}
      staleDays={staleDaysMap}
    />,
  );

  expect(screen.getByText(/stalest: PLAT-101/)).toBeInTheDocument();
  expect(screen.getByText(/4d/)).toBeInTheDocument();
});

it("renders stalest link without day count when staleDays map is absent", () => {
  render(
    <LoadDistribution
      workload={dashboardFixture.workload}
      loadBalance={dashboardFixture.loadBalance}
    />,
  );

  expect(screen.getByText("stalest: PLAT-101")).toBeInTheDocument();
  expect(screen.queryByText(/\dd$/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/teams/cockpit/LoadDistribution.test.tsx`
Expected: FAIL — `staleDays` not recognized, no day count text

- [ ] **Step 3: Implement the changes**

Modify `src/views/teams/cockpit/LoadDistribution.tsx`:

1. Add `staleTone` import:
```typescript
import { staleTone } from "./staleTone";
```

2. Add `staleDays` to the Props interface:
```typescript
interface Props {
  workload: WorkloadEntry[];
  loadBalance: LoadBalance;
  onOpenRef?: (ref: Ref) => void;
  staleDays?: Map<string, number>;
}
```

3. Destructure in the component:
```typescript
export function LoadDistribution({ workload, loadBalance, onOpenRef, staleDays }: Props) {
```

4. Update the stalest rendering block. Replace the existing `{w.stalest && (` block (lines 122–132) with:

```tsx
{w.stalest && (() => {
  const days = w.stalest.kind === "issue" ? staleDays?.get(w.stalest.key) : undefined;
  return (
    <div className="mt-1">
      <button
        className="btn btn-link btn-sm p-0 text-decoration-none"
        style={{ fontSize: "0.7rem" }}
        onClick={() => onOpenRef?.(w.stalest!)}
      >
        stalest: {w.stalest.kind === "issue" ? w.stalest.key : `PR #${w.stalest.number}`}
        {days != null && (
          <span style={{ color: staleTone(days), marginLeft: 4 }}>· {days}d</span>
        )}
      </button>
    </div>
  );
})()}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/views/teams/cockpit/LoadDistribution.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/teams/cockpit/LoadDistribution.tsx src/views/teams/cockpit/LoadDistribution.test.tsx
git commit -m "feat(cockpit): show staleness day count on LoadDistribution stalest link"
```

---

### Task 4: Add staleness section to JiraIssueDrawer

**Files:**
- Modify: `src/components/JiraIssueDrawer.tsx`

**Context:** The drawer shows issue details fetched from Jira. A new optional `staleDays?: number` prop, when present and > 0, renders a small "Staleness" section in the drawer body (between Assignee and Linked PRs). Uses `staleTone()` for color.

- [ ] **Step 1: Implement the changes**

Modify `src/components/JiraIssueDrawer.tsx`:

1. Add import:
```typescript
import { staleTone } from "../views/teams/cockpit/staleTone";
```

2. Add `staleDays` to the interface:
```typescript
interface JiraIssueDrawerProps {
  issue: JiraIssue | null;
  show: boolean;
  onHide: () => void;
  baseUrl?: string;
  linkedPRs?: LinkedPR[];
  staleDays?: number;
}
```

3. Destructure it:
```typescript
export const JiraIssueDrawer: React.FC<JiraIssueDrawerProps> = ({
  issue,
  show,
  onHide,
  baseUrl,
  linkedPRs,
  staleDays,
}) => {
```

4. Add the staleness section between the Assignee section (closing `</div>` around line 112) and the Linked PRs section (`{linkedPRs && ...}` around line 114). Insert:

```tsx
{staleDays != null && staleDays > 0 && (
  <div className="jira-drawer-assignee">
    <div className="modal-body-section-header">Staleness</div>
    <span style={{ fontSize: "0.8125rem", color: staleTone(staleDays) }}>
      No update in {staleDays} days
    </span>
  </div>
)}
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `npx vitest run src/components`
Expected: ALL PASS (the drawer doesn't have its own test file — just confirm no regressions)

- [ ] **Step 3: Commit**

```bash
git add src/components/JiraIssueDrawer.tsx
git commit -m "feat(drawer): show staleness section in JiraIssueDrawer when stale"
```

---

### Task 5: Wire everything in TeamDashboardView

**Files:**
- Modify: `src/views/teams/TeamDashboardView.tsx`

**Context:** The parent view has `dashboard.issues` (full `DashboardIssue[]` with `daysSinceUpdate`). Build a `useMemo` lookup map, then pass it to NeedsAttentionPanel, LoadDistribution, and derive the scalar `staleDays` for the JiraIssueDrawer from the opened issue key.

- [ ] **Step 1: Build the lookup map**

In `src/views/teams/TeamDashboardView.tsx`, add a `useMemo` after the existing `selectedSprint` line (around line 67), before the detail modals section:

```typescript
const staleDaysMap = useMemo(() => {
  if (!dashboard) return new Map<string, number>();
  const map = new Map<string, number>();
  for (const issue of dashboard.issues) {
    if (issue.flags.stale) {
      map.set(issue.key, issue.daysSinceUpdate);
    }
  }
  return map;
}, [dashboard]);
```

- [ ] **Step 2: Track the opened issue's staleness for the drawer**

In the `openIssue` callback, after `setDrawerPRs(...)`, add a line to capture the staleness for the drawer. First add state near the other drawer state (around line 78):

```typescript
const [drawerStaleDays, setDrawerStaleDays] = useState<number | undefined>(undefined);
```

Then inside `openIssue`, after `setDrawerPRs(...)`:

```typescript
const match = dashboard?.issues.find((i) => i.key === key);
setDrawerStaleDays(match?.flags.stale ? match.daysSinceUpdate : undefined);
```

Note: `setDrawerPRs` already does a `dashboard?.issues.find(...)` — combine the lookup to avoid scanning twice. Replace the existing `setDrawerPRs(...)` line and add the new one:

```typescript
const match = dashboard?.issues.find((i) => i.key === key);
setDrawerPRs(match?.linkedPRs ?? []);
setDrawerStaleDays(match?.flags.stale ? match.daysSinceUpdate : undefined);
```

- [ ] **Step 3: Pass staleDays to NeedsAttentionPanel**

Update the `<NeedsAttentionPanel>` call (around line 191):

```tsx
<NeedsAttentionPanel
  needsAttention={dashboard.needsAttention}
  onOpenRef={openRef}
  staleDays={staleDaysMap}
/>
```

- [ ] **Step 4: Pass staleDays to LoadDistribution**

Update the `<LoadDistribution>` call (around line 184):

```tsx
<LoadDistribution
  workload={dashboard.workload}
  loadBalance={dashboard.loadBalance}
  onOpenRef={openRef}
  staleDays={staleDaysMap}
/>
```

- [ ] **Step 5: Pass staleDays to JiraIssueDrawer**

Update the `<JiraIssueDrawer>` call (around line 249):

```tsx
<JiraIssueDrawer
  issue={drawerIssue}
  show={!!drawerIssue}
  onHide={() => setDrawerIssue(null)}
  baseUrl={jiraBaseUrl}
  linkedPRs={drawerPRs}
  staleDays={drawerStaleDays}
/>
```

- [ ] **Step 6: Run all tests to verify no regressions**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/views/teams/TeamDashboardView.tsx
git commit -m "feat(cockpit): wire staleDays map to panels and drawer"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run the linter**

Run: `npm run lint`
Expected: No errors
