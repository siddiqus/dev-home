import { describe, it, expect } from "vitest";
import type { GitHubPR } from "../../types";
import type { TicketRef, WorkdaySections } from "./types";
import { workdayToMarkdown } from "./workdayMarkdown";

const NOW = new Date("2026-10-11T10:00:00Z");
const t = (key: string, summary = `S ${key}`, offSprint = false): TicketRef => ({
  key,
  summary,
  statusName: null,
  offSprint,
  updated: null,
});
const pr = (n: number, o: Partial<GitHubPR> = {}): GitHubPR =>
  ({
    id: n,
    number: n,
    title: `PR ${n}`,
    html_url: `https://github.com/o/app/pull/${n}`,
    draft: false,
    created_at: "2026-10-09T10:00:00Z",
    repo_full_name: "o/app",
    ...o,
  }) as GitHubPR;

function sections(o: Partial<WorkdaySections> = {}): WorkdaySections {
  const empty = { items: [], loading: false, error: null };
  return {
    done: empty,
    workingOn: empty,
    reviewing: empty,
    reviewRequestedUrls: new Set(),
    blockers: empty,
    waiting: empty,
    notStarted: { ...empty, offSprintItems: [] },
    offSprintCount: 0,
    ...o,
  } as WorkdaySections;
}

describe("workdayToMarkdown", () => {
  it("returns empty string when there is nothing", () => {
    expect(workdayToMarkdown(sections(), "", NOW)).toBe("");
  });

  it("renders the three headings with dedupe and suffixes", () => {
    const blocked = pr(3310, { title: "WMU-402 a" });
    const s = sections({
      done: {
        loading: false,
        error: null,
        items: [
          {
            kind: "merged",
            pr: pr(2231, { title: "CCP-1187: Fix autosave race" }),
            ticket: t("CCP-1187"),
            at: "2026-10-10T10:00:00Z",
          },
          {
            kind: "status",
            ticket: t("WMU-402"),
            toStatus: "Code Review",
            at: "2026-10-10T09:00:00Z",
          },
          {
            kind: "reviewed",
            pr: pr(1, { state: "merged" }),
            ticket: t("CPC-49"),
            state: "APPROVED",
            at: "2026-10-10T08:00:00Z",
          },
          {
            kind: "reviewed",
            pr: pr(2),
            ticket: null,
            state: "CHANGES_REQUESTED",
            at: "2026-10-10T07:00:00Z",
          },
        ],
      },
      workingOn: {
        loading: false,
        error: null,
        items: [
          { ticket: t("WMU-402", "Delete data"), prs: [blocked, pr(3318, { draft: true })] },
          { ticket: t("CCP-1210", "Spike paste"), prs: [] },
          { ticket: t("CHD-88", "Preview links", true), prs: [] },
          { ticket: t("CCP-1190", "Flagged one"), prs: [] },
          { ticket: null, prs: [pr(77, { title: "Bump deps" })] },
        ],
      },
      reviewing: {
        loading: false,
        error: null,
        items: [
          { ticket: t("DAM-640"), prs: [pr(5)] },
          { ticket: null, prs: [pr(6)] },
        ],
      },
      blockers: {
        loading: false,
        error: null,
        items: [{ kind: "flagged", ticket: t("CCP-1190") }],
      },
      waiting: {
        loading: false,
        error: null,
        items: [
          {
            kind: "awaiting-review",
            pr: blocked,
            ticket: t("WMU-402"),
            reviewers: ["Guru Gayen"],
            since: "2026-10-09T10:00:00Z",
          },
        ],
      },
    });

    expect(workdayToMarkdown(s, "- Need prod access\n\n  ask Abu about CPC-55  ", NOW)).toBe(
      [
        "*Yesterday*",
        "• Merged CCP-1187 Fix autosave race (#2231)",
        "• Moved WMU-402 to Code Review",
        "• Reviewed CPC-49 (approved, merged), app#2 (changes requested)",
        "",
        "*Today*",
        "• WMU-402 Delete data — #3310 in review, #3318 draft",
        "• CCP-1210 Spike paste (no PR yet)",
        "• CHD-88 Preview links (off-sprint, no PR yet)",
        "• Bump deps (#77)",
        "• Reviewing DAM-640, app#6",
        "",
        "*Blockers*",
        "• CCP-1190 flagged in Jira",
        "• WMU-402 #3310 waiting on review from Guru Gayen (2d)",
        "• Need prod access",
        "• ask Abu about CPC-55",
      ].join("\n"),
    );
  });

  it("keeps only needs-attention PRs out of Today", () => {
    const red = pr(1, { title: "AA-1 red" });
    const waitingPR = pr(2, { title: "AA-1 waiting" });
    const s = sections({
      workingOn: {
        loading: false,
        error: null,
        items: [
          { ticket: t("AA-1", "Thing"), prs: [red, waitingPR] },
          { ticket: t("AA-2", "All red"), prs: [pr(3)] },
        ],
      },
      blockers: {
        loading: false,
        error: null,
        items: [
          { kind: "pr", pr: red, ticket: t("AA-1"), reasons: ["CI failed"] },
          { kind: "pr", pr: pr(3), ticket: t("AA-2"), reasons: ["Merge conflict"] },
        ],
      },
      waiting: {
        loading: false,
        error: null,
        items: [{ kind: "your-move", pr: waitingPR, ticket: t("AA-1") }],
      },
    });
    expect(workdayToMarkdown(s, "", NOW)).toBe(
      [
        "*Today*",
        "• AA-1 Thing — #2 in review",
        "",
        "*Blockers*",
        "• AA-1 #1 ci failed",
        "• AA-2 #3 merge conflict",
        "• AA-1 #2 approved, ready to merge",
      ].join("\n"),
    );
  });

  it("drops a flagged ticket from Today even when it has unblocked PRs", () => {
    const s = sections({
      workingOn: {
        loading: false,
        error: null,
        items: [{ ticket: t("FL-1", "Flagged"), prs: [pr(10, { draft: true })] }],
      },
      blockers: { loading: false, error: null, items: [{ kind: "flagged", ticket: t("FL-1") }] },
    });
    expect(workdayToMarkdown(s, "", NOW)).toBe(["*Blockers*", "• FL-1 flagged in Jira"].join("\n"));
  });

  it("skips a Code Review line when the ticket already has a PR line in Blockers", () => {
    const p = pr(20);
    const s = sections({
      waiting: {
        loading: false,
        error: null,
        items: [
          {
            kind: "awaiting-review",
            pr: p,
            ticket: t("CR-1"),
            reviewers: ["Guru"],
            since: "2026-10-11T07:00:00Z",
          },
          { kind: "code-review", ticket: t("CR-1"), reviewers: ["Guru"] },
          { kind: "code-review", ticket: t("CR-2"), reviewers: ["Abu"] },
        ],
      },
    });
    expect(workdayToMarkdown(s, "", NOW)).toBe(
      [
        "*Blockers*",
        "• CR-1 #20 waiting on review from Guru (3h)",
        "• CR-2 in Code Review with Abu",
      ].join("\n"),
    );
  });

  it("strips a leading ticket key from merged PR titles", () => {
    const merged = (n: number, title: string, key: string | null) => ({
      kind: "merged" as const,
      pr: pr(n, { title }),
      ticket: key ? t(key) : null,
      at: "2026-10-10T10:00:00Z",
    });
    const s = sections({
      done: {
        loading: false,
        error: null,
        items: [
          merged(1, "ccp-1 - lower case dash", "CCP-1"),
          merged(2, "CCP-2 — em dash", "CCP-2"),
          merged(3, "CCP-3", "CCP-3"),
          merged(4, "CCP-40 not mine", "CCP-4"),
          merged(5, "No ticket", null),
        ],
      },
    });
    expect(workdayToMarkdown(s, "", NOW)).toBe(
      [
        "*Yesterday*",
        "• Merged CCP-1 lower case dash (#1)",
        "• Merged CCP-2 em dash (#2)",
        "• Merged CCP-3 (#3)",
        "• Merged CCP-4 CCP-40 not mine (#4)",
        "• Merged No ticket (#5)",
      ].join("\n"),
    );
  });
});
