import { describe, it, expect } from "vitest";
import type { AuthoredPR, DashboardIssue, LinkedPR, WorkloadEntry } from "../../../types/teams";
import {
  describeSignals,
  flagSummary,
  memberWork,
  sortByNeed,
  statusBucket,
  ticketPRs,
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

function authored(over: Partial<AuthoredPR> = {}): AuthoredPR {
  return {
    number: 50,
    title: "A PR",
    repo_full_name: "acme/web",
    html_url: "https://github.com/acme/web/pull/50",
    author: "shunjid",
    state: "open",
    createdAt: "2026-07-01T12:00:00Z",
    mergedAt: null,
    mergedBy: null,
    additions: 10,
    deletions: 2,
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

  it("leaves failing CI out: the PR's own line says it", () => {
    const signals = describeSignals(
      issue({
        linkedPRs: [pr({ number: 12, checks_status: "FAILURE" })],
        flags: { ...NO_FLAGS, prFailingCI: true },
      }),
      NOW,
    );
    expect(signals).toEqual([]);
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
    const signals = describeSignals(issue({ flags: { ...NO_FLAGS, inProgressNoPR: true } }), NOW);
    expect(signals).toEqual([
      { key: "inProgressNoPR", tone: "neutral", text: "In progress, but no PR is linked yet" },
    ]);
  });

  it("leaves a ticket added mid-sprint to its label", () => {
    expect(describeSignals(issue({ flags: { ...NO_FLAGS, addedAfterStart: true } }), NOW)).toEqual(
      [],
    );
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
    expect(signals.map((s) => s.key)).toEqual(["stale", "dueSoon"]);
  });
});

describe("ticketPRs", () => {
  const states = (i: DashboardIssue) => ticketPRs(i).map((p) => [p.number, p.tone, p.label]);

  it("returns nothing when the ticket has no PR", () => {
    expect(ticketPRs(issue())).toEqual([]);
  });

  it("flags an open PR failing CI first", () => {
    expect(
      states(issue({ linkedPRs: [pr({ checks_status: "FAILURE", waitingReview: true })] })),
    ).toEqual([[12, "danger", "failing CI"]]);
  });

  it("warns when an open PR has waited too long for review", () => {
    expect(states(issue({ linkedPRs: [pr({ waitingReview: true })] }))).toEqual([
      [12, "warning", "awaiting review"],
    ]);
  });

  it("shows a fresh review request without warning", () => {
    expect(states(issue({ linkedPRs: [pr({ reviewState: "REVIEW_REQUIRED" })] }))).toEqual([
      [12, "neutral", "awaiting review"],
    ]);
  });

  it("shows approved and changes-requested reviews", () => {
    expect(states(issue({ linkedPRs: [pr({ reviewState: "APPROVED" })] }))).toEqual([
      [12, "success", "approved"],
    ]);
    expect(states(issue({ linkedPRs: [pr({ reviewState: "CHANGES_REQUESTED" })] }))).toEqual([
      [12, "warning", "changes requested"],
    ]);
  });

  it("lists every open PR before the merged ones and leaves out PRs closed without a merge", () => {
    const linkedPRs = [
      pr({ number: 3, state: "merged" }),
      pr({ number: 4 }),
      pr({ number: 5, state: "closed", mergedAt: "2026-07-01T10:00:00Z" }),
      pr({ number: 6, reviewState: "APPROVED" }),
      pr({ number: 7, state: "closed" }),
    ];
    expect(states(issue({ linkedPRs }))).toEqual([
      [4, "neutral", "open"],
      [6, "success", "approved"],
      [3, "purple", "merged"],
      [5, "purple", "merged"],
    ]);
  });

  it("dates an open PR by when it opened and a merged one by when it merged, and by whom", () => {
    const [open, merged] = ticketPRs(
      issue({
        linkedPRs: [
          pr({ number: 1, createdAt: "2026-06-30T12:00:00Z", additions: 5, deletions: 1 }),
          pr({
            number: 2,
            state: "merged",
            createdAt: "2026-06-28T12:00:00Z",
            mergedAt: "2026-07-01T12:00:00Z",
            mergedBy: "bob",
          }),
        ],
      }),
    );
    expect(open).toMatchObject({
      merged: false,
      date: "2026-06-30T12:00:00Z",
      additions: 5,
      deletions: 1,
    });
    expect(merged).toMatchObject({ merged: true, date: "2026-07-01T12:00:00Z", mergedBy: "bob" });
  });

  it("fills lines changed and merger from the member's own copy when the ticket's lacks them", () => {
    // Payloads cached before linked PRs carried these fields.
    const linked = pr({ number: 50, state: "merged", mergedAt: "2026-07-01T12:00:00Z" });
    const own = authored({ state: "merged", mergedBy: "bob", additions: 30, deletions: 4 });
    const [line] = ticketPRs(issue({ linkedPRs: [linked] }), [own]);
    expect(line).toMatchObject({ mergedBy: "bob", additions: 30, deletions: 4 });
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

describe("memberWork", () => {
  const keys = (items: { issue: DashboardIssue }[]) => items.map((t) => t.issue.key);
  const flagged = (level: "high" | "attention", score: number) => ({
    risk: { score, level, reasons: [] },
  });

  it("only includes the member's own tickets", () => {
    const work = memberWork(
      [issue({ key: "A" }), issue({ key: "B", assigneeAccountId: "u2" })],
      [],
      "u1",
      "shunjid",
    );
    expect(work.groups.flatMap((g) => keys(g.items))).toEqual(["A"]);
  });

  it("puts flagged tickets on top, worst first, and leaves them out of their status group", () => {
    const work = memberWork(
      [
        issue({ key: "OK" }),
        issue({ key: "LOOK", ...flagged("attention", 3) }),
        issue({ key: "RISK-5", ...flagged("high", 5), daysSinceUpdate: 9 }),
        issue({ key: "RISK-7", ...flagged("high", 7) }),
        issue({ key: "LOOK-old", ...flagged("attention", 3), daysSinceUpdate: 4 }),
        issue({ key: "REVIEW", status: "In Review", ...flagged("attention", 4) }),
      ],
      [],
      "u1",
      "shunjid",
    );
    expect(keys(work.atRisk)).toEqual(["RISK-7", "RISK-5"]);
    expect(keys(work.needsLook)).toEqual(["REVIEW", "LOOK-old", "LOOK"]);
    expect(work.groups.map((g) => [g.status, keys(g.items)])).toEqual([["In Progress", ["OK"]]]);
  });

  it("groups the rest by Jira status: review first, A–Z within a stage, each group ordered", () => {
    const work = memberWork(
      [
        issue({ key: "D-old", status: "Done", statusCategory: "done", daysSinceUpdate: 6 }),
        issue({ key: "P-fresh", daysSinceUpdate: 0 }),
        issue({ key: "D-new", status: "Done", statusCategory: "done", daysSinceUpdate: 1 }),
        issue({ key: "R", status: "Code Review" }),
        issue({ key: "P-stuck", daysSinceUpdate: 5 }),
        issue({ key: "B", status: "Blocked" }),
        issue({ key: "T", status: "To Do", statusCategory: "new" }),
        issue({ key: "C", status: "Closed", statusCategory: "done" }),
      ],
      [],
      "u1",
      "shunjid",
    );
    expect(work.groups.map((g) => [g.status, g.bucket, keys(g.items)])).toEqual([
      ["Code Review", "inReview", ["R"]],
      ["Blocked", "indeterminate", ["B"]],
      // Open work: longest without an update first.
      ["In Progress", "indeterminate", ["P-stuck", "P-fresh"]],
      ["To Do", "new", ["T"]],
      ["Closed", "done", ["C"]],
      // Done: most recent first.
      ["Done", "done", ["D-new", "D-old"]],
    ]);
  });

  it("hangs each ticket's PRs under it", () => {
    const work = memberWork([issue({ linkedPRs: [pr({ number: 7 })] })], [], "u1", "shunjid");
    expect(work.groups[0]!.items[0]!.prs.map((p) => p.number)).toEqual([7]);
  });

  it("lists the member's other PRs, newest first, naming a teammate's ticket when there is one", () => {
    const issues = [
      issue({ key: "MINE", linkedPRs: [pr({ number: 50 })] }),
      issue({ key: "THEIRS", assigneeAccountId: "u2", linkedPRs: [pr({ number: 51 })] }),
    ];
    const prs = [
      authored({ number: 50 }), // on the member's own ticket: shown there instead
      authored({ number: 51, createdAt: "2026-06-29T12:00:00Z" }),
      authored({ number: 52, author: "Shunjid", createdAt: "2026-07-01T12:00:00Z" }),
      authored({ number: 53, author: "someone-else" }),
      authored({ number: 54, state: "closed" }), // closed without a merge
    ];
    const work = memberWork(issues, prs, "u1", "shunjid");
    expect(work.otherPRs.map((o) => [o.pr.number, o.forKey])).toEqual([
      [52, null],
      [51, "THEIRS"],
    ]);
  });

  it("has no other PRs for a member without a GitHub login", () => {
    expect(memberWork([], [authored()], "u1", "").otherPRs).toEqual([]);
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
