import { describe, it, expect } from "vitest";
import type { DashboardIssue, LinkedPR } from "../../../types/teams";
import {
  describeSignals,
  flagSummary,
  memberTickets,
  prBadge,
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
  it("leaves staleness to the card's last-update line", () => {
    const signals = describeSignals(
      issue({ daysSinceUpdate: 4, flags: { ...NO_FLAGS, stale: true } }),
      NOW,
    );
    expect(signals).toEqual([]);
  });

  it("names the PR that is failing CI", () => {
    const signals = describeSignals(
      issue({
        linkedPRs: [pr({ number: 7 }), pr({ number: 12, checks_status: "FAILURE" })],
        flags: { ...NO_FLAGS, prFailingCI: true },
      }),
      NOW,
    );
    expect(signals).toEqual([{ key: "prFailingCI", tone: "danger", text: "PR #12 is failing CI" }]);
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
        text: "PR #2381 has waited 2 days for a first review",
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

  it("does not treat a missing epic as a signal", () => {
    expect(describeSignals(issue({ flags: { ...NO_FLAGS, noEpic: true } }), NOW)).toEqual([]);
  });

  it("lists blocking signals before slowing ones and context last", () => {
    const signals = describeSignals(
      issue({
        dueDate: "2026-07-03",
        linkedPRs: [pr({ checks_status: "FAILURE" })],
        flags: { ...NO_FLAGS, addedAfterStart: true, dueSoon: true, prFailingCI: true },
      }),
      NOW,
    );
    expect(signals.map((s) => s.tone)).toEqual(["danger", "warning", "neutral"]);
  });
});

describe("prBadge", () => {
  it("returns null when the ticket has no PR", () => {
    expect(prBadge(issue())).toBeNull();
  });

  it("flags an open PR failing CI first", () => {
    expect(
      prBadge(issue({ linkedPRs: [pr({ checks_status: "FAILURE", waitingReview: true })] })),
    ).toEqual({ number: 12, tone: "danger", label: "failing CI" });
  });

  it("warns when an open PR has waited too long for review", () => {
    expect(prBadge(issue({ linkedPRs: [pr({ waitingReview: true })] }))).toEqual({
      number: 12,
      tone: "warning",
      label: "awaiting review",
    });
  });

  it("shows a fresh review request without warning", () => {
    expect(prBadge(issue({ linkedPRs: [pr({ reviewState: "REVIEW_REQUIRED" })] }))).toEqual({
      number: 12,
      tone: "neutral",
      label: "awaiting review",
    });
  });

  it("shows approved and changes-requested reviews", () => {
    expect(prBadge(issue({ linkedPRs: [pr({ reviewState: "APPROVED" })] }))).toEqual({
      number: 12,
      tone: "success",
      label: "approved",
    });
    expect(prBadge(issue({ linkedPRs: [pr({ reviewState: "CHANGES_REQUESTED" })] }))).toEqual({
      number: 12,
      tone: "warning",
      label: "changes requested",
    });
  });

  it("prefers an open PR over a merged one", () => {
    const linkedPRs = [pr({ number: 3, state: "merged" }), pr({ number: 4 })];
    expect(prBadge(issue({ linkedPRs }))).toEqual({ number: 4, tone: "neutral", label: "open" });
  });

  it("falls back to the merged PR", () => {
    expect(prBadge(issue({ linkedPRs: [pr({ number: 3, state: "merged" })] }))).toEqual({
      number: 3,
      tone: "purple",
      label: "merged",
    });
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

  it("splits flagged tickets by level, highest score first", () => {
    const result = memberTickets(
      [
        high("H1", 5),
        high("H2", 7),
        issue({ key: "A1", risk: { score: 3, level: "attention", reasons: [] } }),
        issue({ key: "N1" }),
      ],
      "u1",
    );
    expect(result.atRisk.map((i) => i.key)).toEqual(["H2", "H1"]);
    expect(result.needsLook.map((i) => i.key)).toEqual(["A1"]);
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
