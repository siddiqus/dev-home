import { describe, it, expect } from "vitest";
import type { DashboardIssue, LinkedPR, WorkloadEntry } from "../../../types/teams";
import {
  describeSignals,
  flagSummary,
  memberTickets,
  prBadges,
  sortByNeed,
  statusBucket,
} from "./memberSignals";

// Local noon, so calendar-day math doesn't depend on the test machine's zone.
const NOW = new Date(2026, 6, 2, 12, 0, 0);

const NO_FLAGS = {
  unassigned: false,
  noEpic: false,
  stale: false,
  addedAfterStart: false,
  dueSoon: false,
  prFailingCI: false,
  prWaitingReview: false,
  inProgressNoPR: false,
};

function issue(over: Partial<DashboardIssue> = {}): DashboardIssue {
  return {
    key: "WMU-1",
    summary: "A ticket",
    status: "In Progress",
    statusCategory: "indeterminate",
    assigneeAccountId: "u1",
    assigneeName: "Shunjid",
    epicKey: null,
    epicName: null,
    linkedPRs: [],
    createdAt: null,
    updatedAt: null,
    dueDate: null,
    storyPoints: null,
    ageDays: 0,
    daysSinceUpdate: 0,
    flags: NO_FLAGS,
    risk: { score: 0, level: "normal", reasons: [] },
    ...over,
  };
}

function pr(over: Partial<LinkedPR> = {}): LinkedPR {
  return {
    number: 12,
    title: "WMU-1 change",
    repo_full_name: "acme/web",
    html_url: "https://github.com/acme/web/pull/12",
    state: "open",
    checks_status: null,
    author: "shunjid",
    createdAt: null,
    reviewState: null,
    waitingReview: false,
    ...over,
  };
}

describe("describeSignals", () => {
  it("says how long a stale ticket has gone without an update", () => {
    const signals = describeSignals(
      issue({ daysSinceUpdate: 4, flags: { ...NO_FLAGS, stale: true } }),
      NOW,
    );
    expect(signals).toEqual([{ key: "stale", tone: "warning", text: "No update for 4 days" }]);
  });

  it("names the PR that is failing CI", () => {
    const signals = describeSignals(
      issue({
        linkedPRs: [pr({ number: 7 }), pr({ number: 12, checks_status: "FAILURE" })],
        flags: { ...NO_FLAGS, prFailingCI: true },
      }),
      NOW,
    );
    expect(signals).toEqual([{ key: "prFailingCI", tone: "danger", text: "web#12 is failing CI" }]);
  });

  it("says how long the PR has waited for a first review", () => {
    const signals = describeSignals(
      issue({
        linkedPRs: [pr({ number: 2381, waitingReview: true, createdAt: "2026-06-30T10:00:00" })],
        flags: { ...NO_FLAGS, prWaitingReview: true },
      }),
      NOW,
    );
    expect(signals).toEqual([
      {
        key: "prWaitingReview",
        tone: "warning",
        text: "web#2381 has waited 2 days for a first review",
      },
    ]);
  });

  it.each([
    ["2026-07-02", "Due today"],
    ["2026-07-03", "Due tomorrow"],
    ["2026-07-04", "Due in 2 days"],
    ["2026-07-01", "Overdue by 1 day"],
    ["2026-06-29", "Overdue by 3 days"],
    // Full ISO timestamps carry the same calendar day.
    ["2026-07-03T00:00:00.000Z", "Due tomorrow"],
  ])("describes due date %s as %s", (dueDate, text) => {
    const signals = describeSignals(issue({ dueDate, flags: { ...NO_FLAGS, dueSoon: true } }), NOW);
    expect(signals).toEqual([{ key: "dueSoon", tone: "warning", text }]);
  });

  it("explains context-only signals in plain words", () => {
    const signals = describeSignals(
      issue({ flags: { ...NO_FLAGS, inProgressNoPR: true, addedAfterStart: true } }),
      NOW,
    );
    expect(signals).toEqual([
      { key: "inProgressNoPR", tone: "neutral", text: "In progress, but no PR is linked yet" },
      { key: "addedAfterStart", tone: "neutral", text: "Added after the sprint started" },
    ]);
  });

  it("says a ticket in review has no PR", () => {
    const signals = describeSignals(
      issue({ status: "In Review", flags: { ...NO_FLAGS, inProgressNoPR: true } }),
      NOW,
    );
    expect(signals).toEqual([
      { key: "inProgressNoPR", tone: "neutral", text: "In review, but no PR is linked yet" },
    ]);
  });

  it("does not treat a missing epic as a signal", () => {
    expect(describeSignals(issue({ flags: { ...NO_FLAGS, noEpic: true } }), NOW)).toEqual([]);
  });

  it("lists blocking signals before slowing ones and context last", () => {
    const signals = describeSignals(
      issue({
        dueDate: "2026-07-03",
        daysSinceUpdate: 3,
        linkedPRs: [pr({ checks_status: "FAILURE" })],
        flags: {
          ...NO_FLAGS,
          addedAfterStart: true,
          dueSoon: true,
          prFailingCI: true,
          stale: true,
        },
      }),
      NOW,
    );
    expect(signals.map((s) => s.key)).toEqual([
      "prFailingCI",
      "stale",
      "dueSoon",
      "addedAfterStart",
    ]);
  });
});

describe("prBadges", () => {
  const badge = (number: number, tone: string, label: string) => ({
    repo: "acme/web",
    number,
    tone,
    label,
  });

  it("returns nothing when the ticket has no PR", () => {
    expect(prBadges(issue())).toEqual([]);
  });

  it("flags an open PR failing CI first", () => {
    expect(
      prBadges(issue({ linkedPRs: [pr({ checks_status: "FAILURE", waitingReview: true })] })),
    ).toEqual([badge(12, "danger", "failing CI")]);
  });

  it("warns when an open PR has waited too long for review", () => {
    expect(prBadges(issue({ linkedPRs: [pr({ waitingReview: true })] }))).toEqual([
      badge(12, "warning", "awaiting review"),
    ]);
  });

  it("shows a fresh review request without warning", () => {
    expect(prBadges(issue({ linkedPRs: [pr({ reviewState: "REVIEW_REQUIRED" })] }))).toEqual([
      badge(12, "neutral", "awaiting review"),
    ]);
  });

  it("shows approved and changes-requested reviews", () => {
    expect(prBadges(issue({ linkedPRs: [pr({ reviewState: "APPROVED" })] }))).toEqual([
      badge(12, "success", "approved"),
    ]);
    expect(prBadges(issue({ linkedPRs: [pr({ reviewState: "CHANGES_REQUESTED" })] }))).toEqual([
      badge(12, "warning", "changes requested"),
    ]);
  });

  it("lists every open PR before the merged ones", () => {
    const linkedPRs = [
      pr({ number: 3, state: "merged" }),
      pr({ number: 4 }),
      pr({ number: 5, state: "closed", mergedAt: "2026-07-01T10:00:00Z" }),
      pr({ number: 6, reviewState: "APPROVED" }),
    ];
    expect(prBadges(issue({ linkedPRs }))).toEqual([
      badge(4, "neutral", "open"),
      badge(6, "success", "approved"),
      badge(3, "purple", "merged"),
      badge(5, "purple", "merged"),
    ]);
  });

  it("leaves out PRs closed without a merge", () => {
    expect(prBadges(issue({ linkedPRs: [pr({ state: "closed" })] }))).toEqual([]);
  });
});

describe("statusBucket", () => {
  it("splits review statuses out of in-progress and to-do", () => {
    expect(statusBucket({ status: "In Review", statusCategory: "indeterminate" })).toBe("inReview");
    expect(statusBucket({ status: "Code Review", statusCategory: "new" })).toBe("inReview");
    expect(statusBucket({ status: "In Progress", statusCategory: "indeterminate" })).toBe(
      "indeterminate",
    );
    expect(statusBucket({ status: "To Do", statusCategory: "new" })).toBe("new");
    expect(statusBucket({ status: "Done", statusCategory: "done" })).toBe("done");
  });
});

describe("memberTickets", () => {
  const high = (key: string, score: number) =>
    issue({ key, risk: { score, level: "high", reasons: [] } });

  it("only includes the member's own tickets", () => {
    const result = memberTickets(
      [issue({ key: "A" }), issue({ key: "B", assigneeAccountId: "u2" })],
      "u1",
    );
    expect(result.groups.flatMap((g) => g.issues.map((i) => i.key))).toEqual(["A"]);
  });

  it("counts flagged tickets by level", () => {
    const result = memberTickets(
      [
        high("H1", 5),
        high("H2", 7),
        issue({ key: "A1", risk: { score: 3, level: "attention", reasons: [] } }),
        issue({ key: "N1" }),
      ],
      "u1",
    );
    expect(result.atRisk).toBe(2);
    expect(result.needsLook).toBe(1);
  });

  it("groups tickets review-first, skips empty groups, and orders each group", () => {
    const result = memberTickets(
      [
        issue({ key: "D-old", status: "Done", statusCategory: "done", daysSinceUpdate: 6 }),
        issue({ key: "P-fresh", daysSinceUpdate: 0 }),
        issue({ key: "D-new", status: "Done", statusCategory: "done", daysSinceUpdate: 1 }),
        issue({ key: "R", status: "In Review" }),
        issue({ key: "P-stuck", daysSinceUpdate: 5 }),
      ],
      "u1",
    );
    expect(result.groups.map((g) => [g.bucket, g.issues.map((i) => i.key)])).toEqual([
      ["inReview", ["R"]],
      // Open work: longest without an update first.
      ["indeterminate", ["P-stuck", "P-fresh"]],
      // Done: most recent first.
      ["done", ["D-new", "D-old"]],
    ]);
  });
});

describe("flagSummary", () => {
  it("counts flagged tickets by level in words", () => {
    expect(flagSummary([{ level: "high" }])).toBe("1 ticket at risk");
    expect(flagSummary([{ level: "high" }, { level: "high" }])).toBe("2 tickets at risk");
    expect(flagSummary([{ level: "attention" }])).toBe("1 ticket needs a look");
    expect(flagSummary([{ level: "attention" }, { level: "attention" }])).toBe(
      "2 tickets need a look",
    );
    expect(flagSummary([{ level: "attention" }, { level: "high" }, { level: "attention" }])).toBe(
      "1 ticket at risk, 2 need a look",
    );
  });
});

describe("sortByNeed", () => {
  const member = (accountId: string, over: Partial<WorkloadEntry>): WorkloadEntry =>
    ({ accountId, riskLevel: "normal", stalledCount: 0, wip: 0, ...over }) as WorkloadEntry;

  it("puts who needs help first: risk level, then stalled, then WIP", () => {
    const sorted = sortByNeed([
      member("calm", {}),
      member("busy", { wip: 5 }),
      member("look", { riskLevel: "attention" }),
      member("stuck", { riskLevel: "high", stalledCount: 1 }),
      member("stucker", { riskLevel: "high", stalledCount: 3 }),
    ]);
    expect(sorted.map((m) => m.accountId)).toEqual(["stucker", "stuck", "look", "busy", "calm"]);
  });
});
