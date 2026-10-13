import { describe, it, expect } from "vitest";
import type { GitHubPR, JiraIssue, SprintTicket, OffSprintTicket } from "../../types";
import { EMPTY_EXTRAS, type WorkdayExtras } from "../../services/workday";
import {
  blockerLabel,
  buildWorkday,
  filterWorkday,
  groupByTicketKey,
  inProgressCount,
  reviewingLines,
  statusCategoryOf,
} from "./buildWorkday";
import type { WorkdayInputs } from "./types";

const NOW = new Date("2026-10-11T10:00:00Z");

function pr(n: number, o: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: n,
    number: n,
    title: `PR ${n}`,
    html_url: `https://github.com/o/r/pull/${n}`,
    state: "open",
    draft: false,
    created_at: "2026-10-09T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: `feature/x-${n}` },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: ["guru"],
    ...o,
  };
}

function issue(
  key: string,
  cat: "new" | "indeterminate" | "done",
  o: Partial<JiraIssue> = {},
): JiraIssue {
  return {
    key,
    summary: `Summary ${key}`,
    status: {
      name: cat === "new" ? "To Do" : cat === "done" ? "Done" : "In Progress",
      statusCategory: { key: cat, colorName: "x" },
    },
    priority: { name: "Medium", iconUrl: "" },
    assignee: { displayName: "Me", avatarUrls: { "48x48": "" } },
    project: { key: key.split("-")[0], name: "P" },
    created: "2026-09-01T00:00:00Z",
    updated: "2026-10-05T00:00:00Z",
    codeReviewers: [],
    ...o,
  } as JiraIssue;
}

const sprintT = (key: string, o: Partial<SprintTicket> = {}): SprintTicket => ({
  key,
  summary: `Summary ${key}`,
  status: { name: "To Do", categoryKey: "new" },
  sprintName: "Sprint 42",
  points: 3,
  flagged: false,
  ...o,
});

const off = (i: JiraIssue, flagged = false): OffSprintTicket => ({ ...i, flagged });

function inputs(
  o: Partial<Omit<WorkdayInputs, "extras">> & { extras?: Partial<WorkdayExtras> } = {},
): WorkdayInputs {
  const { extras, ...rest } = o;
  return {
    openPRs: [],
    reviewRequests: [],
    reviewingPRs: [],
    assignedIssues: [],
    allIssues: [],
    ...rest,
    extras: {
      ...EMPTY_EXTRAS,
      sprint: { data: [], error: null },
      offSprint: { data: [], error: null },
      doneTickets: { data: [], error: null },
      merged: { data: [], error: null },
      reviewed: { data: [], error: null },
      ...extras,
    },
  };
}

describe("statusCategoryOf", () => {
  it("prefers the key and falls back to colour", () => {
    expect(statusCategoryOf(issue("AA-1", "indeterminate"))).toBe("indeterminate");
    const legacy = issue("AA-2", "new");
    (legacy.status.statusCategory as any) = { colorName: "yellow" };
    expect(statusCategoryOf(legacy)).toBe("indeterminate");
  });
});

describe("buildWorkday", () => {
  it("groups my PRs by ticket, adds in-progress tickets without a PR, newest first", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [
          pr(1, { title: "No key here", updated_at: "2026-10-11T00:00:00Z" }),
          pr(2, { title: "CCP-1 a", updated_at: "2026-10-09T00:00:00Z" }),
          pr(3, { title: "CCP-1 b", updated_at: "2026-10-08T00:00:00Z" }),
        ],
        assignedIssues: [
          issue("CCP-1", "indeterminate"),
          issue("CCP-2", "indeterminate"),
          issue("CCP-3", "new"),
        ],
        extras: {
          sprint: { data: [sprintT("CCP-1"), sprintT("CCP-2"), sprintT("CCP-3")], error: null },
        },
      }),
      NOW,
    );
    const groups = s.workingOn.items.map((g) => [
      g.ticket?.key ?? null,
      g.prs.map((p) => p.number),
    ]);
    expect(groups).toEqual([
      [null, [1]],
      ["CCP-1", [2, 3]],
      ["CCP-2", []],
    ]);
    expect(s.workingOn.items[1].ticket).toMatchObject({
      summary: "Summary CCP-1",
      statusName: "In Progress",
      offSprint: false,
    });
  });

  it("flags assigned tickets missing from open sprints and routes them by state", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [pr(5, { title: "CHD-9 fix" })],
        assignedIssues: [issue("CHD-9", "indeterminate"), issue("CHD-7", "indeterminate")],
        extras: {
          sprint: { data: [], error: null },
          offSprint: {
            data: [
              off(issue("CHD-88", "new", { updated: "2026-10-01T00:00:00Z" }), true),
              off(issue("CHD-50", "new", { updated: "2026-07-01T00:00:00Z" })), // > 60d old
            ],
            error: null,
          },
        },
      }),
      NOW,
    );
    expect(s.workingOn.items.map((g) => [g.ticket?.key, g.ticket?.offSprint])).toEqual([
      ["CHD-9", true],
      ["CHD-7", true], // in progress, no PR, kept regardless of age
    ]);
    expect(s.notStarted.offSprintItems.map((i) => i.ticket.key)).toEqual(["CHD-88"]);
    expect(s.blockers.items).toEqual([
      { kind: "flagged", ticket: expect.objectContaining({ key: "CHD-88", offSprint: true }) },
    ]);
    expect(s.offSprintCount).toBe(3);
  });

  it("flags nothing while sprint data is unavailable", () => {
    const s = buildWorkday(
      inputs({
        assignedIssues: [issue("AA-1", "new")],
        extras: { sprint: { data: null, error: "boom" } },
      }),
      NOW,
    );
    expect(s.notStarted.items.map((i) => [i.ticket.key, i.ticket.offSprint, i.sprintName])).toEqual(
      [["AA-1", false, null]],
    );
    expect(s.notStarted.error).toBe("boom");
    expect(s.offSprintCount).toBe(0);
  });

  it("lists not-started sprint tickets with sprint name and points, excluding ones with a PR", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [pr(9, { title: "AA-2 started" })],
        assignedIssues: [issue("AA-1", "new"), issue("AA-2", "new")],
        extras: {
          sprint: { data: [sprintT("AA-1", { points: 5 }), sprintT("AA-2")], error: null },
        },
      }),
      NOW,
    );
    expect(s.notStarted.items).toEqual([
      {
        ticket: expect.objectContaining({ key: "AA-1" }),
        sprintName: "Sprint 42",
        points: 5,
        updated: "2026-10-05T00:00:00Z",
      },
    ]);
  });

  it("puts In progress tickets closest to done first", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [
          pr(1, { title: "CCP-1 a", draft: true, updated_at: "2026-10-12T00:00:00Z" }),
          pr(2, {
            title: "CCP-2 a",
            review_status: "APPROVED",
            unresolved_thread_count: 2,
            updated_at: "2026-10-01T00:00:00Z",
          }),
          pr(3, { title: "CCP-3 a", updated_at: "2026-10-11T00:00:00Z" }),
        ],
      }),
      NOW,
    );
    expect(s.workingOn.items.map((g) => g.ticket?.key)).toEqual(["CCP-2", "CCP-3", "CCP-1"]);
  });

  it("dedupes reviewing by URL, puts already-reviewed groups first, and never flags it", () => {
    const shared = pr(20, { title: "OTHER-1 x", user: { login: "bob", avatar_url: "" } });
    const s = buildWorkday(
      inputs({
        reviewRequests: [shared],
        reviewingPRs: [
          shared,
          pr(21, { title: "OTHER-2 y", updated_at: "2026-10-08T00:00:00Z" }),
          pr(22, { title: "OTHER-3 z", updated_at: "2026-10-09T00:00:00Z" }),
        ],
        extras: { sprint: { data: [], error: null } },
      }),
      NOW,
    );
    expect(s.reviewing.items.flatMap((g) => g.prs.map((p) => p.number))).toEqual([22, 21, 20]);
    expect(s.reviewing.items.every((g) => g.ticket === null || g.ticket.offSprint === false)).toBe(
      true,
    );
    expect([...s.reviewRequestedUrls]).toEqual([shared.html_url]);
  });

  it("selects blockers and waiting items", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [
          pr(1, { title: "AA-1 red", checks_status: "FAILURE" }),
          pr(2, { title: "AA-2 lonely", requested_reviewers: [] }),
          pr(3, { title: "AA-3 waiting" }),
          pr(4, { title: "AA-4 approved", review_status: "APPROVED" }),
          pr(5, { title: "AA-5 draft", draft: true }),
        ],
        assignedIssues: [
          issue("AA-6", "indeterminate", {
            status: {
              name: "Code Review",
              statusCategory: { key: "indeterminate", colorName: "yellow" },
            },
            codeReviewers: [{ displayName: "Guru Gayen", avatarUrls: { "48x48": "" } }],
          } as Partial<JiraIssue>),
        ],
        extras: { sprint: { data: [sprintT("AA-6")], error: null } },
      }),
      NOW,
    );
    expect(
      s.blockers.items.map((b) => (b.kind === "pr" ? [b.pr.number, b.reasons] : b.kind)),
    ).toEqual([
      [1, ["CI failed"]],
      [2, ["No reviewer requested"]],
    ]);
    expect(
      s.waiting.items.map((w) =>
        w.kind === "code-review" ? [w.kind, w.ticket.key, w.reviewers] : [w.kind, w.pr.number],
      ),
    ).toEqual([
      ["awaiting-review", 3],
      ["your-move", 4],
      ["code-review", "AA-6", ["Guru Gayen"]],
    ]);
  });

  it("surfaces off-sprint query errors on notStarted and blockers", () => {
    const s = buildWorkday(
      inputs({ extras: { offSprint: { data: null, error: "jql bad" } } }),
      NOW,
    );
    expect(s.notStarted.error).toBe("jql bad");
    expect(s.blockers.error).toBe("jql bad");
    const both = buildWorkday(
      inputs({
        extras: {
          sprint: { data: null, error: "sprint down" },
          offSprint: { data: null, error: "jql bad" },
        },
      }),
      NOW,
    );
    expect(both.notStarted.error).toBe("sprint down; jql bad");
    expect(both.blockers.error).toBe("sprint down; jql bad");
  });

  it("keeps notStarted and blockers loading until off-sprint data arrives", () => {
    const s = buildWorkday(inputs({ extras: { offSprint: { data: null, error: null } } }), NOW);
    expect(s.notStarted.loading).toBe(true);
    expect(s.blockers.loading).toBe(true);
  });

  it("leaves PRs in the merge queue out of blockers and waiting", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [
          pr(1, { title: "AA-1 queued", in_merge_queue: true }),
          pr(2, { title: "AA-2 queued", in_merge_queue: true, review_status: "APPROVED" }),
          pr(3, { title: "AA-3 queued", in_merge_queue: true, requested_reviewers: [] }),
        ],
      }),
      NOW,
    );
    expect(s.blockers.items).toEqual([]);
    expect(s.waiting.items).toEqual([]);
  });

  it("gives conflict and changes-requested blocker reasons", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [
          pr(1, { title: "AA-1 conflict", has_conflict: true }),
          pr(2, { title: "AA-2 cr", review_status: "CHANGES_REQUESTED" }),
          pr(3, { title: "AA-3 both", has_conflict: true, review_status: "CHANGES_REQUESTED" }),
        ],
      }),
      NOW,
    );
    expect(
      s.blockers.items.map((b) => (b.kind === "pr" ? [b.pr.number, b.reasons] : b.kind)),
    ).toEqual([
      [1, ["Merge conflict"]],
      [2, ["Changes requested"]],
      [3, ["Merge conflict", "Changes requested"]],
    ]);
  });

  it("never flags a reviewed PR even when its ticket is off-sprint in Done", () => {
    const s = buildWorkday(
      inputs({
        assignedIssues: [issue("OFF-7", "indeterminate")],
        extras: {
          sprint: { data: [], error: null },
          reviewed: {
            data: [
              {
                pr: pr(30, { title: "OFF-7 theirs", user: { login: "bob", avatar_url: "" } }),
                state: "APPROVED",
                submittedAt: "2026-10-10T09:00:00Z",
              },
            ],
            error: null,
          },
          doneTickets: {
            data: [
              {
                key: "OFF-7",
                summary: "Off",
                toStatus: "In Progress",
                changedAt: "2026-10-10T08:00:00Z",
              },
            ],
            error: null,
          },
        },
      }),
      NOW,
    );
    const byKind = Object.fromEntries(s.done.items.map((d) => [d.kind, d.ticket?.offSprint]));
    expect(byKind).toEqual({ reviewed: false, status: true });
  });

  it("merges done items newest first and joins errors", () => {
    const s = buildWorkday(
      inputs({
        extras: {
          merged: {
            data: [pr(1, { title: "CCP-1 m", merged_at: "2026-10-09T10:00:00Z" })],
            error: null,
          },
          reviewed: { data: null, error: "gh down" },
          doneTickets: {
            data: [
              {
                key: "WMU-402",
                summary: "Del",
                toStatus: "Code Review",
                changedAt: "2026-10-10T08:00:00Z",
              },
            ],
            error: null,
          },
        },
      }),
      NOW,
    );
    expect(s.done.items.map((d) => d.kind)).toEqual(["status", "merged"]);
    expect(s.done.error).toBe("gh down");
    expect(s.done.loading).toBe(false);
  });

  it("counts off-sprint tickets in done items", () => {
    const s = buildWorkday(
      inputs({
        assignedIssues: [issue("OFF-99", "done")],
        extras: {
          sprint: { data: [], error: null },
          merged: {
            data: [pr(1, { title: "OFF-99 merged", merged_at: "2026-10-09T10:00:00Z" })],
            error: null,
          },
        },
      }),
      NOW,
    );
    expect(s.done.items).toHaveLength(1);
    expect(s.done.items[0].ticket?.offSprint).toBe(true);
    expect(s.offSprintCount).toBe(1);
  });
});

describe("filterWorkday", () => {
  const s = buildWorkday(
    inputs({
      openPRs: [
        pr(1, { title: "IN-1 a" }),
        pr(2, { title: "OUT-1 b" }),
        pr(3, { title: "no key" }),
      ],
      reviewRequests: [pr(4, { title: "RR-1 r" })],
      assignedIssues: [issue("IN-1", "indeterminate"), issue("OUT-1", "indeterminate")],
      extras: { sprint: { data: [sprintT("IN-1")], error: null } },
    }),
    NOW,
  );

  it("sprint only hides off-sprint and keeps no-ticket PRs", () => {
    const f = filterWorkday(s, "sprint");
    expect(f.workingOn.items.map((g) => g.ticket?.key ?? null)).toEqual(["IN-1", null]);
    expect(f.reviewing.items).toHaveLength(1);
    expect(f.reviewing.items[0].ticket?.key).toBe("RR-1");
    expect(f.offSprintCount).toBe(1);
  });

  it("off-sprint shows only flagged items", () => {
    const f = filterWorkday(s, "off");
    expect(f.workingOn.items.map((g) => g.ticket?.key ?? null)).toEqual(["OUT-1"]);
    expect(f.reviewing.items).toHaveLength(0);
  });

  it("all is identity", () => {
    expect(filterWorkday(s, "all")).toBe(s);
  });
});

describe("In progress", () => {
  it("contains each open PR exactly once", () => {
    const openPRs = [
      pr(1, { title: "CCP-1 a", checks_status: "FAILURE" }),
      pr(2, { title: "CCP-1 b", requested_reviewers: [] }),
      pr(3, { title: "CCP-2 c", review_status: "APPROVED" }),
      pr(4, { title: "no key", has_conflict: true }),
      pr(5, { title: "also no key", draft: true }),
    ];
    const s = buildWorkday(
      inputs({
        openPRs,
        assignedIssues: [issue("CCP-1", "indeterminate"), issue("CCP-3", "indeterminate")],
      }),
      NOW,
    );
    const numbers = s.workingOn.items.flatMap((g) => g.prs.map((p) => p.number));
    expect([...numbers].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(numbers).size).toBe(numbers.length);
    // CCP-1, CCP-2, CCP-3 (no PR yet), plus two ticketless PRs.
    expect(inProgressCount(s.workingOn.items)).toBe(5);
  });
});

describe("inProgressCount", () => {
  it("counts one per ticket and one per ticketless PR", () => {
    const t = { key: "A-1", summary: "", statusName: null, offSprint: false, updated: null };
    expect(inProgressCount([])).toBe(0);
    expect(
      inProgressCount([
        { ticket: t, prs: [pr(1), pr(2)] },
        { ticket: { ...t, key: "A-2" }, prs: [] },
        { ticket: null, prs: [pr(3), pr(4), pr(5)] },
      ]),
    ).toBe(5);
  });
});

describe("reviewingLines", () => {
  it("lists each PR once with its state, newest first", () => {
    const bob = { user: { login: "bob", avatar_url: "" } };
    const shared = pr(20, {
      ...bob,
      title: "OTHER-1 shared",
      viewer_engaged: true,
      updated_at: "2026-10-09T00:00:00Z",
    });
    const s = buildWorkday(
      inputs({
        reviewRequests: [
          shared,
          pr(21, { ...bob, title: "OTHER-1 new", updated_at: "2026-10-08T00:00:00Z" }),
        ],
        reviewingPRs: [
          shared,
          pr(22, {
            ...bob,
            title: "OTHER-2 commits",
            new_commits_since_review: true,
            viewer_review_state: "CHANGES_REQUESTED",
            updated_at: "2026-10-11T00:00:00Z",
          }),
          pr(23, {
            ...bob,
            title: "no key",
            new_commits_since_review: true,
            viewer_review_state: "APPROVED",
            updated_at: "2026-10-10T00:00:00Z",
          }),
        ],
      }),
      NOW,
    );
    expect(reviewingLines(s).map((l) => [l.pr.number, l.state, l.ticket?.key ?? null])).toEqual([
      [22, "new-commits", "OTHER-2"],
      [23, "waiting-author", null],
      [20, "re-requested", "OTHER-1"],
      [21, "requested", "OTHER-1"],
    ]);
  });
});

describe("blockerLabel", () => {
  const t = { key: "A-1", summary: "", statusName: null, offSprint: false, updated: null };

  it("labels flagged tickets", () => {
    expect(blockerLabel({ kind: "flagged", ticket: t })).toEqual({
      label: "Flagged",
      tone: "danger",
    });
  });

  it("uses the first reason, shortened", () => {
    const item = (reasons: string[]) => ({ kind: "pr" as const, pr: pr(1), ticket: null, reasons });
    expect(blockerLabel(item(["CI failed", "Merge conflict"]))).toEqual({
      label: "CI failing",
      tone: "danger",
    });
    expect(blockerLabel(item(["Merge conflict"]))).toEqual({ label: "Conflict", tone: "danger" });
    expect(blockerLabel(item(["Changes requested"]))).toEqual({
      label: "Changes requested",
      tone: "danger",
    });
    expect(blockerLabel(item(["No reviewer requested"]))).toEqual({
      label: "No reviewer",
      tone: "warning",
    });
  });

  it("labels real blockers from buildWorkday", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [
          pr(1, { title: "AA-1", checks_status: "FAILURE", updated_at: "2026-10-10T03:00:00Z" }),
          pr(2, { title: "AA-2", has_conflict: true, updated_at: "2026-10-10T02:00:00Z" }),
          pr(3, { title: "AA-3", requested_reviewers: [], updated_at: "2026-10-10T01:00:00Z" }),
        ],
      }),
      NOW,
    );
    expect(s.blockers.items.map((b) => blockerLabel(b).label)).toEqual([
      "CI failing",
      "Conflict",
      "No reviewer",
    ]);
  });
});

describe("groupByTicketKey", () => {
  it("groups by key in first-seen order; null keys stand alone", () => {
    const items = [
      { id: 1, key: "A-1" },
      { id: 2, key: "B-1" },
      { id: 3, key: null },
      { id: 4, key: "A-1" },
      { id: 5, key: null },
    ];
    const groups = groupByTicketKey(items, (i) => i.key);
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ["A-1", [1, 4]],
      ["B-1", [2]],
      [null, [3]],
      [null, [5]],
    ]);
  });
});
