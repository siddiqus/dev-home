# Stale Ticket Detail — Per-Ticket Staleness Explanation

**Date:** 2026-07-05
**Status:** Approved

## Problem

The team dashboard marks tickets as "stale" but gives no indication of **why** or **by how much** — users must click through to Jira to understand the severity. A ticket that's 3 days stale and one that's 12 days stale look identical.

## Decision

Show "No update · Nd" with escalating color at every point where stale tickets surface. Pure frontend change — the backend already computes `daysSinceUpdate` on every `DashboardIssue`.

## Data Plumbing

`NeedsAttention.stale` carries bare `Ref` objects (`{kind, key}`) with no day count. The full `daysSinceUpdate` lives on `dashboard.issues` (`DashboardIssue[]`).

**Approach:** Build a `useMemo` lookup map `Map<issueKey, daysSinceUpdate>` in `TeamDashboardView` from `dashboard.issues`, and pass it down to the three consuming components. No backend changes, no `Ref` type enrichment, no new payload fields.

```
dashboard.issues ──useMemo──▶ Map<key, daysSinceUpdate>
                                   │
        ┌──────────────────────────┼───────────────────────────┐
        ▼                          ▼                            ▼
 NeedsAttentionPanel        LoadDistribution          JiraIssueDrawer
 (stale chips)              (stalest link)            (staleDays prop)
```

## Display Format

- **Compact** (chips and inline links): `No update · Nd` — used in NeedsAttentionPanel chips and LoadDistribution stalest links.
- **Full** (drawer): `No update in N days` — used in JiraIssueDrawer staleness section, where space allows.

## Color Escalation

A shared pure function `staleTone(days: number)` returns a CSS color:

| Condition | Color | Meaning |
|-----------|-------|---------|
| days ≤ 4 | amber (`#e0a458`) | Just over the 2-day threshold |
| days > 4 | red (`#dc3545`) | Clearly stale (>2× threshold) |

This mirrors the existing `EpicCards` gradient pattern in the codebase. The 2-day threshold is a server-side constant (`config.staleDays`); frontend color bands are hardcoded with a comment pointing at it.

## Three Placements

### 1. Needs Attention Panel (`NeedsAttentionPanel.tsx`)

- New optional prop: `staleDays?: Map<string, number>`.
- When the "Stale" row is expanded, each ticket chip appends a color-toned suffix:
  `PLAT-101 · No update 4d`
- Non-issue refs and rows without a lookup entry render exactly as today (graceful fallback).
- Only the Stale row uses this prop; other signal rows are unaffected.

### 2. Load Distribution (`LoadDistribution.tsx`)

- New optional prop: `staleDays?: Map<string, number>`.
- The existing "stalest: PLAT-101" link per team member gets an appended day count:
  `stalest: PLAT-101 · 9d`
- Color-toned using the same `staleTone()` function.
- Graceful fallback: if key not in map, renders as today.

### 3. Issue Drawer (`JiraIssueDrawer.tsx`)

- New optional prop: `staleDays?: number`.
- When present and > 0, renders a small "Staleness" section in the drawer body:
  `No update in N days`
- Uses the same color function for the text.
- When absent or 0, section is not rendered — existing behavior untouched.
- `TeamDashboardView` looks up the opened issue key in the map and passes the value.

## Shared Utility

`staleTone(days: number): string` — co-located with cockpit components (e.g. `src/views/teams/cockpit/staleTone.ts`).

```typescript
export function staleTone(days: number): string {
  return days > 4 ? "#dc3545" : "#e0a458";
}
```

## Testing

Each component has an existing `.test.tsx`. Add:

- **NeedsAttentionPanel:** chip shows `No update · Nd` when map entry exists; falls back when it doesn't.
- **LoadDistribution:** stalest link shows day count with map; renders normally without.
- **JiraIssueDrawer:** staleness section renders only when `staleDays` > 0.
- **staleTone:** returns amber at boundary (4), red above (5+).

## Scope Guardrails

- No backend changes, no new payload fields, no `Ref` type changes.
- Not touching the `Stalled: N` count badge or `stalledCount` aggregate.
- Threshold stays server-side; frontend color bands are hardcoded constants.
- No tooltip — the inline text is sufficient.

## Files Modified

| File | Change |
|------|--------|
| `src/views/teams/cockpit/staleTone.ts` | New — shared color function |
| `src/views/teams/cockpit/NeedsAttentionPanel.tsx` | Add `staleDays` prop, render day count on stale chips |
| `src/views/teams/cockpit/NeedsAttentionPanel.test.tsx` | Add staleness display tests |
| `src/views/teams/cockpit/LoadDistribution.tsx` | Add `staleDays` prop, render day count on stalest link |
| `src/views/teams/cockpit/LoadDistribution.test.tsx` | Add staleness display tests |
| `src/components/JiraIssueDrawer.tsx` | Add `staleDays` prop, conditional staleness section |
| `src/views/teams/TeamDashboardView.tsx` | Build lookup map, pass to panels and drawer |
