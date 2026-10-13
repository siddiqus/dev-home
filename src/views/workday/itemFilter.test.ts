import { describe, it, expect } from "vitest";
import type { GitHubPR } from "../../types";
import {
  filterFocusByItems,
  filterSectionsByItems,
  itemFilterOptions,
  parseItemFilter,
} from "./itemFilter";
import type { FocusData, TicketRef, WorkdaySections } from "./types";

function pr(n: number, login = "me", name?: string): GitHubPR {
  return {
    user: { login, avatar_url: "", name },
    id: n,
    number: n,
    title: `PR ${n}`,
    html_url: `https://github.com/o/r/pull/${n}`,
    updated_at: "2026-10-10T10:00:00Z",
  } as GitHubPR;
}

const ticket = (key: string): TicketRef => ({
  key,
  summary: `Summary ${key}`,
  statusName: null,
  offSprint: false,
  updated: null,
});

const section = <T>(items: T[]) => ({ items, loading: false, error: null });

const sections: WorkdaySections = {
  done: section([{ kind: "merged", pr: pr(1), ticket: ticket("A-1"), at: "" } as const]),
  workingOn: section([
    { ticket: ticket("A-1"), prs: [pr(2), pr(3, "shunjid", "Shunjid R")] },
    { ticket: ticket("B-2"), prs: [] },
    { ticket: null, prs: [pr(4)] },
  ]),
  reviewing: section([{ ticket: ticket("C-3"), prs: [pr(5, "shunjid")] }]),
  reviewRequestedUrls: new Set(),
  blockers: section([{ kind: "flagged", ticket: ticket("B-2") } as const]),
  waiting: section([]),
  notStarted: { ...section([]), offSprintItems: [] },
  offSprintCount: 0,
};

const focus: FocusData = {
  pinned: [],
  needs: [
    {
      tier: "ship",
      verb: "Merge",
      tone: "success",
      pr: pr(2),
      ticketKey: "A-1",
      reason: "",
      issues: [{ verb: "Merge", tone: "success", reason: "" }],
      at: "",
    },
  ],
  mentions: [
    {
      id: "gh:1",
      source: "GitHub",
      who: "abu",
      ticketKey: null,
      where: "r#9",
      snippet: "",
      at: "",
      url: "https://github.com/o/r/pull/9#issuecomment-1",
    },
  ],
  working: [],
  waiting: { onReviewers: [], onAuthor: [], approved: [] },
};

describe("item filter", () => {
  it("is null when nothing is picked, leaving data untouched", () => {
    expect(parseItemFilter([])).toBeNull();
    expect(filterSectionsByItems(sections, null)).toBe(sections);
    expect(filterFocusByItems(focus, null)).toBe(focus);
  });

  it("a picked ticket shows up in every section that has it", () => {
    const s = filterSectionsByItems(sections, parseItemFilter(["t:B-2"]));
    expect(s.done.items).toEqual([]);
    expect(s.workingOn.items.map((g) => g.ticket?.key)).toEqual(["B-2"]);
    expect(s.blockers.items).toHaveLength(1);
    expect(s.reviewing.items).toEqual([]);
  });

  it("a picked ticket keeps all its PRs; a picked PR narrows its group", () => {
    const byTicket = filterSectionsByItems(sections, parseItemFilter(["t:A-1"]));
    expect(byTicket.workingOn.items[0].prs).toHaveLength(2);
    expect(byTicket.done.items).toHaveLength(1);

    const byPR = filterSectionsByItems(
      sections,
      parseItemFilter(["pr:https://github.com/o/r/pull/3"]),
    );
    expect(byPR.workingOn.items).toHaveLength(1);
    expect(byPR.workingOn.items[0].prs.map((p) => p.number)).toEqual([3]);
    expect(byPR.done.items).toEqual([]);
  });

  it("a picked author keeps their PRs in every section", () => {
    const s = filterSectionsByItems(sections, parseItemFilter(["a:shunjid"]));
    expect(s.workingOn.items.map((g) => g.prs.map((p) => p.number))).toEqual([[3]]);
    expect(s.reviewing.items[0].prs.map((p) => p.number)).toEqual([5]);
    expect(s.done.items).toEqual([]);
    expect(s.blockers.items).toEqual([]);
  });

  it("matches GitHub mentions by their PR url", () => {
    const f = filterFocusByItems(focus, parseItemFilter(["pr:https://github.com/o/r/pull/9"]));
    expect(f.mentions).toHaveLength(1);
    expect(f.needs).toEqual([]);
  });

  it("lists each ticket and PR once: tickets, then PRs, then authors", () => {
    const opts = itemFilterOptions(sections, focus, new Map());
    expect(opts.map((o) => o.value)).toEqual([
      "t:A-1",
      "t:B-2",
      "t:C-3",
      "pr:https://github.com/o/r/pull/1",
      "pr:https://github.com/o/r/pull/2",
      "pr:https://github.com/o/r/pull/3",
      "pr:https://github.com/o/r/pull/4",
      "pr:https://github.com/o/r/pull/5",
      "pr:https://github.com/o/r/pull/9",
      "a:me",
      "a:shunjid",
    ]);
    expect(opts.map((o) => o.tag?.label)).toEqual([
      ...Array(3).fill("Jira"),
      ...Array(6).fill("PR"),
      ...Array(2).fill("User"),
    ]);
    expect(opts[0].label).toBe("A-1 · Summary A-1");
    expect(opts[3].label).toBe("r#1 · PR 1 · @me");
    expect(opts[8].label).toBe("r#9");
    expect(opts[9].label).toBe("@me");
    expect(opts[10].label).toBe("@shunjid · Shunjid R");
  });
});
