import { describe, it, expect } from "vitest";
import { buildInsights } from "./insights";
import type { InsightInput } from "./insights";
import type { Ref } from "./types";

function makeInput(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    pace: {
      dayOfSprint: 5,
      sprintLength: 10,
      elapsedPct: 0.5,
      totalCount: 10,
      doneCount: 5,
      remainingCount: 5,
      donePct: 0.5,
      behindPace: false,
    },
    scope: { addedCount: 0 },
    needsAttention: {
      stale: [],
      waitingReview: [],
      failingCI: [],
      noLinkedPR: [],
      offBoard: [],
      scopeCreep: [],
      unassigned: [],
      noEpic: [],
    },
    prFlow: {
      open: 0,
      merged: 0,
      avgFirstReviewH: null,
      avgAgeDays: 0,
      failingChecks: 0,
      noJira: 0,
      jiraNoPR: 0,
    },
    loadBalance: { max: 5, min: 3, imbalance: 2 },
    ...overrides,
  };
}

function issueRef(key: string): Ref {
  return { kind: "issue", key };
}

describe("buildInsights", () => {
  it("returns empty array when no conditions met", () => {
    const insights = buildInsights(makeInput());
    expect(insights).toEqual([]);
  });

  it("emits behind-pace warning when behindPace is true", () => {
    const input = makeInput({
      pace: {
        dayOfSprint: 7,
        sprintLength: 10,
        elapsedPct: 0.7,
        totalCount: 10,
        doneCount: 3,
        remainingCount: 7,
        donePct: 0.3,
        behindPace: true,
      },
    });
    const insights = buildInsights(input);
    expect(insights).toHaveLength(1);
    expect(insights[0].key).toBe("behind-pace");
    expect(insights[0].severity).toBe("warn");
    expect(insights[0].title).toContain("Behind Pace");
    // elapsedPct 0.7 → 70%, donePct 0.3 → 30%
    expect(insights[0].detail).toContain("70%");
    expect(insights[0].detail).toContain("30%");
  });

  it("emits stale-work critical when stale tickets exist", () => {
    const input = makeInput({
      needsAttention: {
        stale: [issueRef("PROJ-1"), issueRef("PROJ-2"), issueRef("PROJ-3")],
        waitingReview: [],
        failingCI: [],
        noLinkedPR: [],
        offBoard: [],
        scopeCreep: [],
        unassigned: [],
        noEpic: [],
      },
    });
    const insights = buildInsights(input);
    expect(insights).toHaveLength(1);
    expect(insights[0].key).toBe("stale-work");
    expect(insights[0].severity).toBe("critical");
    expect(insights[0].title).toContain("Stale Work");
    expect(insights[0].detail).toContain("3");
  });

  it("emits review-bottleneck warning when PRs waiting review", () => {
    const input = makeInput({
      needsAttention: {
        stale: [],
        waitingReview: [issueRef("PROJ-1"), issueRef("PROJ-2")],
        failingCI: [],
        noLinkedPR: [],
        offBoard: [],
        scopeCreep: [],
        unassigned: [],
        noEpic: [],
      },
    });
    const insights = buildInsights(input);
    expect(insights).toHaveLength(1);
    expect(insights[0].key).toBe("review-bottleneck");
    expect(insights[0].severity).toBe("warn");
    expect(insights[0].title).toContain("Review Bottleneck");
    expect(insights[0].detail).toContain("2");
  });

  it("emits uneven-load warning when imbalance >= 3", () => {
    const input = makeInput({
      loadBalance: { max: 8, min: 2, imbalance: 6 },
    });
    const insights = buildInsights(input);
    expect(insights).toHaveLength(1);
    expect(insights[0].key).toBe("uneven-load");
    expect(insights[0].severity).toBe("warn");
    expect(insights[0].title).toContain("Uneven Load");
    expect(insights[0].detail).toContain("6");
  });

  it("does not emit uneven-load when imbalance < 3", () => {
    const input = makeInput({
      loadBalance: { max: 5, min: 3, imbalance: 2 },
    });
    const insights = buildInsights(input);
    expect(insights).toEqual([]);
  });

  it("emits hidden-work info when off-board PRs exist", () => {
    const input = makeInput({
      needsAttention: {
        stale: [],
        waitingReview: [],
        failingCI: [],
        noLinkedPR: [],
        offBoard: [issueRef("PROJ-1")],
        scopeCreep: [],
        unassigned: [],
        noEpic: [],
      },
    });
    const insights = buildInsights(input);
    expect(insights).toHaveLength(1);
    expect(insights[0].key).toBe("hidden-work");
    expect(insights[0].severity).toBe("info");
    expect(insights[0].title).toContain("Hidden Work");
    expect(insights[0].detail).toContain("1");
  });

  it("emits epic-drift info when no-epic issues exist", () => {
    const input = makeInput({
      needsAttention: {
        stale: [],
        waitingReview: [],
        failingCI: [],
        noLinkedPR: [],
        offBoard: [],
        scopeCreep: [],
        unassigned: [],
        noEpic: [issueRef("PROJ-1"), issueRef("PROJ-2")],
      },
    });
    const insights = buildInsights(input);
    expect(insights).toHaveLength(1);
    expect(insights[0].key).toBe("epic-drift");
    expect(insights[0].severity).toBe("info");
    expect(insights[0].title).toContain("Epic Drift");
    expect(insights[0].detail).toContain("2");
  });

  it("emits scope-increased info when scope added", () => {
    const input = makeInput({
      scope: { addedCount: 4 },
    });
    const insights = buildInsights(input);
    expect(insights).toHaveLength(1);
    expect(insights[0].key).toBe("scope-increased");
    expect(insights[0].severity).toBe("info");
    expect(insights[0].title).toContain("Scope Increased");
    expect(insights[0].detail).toContain("4");
  });

  it("sorts by severity: critical, warn, info", () => {
    const input = makeInput({
      pace: { ...makeInput().pace, behindPace: true }, // warn
      scope: { addedCount: 2 }, // info
      needsAttention: {
        stale: [issueRef("PROJ-1")], // critical
        waitingReview: [issueRef("PROJ-2")], // warn
        failingCI: [],
        noLinkedPR: [],
        offBoard: [issueRef("PROJ-3")], // info
        scopeCreep: [],
        unassigned: [],
        noEpic: [],
      },
      loadBalance: { max: 8, min: 2, imbalance: 6 }, // warn
    });
    const insights = buildInsights(input);
    expect(insights.length).toBeGreaterThan(0);
    const severities = insights.map((i) => i.severity);
    // critical first, then warn, then info
    let lastSev = "critical";
    for (const sev of severities) {
      if (lastSev === "critical" && sev === "warn") lastSev = "warn";
      else if (lastSev === "warn" && sev === "info") lastSev = "info";
      else if (lastSev === "critical") {
        expect(sev).toBe("critical");
      } else if (lastSev === "warn") {
        expect(["warn", "info"]).toContain(sev);
      }
    }
    // Verify critical comes first
    expect(insights[0].severity).toBe("critical");
  });

  it("rounds percentages to whole numbers", () => {
    const input = makeInput({
      pace: {
        dayOfSprint: 3,
        sprintLength: 7,
        elapsedPct: 0.428571, // ~43%
        totalCount: 9,
        doneCount: 3,
        remainingCount: 6,
        donePct: 0.333333, // ~33%
        behindPace: true,
      },
    });
    const insights = buildInsights(input);
    expect(insights[0].detail).toContain("43%");
    expect(insights[0].detail).toContain("33%");
  });

  it("emits multiple insights when multiple conditions met", () => {
    const input = makeInput({
      pace: { ...makeInput().pace, behindPace: true },
      scope: { addedCount: 1 },
      needsAttention: {
        stale: [issueRef("PROJ-1")],
        waitingReview: [issueRef("PROJ-2")],
        failingCI: [],
        noLinkedPR: [],
        offBoard: [],
        scopeCreep: [],
        unassigned: [],
        noEpic: [issueRef("PROJ-3")],
      },
      loadBalance: { max: 10, min: 1, imbalance: 9 },
    });
    const insights = buildInsights(input);
    expect(insights.length).toBe(6);
    const keys = insights.map((i) => i.key);
    expect(keys).toContain("behind-pace");
    expect(keys).toContain("stale-work");
    expect(keys).toContain("review-bottleneck");
    expect(keys).toContain("uneven-load");
    expect(keys).toContain("epic-drift");
    expect(keys).toContain("scope-increased");
  });
});
