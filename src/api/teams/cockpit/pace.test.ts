import { describe, it, expect } from "vitest";
import { computePace } from "./pace";
import { DEFAULT_COCKPIT_CONFIG } from "./config";
import type { EnrichedIssue, SprintInfo } from "./types";

function makeIssue(overrides: Partial<EnrichedIssue> = {}): EnrichedIssue {
  return {
    key: "PROJ-1",
    summary: "Test issue",
    status: "In Progress",
    statusCategory: "indeterminate",
    assigneeAccountId: null,
    assigneeName: null,
    epicKey: null,
    epicName: null,
    linkedPRs: [],
    createdAt: null,
    updatedAt: null,
    dueDate: null,
    storyPoints: null,
    ageDays: 0,
    daysSinceUpdate: 0,
    flags: {
      unassigned: false,
      noEpic: false,
      stale: false,
      addedAfterStart: false,
      dueSoon: false,
      prFailingCI: false,
      prWaitingReview: false,
      inProgressNoPR: false,
    },
    risk: { score: 0, level: "normal", reasons: [] },
    ...overrides,
  };
}

describe("computePace", () => {
  it("returns zero elapsed/dayOfSprint when sprint dates missing", () => {
    const issues = [makeIssue({ statusCategory: "done" }), makeIssue()];
    const pace = computePace(issues, null, new Date("2026-07-02"), DEFAULT_COCKPIT_CONFIG);
    expect(pace.sprintLength).toBe(0);
    expect(pace.dayOfSprint).toBe(0);
    expect(pace.elapsedPct).toBe(0);
    expect(pace.totalCount).toBe(2);
    expect(pace.doneCount).toBe(1);
  });

  it("returns zero elapsed when sprint has no dates", () => {
    const sprint: SprintInfo = { id: 1, startDate: null, endDate: null };
    const pace = computePace([], sprint, new Date("2026-07-02"), DEFAULT_COCKPIT_CONFIG);
    expect(pace.elapsedPct).toBe(0);
    expect(pace.sprintLength).toBe(0);
  });

  it("computes donePct from ticket count", () => {
    const issues = [
      makeIssue({ statusCategory: "done" }),
      makeIssue({ statusCategory: "done" }),
      makeIssue({ statusCategory: "indeterminate" }),
      makeIssue({ statusCategory: "new" }),
    ];
    const pace = computePace(issues, null, new Date(), DEFAULT_COCKPIT_CONFIG);
    expect(pace.totalCount).toBe(4);
    expect(pace.doneCount).toBe(2);
    expect(pace.remainingCount).toBe(2);
    expect(pace.donePct).toBe(0.5);
  });

  it("handles empty issue list", () => {
    const pace = computePace([], null, new Date(), DEFAULT_COCKPIT_CONFIG);
    expect(pace.totalCount).toBe(0);
    expect(pace.doneCount).toBe(0);
    expect(pace.donePct).toBe(0);
  });

  it("computes elapsedPct and behindPace correctly mid-sprint", () => {
    const sprint: SprintInfo = {
      id: 1,
      startDate: "2026-07-01T00:00:00Z",
      endDate: "2026-07-15T00:00:00Z",
    };
    // 14 days total (7/1 → 7/15), now is 7/8 (7 days in)
    const now = new Date("2026-07-08T00:00:00Z");
    const issues = [
      makeIssue({ statusCategory: "done" }),
      makeIssue({ statusCategory: "done" }),
      makeIssue(),
      makeIssue(),
      makeIssue(),
      makeIssue(),
    ];
    const pace = computePace(issues, sprint, now, DEFAULT_COCKPIT_CONFIG);
    expect(pace.sprintLength).toBe(14);
    expect(pace.dayOfSprint).toBe(7);
    expect(pace.elapsedPct).toBeCloseTo(0.5, 2);
    expect(pace.donePct).toBeCloseTo(0.333, 2);
    // 0.333 < 0.5 - 0.1 → 0.333 < 0.4 → behind
    expect(pace.behindPace).toBe(true);
  });

  it("is not behind pace when within tolerance", () => {
    const sprint: SprintInfo = {
      id: 1,
      startDate: "2026-07-01T00:00:00Z",
      endDate: "2026-07-11T00:00:00Z",
    };
    // 10 days, now 7/6 = 5 days in → elapsedPct = 0.5
    const now = new Date("2026-07-06T00:00:00Z");
    const issues = [
      makeIssue({ statusCategory: "done" }),
      makeIssue({ statusCategory: "done" }),
      makeIssue(),
      makeIssue(),
      makeIssue(),
    ];
    // donePct = 2/5 = 0.4, elapsedPct = 0.5, tolerance = 0.1 → 0.4 >= 0.5-0.1 (0.4) → not behind
    const pace = computePace(issues, sprint, now, DEFAULT_COCKPIT_CONFIG);
    expect(pace.behindPace).toBe(false);
  });

  it("is ahead of pace when donePct > elapsedPct", () => {
    const sprint: SprintInfo = {
      id: 1,
      startDate: "2026-07-01T00:00:00Z",
      endDate: "2026-07-11T00:00:00Z",
    };
    const now = new Date("2026-07-06T00:00:00Z"); // 50% elapsed
    const issues = [
      makeIssue({ statusCategory: "done" }),
      makeIssue({ statusCategory: "done" }),
      makeIssue({ statusCategory: "done" }),
      makeIssue(),
      makeIssue(),
    ];
    // donePct = 3/5 = 0.6 > 0.5 → not behind
    const pace = computePace(issues, sprint, now, DEFAULT_COCKPIT_CONFIG);
    expect(pace.behindPace).toBe(false);
  });

  it("clamps elapsedPct to [0,1] when now is before start", () => {
    const sprint: SprintInfo = {
      id: 1,
      startDate: "2026-07-10T00:00:00Z",
      endDate: "2026-07-20T00:00:00Z",
    };
    const now = new Date("2026-07-05T00:00:00Z");
    const pace = computePace([makeIssue()], sprint, now, DEFAULT_COCKPIT_CONFIG);
    expect(pace.elapsedPct).toBe(0);
    expect(pace.dayOfSprint).toBe(0);
  });

  it("clamps elapsedPct to 1 when now is after end", () => {
    const sprint: SprintInfo = {
      id: 1,
      startDate: "2026-07-01T00:00:00Z",
      endDate: "2026-07-10T00:00:00Z",
    };
    const now = new Date("2026-07-20T00:00:00Z");
    const pace = computePace([makeIssue()], sprint, now, DEFAULT_COCKPIT_CONFIG);
    expect(pace.elapsedPct).toBe(1);
    expect(pace.dayOfSprint).toBe(9); // min(sprintLength, dayOfSprint)
  });
});
