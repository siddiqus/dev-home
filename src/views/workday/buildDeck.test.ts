import { describe, it, expect } from "vitest";
import type { GitHubComment, GitHubPR, JiraComment, JiraIssue, Note } from "../../types";
import { buildDeck, deckProjects, shortKey, EMPTY_DECK_STATE, type DeckState } from "./buildDeck";
import type { DeckInputs, DeckTicket } from "./deckTypes";

const NOW = new Date("2026-10-14T12:00:00Z");

function pr(n: number, o: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: n,
    number: n,
    title: `PR ${n}`,
    html_url: `https://github.com/o/repo/pull/${n}`,
    state: "open",
    draft: false,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: `feature/x-${n}` },
    base: { ref: "main" },
    repo_full_name: "o/repo",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: ["guru"],
    ...o,
  };
}

/** Someone else's PR. */
const theirs = (n: number, o: Partial<GitHubPR> = {}) =>
  pr(n, { user: { login: "abu", avatar_url: "" }, requested_reviewers: ["me"], ...o });

function issue(key: string, o: Partial<JiraIssue> = {}): JiraIssue {
  return {
    key,
    summary: `Summary ${key}`,
    status: { name: "In Progress", statusCategory: { key: "indeterminate", colorName: "yellow" } },
    priority: { name: "Medium", iconUrl: "" },
    assignee: { displayName: "Me", avatarUrls: { "48x48": "" } },
    project: { key: key.split("-")[0], name: "Project" },
    created: "2026-09-01T10:00:00Z",
    updated: "2026-10-10T10:00:00Z",
    codeReviewers: [],
    ...o,
  };
}

function inputs(o: Partial<DeckInputs> = {}): DeckInputs {
  return {
    openPRs: [],
    reviewRequests: [],
    reviewingPRs: [],
    assignedIssues: [],
    allIssues: [],
    githubMentions: [],
    jiraMentions: [],
    notes: [],
    ...o,
  };
}

const build = (inp: Partial<DeckInputs>, state: Partial<DeckState> = {}) =>
  buildDeck(inputs(inp), { ...EMPTY_DECK_STATE, ...state }, NOW);

const ids = (tickets: DeckTicket[]) => tickets.map((t) => t.id);
const numbers = (t: DeckTicket) => t.prs.map((p) => p.pr.number);
const byId = (tickets: DeckTicket[], id: string) => tickets.find((t) => t.id === id)!;
const all = (d: { current: DeckTicket[]; open: DeckTicket[]; closed: DeckTicket[] }) => [
  ...d.current,
  ...d.open,
  ...d.closed,
];

describe("buildDeck grouping", () => {
  it("groups PRs by ticket key, with mine and review PRs on one tab", () => {
    const deck = build({
      openPRs: [pr(1, { title: "CCP-1 backend" }), pr(2, { title: "CCP-1 frontend" })],
      reviewRequests: [theirs(3, { title: "CCP-1 infra" })],
      allIssues: [issue("CCP-1")],
    });
    expect(ids(deck.open)).toEqual(["CCP-1"]);
    const t = deck.open[0];
    expect(t.key).toBe("CCP-1");
    expect(t.title).toBe("Summary CCP-1");
    expect(t.ticket).toMatchObject({ key: "CCP-1", statusName: "In Progress" });
    expect(numbers(t).sort()).toEqual([1, 2, 3]);
    expect(t.prs.find((p) => p.pr.number === 3)!.mine).toBe(false);
    expect(t.prs.find((p) => p.pr.number === 1)!.mine).toBe(true);
    expect(deck.current).toEqual([]);
    expect(deck.closed).toEqual([]);
    expect(deck.unmatched).toEqual([]);
    expect(deck.counts).toEqual({ tickets: 1, current: 0, unseen: 0 });
  });

  it("falls back to the first PR's title without the key when Jira has no summary", () => {
    const deck = build({ openPRs: [pr(1, { title: "CCP-9: Fix the thing" })] });
    expect(deck.open[0].title).toBe("Fix the thing");
    expect(deck.open[0].ticket).toMatchObject({ key: "CCP-9", summary: "" });
  });

  it("makes each ticketless PR its own tab labelled repo#number and title", () => {
    const deck = build({
      openPRs: [pr(5, { title: "Bump deps" }), pr(6, { title: "Fix typo" })],
    });
    expect(ids(deck.open).sort()).toEqual([
      "pr:https://github.com/o/repo/pull/5",
      "pr:https://github.com/o/repo/pull/6",
    ]);
    const t = byId(deck.open, "pr:https://github.com/o/repo/pull/5");
    expect(t.key).toBeNull();
    expect(t.ticket).toBeNull();
    expect(t.title).toBe("repo#5 Bump deps");
  });

  it("adds in-progress tickets assigned to me with no PR as 'No PR yet' tabs", () => {
    const deck = build({
      openPRs: [pr(1, { title: "CCP-1 work" })],
      assignedIssues: [
        issue("CCP-1"),
        issue("CCP-2"),
        issue("CCP-3", {
          status: { name: "To Do", statusCategory: { key: "new", colorName: "blue-gray" } },
        }),
      ],
    });
    expect(ids(deck.open).sort()).toEqual(["CCP-1", "CCP-2"]);
    const t = byId(deck.open, "CCP-2");
    expect(t.prs).toEqual([]);
    expect(t.title).toBe("Summary CCP-2");
    expect(t.status).toBe("No PR yet");
    expect(t.stripe).toBe("neutral");
    expect(t.reviewOnly).toBe(false);
  });

  it("does not add a 'No PR yet' tab for an in-progress ticket that has a review PR", () => {
    const deck = build({
      reviewRequests: [theirs(3, { title: "CCP-2 thing" })],
      assignedIssues: [issue("CCP-2")],
    });
    expect(ids(deck.open)).toEqual(["CCP-2"]);
    expect(numbers(deck.open[0])).toEqual([3]);
  });
});

describe("buildDeck collection and de-duplication", () => {
  it("includes reviewing PRs only with new commits since a non-approving review", () => {
    const deck = build({
      reviewingPRs: [
        theirs(1, { new_commits_since_review: true, viewer_review_state: "COMMENTED" }),
        theirs(2, { new_commits_since_review: true, viewer_review_state: "APPROVED" }),
        theirs(3, { new_commits_since_review: false, viewer_review_state: "CHANGES_REQUESTED" }),
      ],
    });
    expect(deck.open.flatMap(numbers)).toEqual([1]);
    expect(deck.open[0].prs[0].signals.map((s) => s.label)).toContain(
      "New commits since your review",
    );
  });

  it("de-duplicates by html_url across all three lists, mine winning", () => {
    const shared = pr(1, { title: "CCP-1 x" });
    const deck = build({
      openPRs: [shared],
      reviewRequests: [shared, theirs(2, { title: "CCP-1 y" })],
      reviewingPRs: [
        { ...theirs(2, { title: "CCP-1 y" }), new_commits_since_review: true },
        { ...shared, new_commits_since_review: true },
      ],
    });
    const t = deck.open[0];
    expect(numbers(t).sort()).toEqual([1, 2]);
    expect(t.prs.find((p) => p.pr.number === 1)!.mine).toBe(true);
    // The requested copy wins over the reviewing copy: it gets the request signal.
    expect(t.prs.find((p) => p.pr.number === 2)!.signals[0].label).toMatch(/^Review requested/);
  });
});

describe("buildDeck ticket fields", () => {
  it("is reviewOnly only when every PR on the tab is a review PR", () => {
    const deck = build({
      openPRs: [pr(1, { title: "CCP-1 mine" })],
      reviewRequests: [theirs(2, { title: "CCP-1 theirs" }), theirs(3, { title: "CCP-2 theirs" })],
    });
    expect(byId(deck.open, "CCP-1").reviewOnly).toBe(false);
    expect(byId(deck.open, "CCP-2").reviewOnly).toBe(true);
  });

  it("uses the worst tone across PRs as the stripe", () => {
    const deck = build({
      openPRs: [
        pr(1, { title: "CCP-1 a", review_status: "APPROVED", checks_status: "SUCCESS" }),
        pr(2, { title: "CCP-1 b", has_conflict: true }),
      ],
      reviewRequests: [theirs(3, { title: "CCP-2 c" })],
    });
    expect(byId(deck.open, "CCP-1").stripe).toBe("danger");
    expect(byId(deck.open, "CCP-2").stripe).toBe("info");
  });

  it("shows the PR that needs me most and its headline as the status line", () => {
    const deck = build({
      openPRs: [
        pr(1203, { title: "CCP-1 a", has_conflict: true, checks_status: "SUCCESS" }),
        pr(1207, { title: "CCP-1 b", review_status: "APPROVED", checks_status: "SUCCESS" }),
      ],
    });
    expect(deck.open[0].status).toBe("#1203 ✗ Resolve conflict with main");
  });

  it("status line ignores current: the needs-me PR is named even when another is current", () => {
    const ready = pr(2, { title: "CCP-1 b", review_status: "APPROVED", checks_status: "SUCCESS" });
    const deck = build(
      { openPRs: [pr(1, { title: "CCP-1 a", has_conflict: true }), ready] },
      { current: [`pr:${ready.html_url}`] },
    );
    expect(numbers(deck.current[0])).toEqual([2, 1]);
    expect(deck.current[0].status).toBe("#1 ✗ Resolve conflict with main");
  });

  it("flags current PRs and tickets from state.current and counts current tickets", () => {
    const a = pr(1, { title: "CCP-1 a" });
    const deck = build(
      {
        openPRs: [a, pr(2, { title: "CCP-2 b" })],
        assignedIssues: [issue("CCP-3")],
      },
      { current: [`pr:${a.html_url}`, "ticket:CCP-3"] },
    );
    expect(byId(all(deck), "CCP-1").current).toBe(true);
    expect(byId(all(deck), "CCP-1").prs[0].current).toBe(true);
    expect(byId(all(deck), "CCP-2").current).toBe(false);
    expect(byId(all(deck), "CCP-3").current).toBe(true);
    expect(deck.counts).toEqual({ tickets: 3, current: 2, unseen: 0 });
  });
});

describe("buildDeck PR order on the card", () => {
  it("orders current first, then needs-me priority, then newest", () => {
    const old = pr(1, { title: "CCP-1 a", draft: true, updated_at: "2026-10-01T10:00:00Z" });
    const newer = pr(2, { title: "CCP-1 b", draft: true, updated_at: "2026-10-12T10:00:00Z" });
    const failing = pr(3, { title: "CCP-1 c", checks_status: "FAILURE" });
    const review = theirs(4, { title: "CCP-1 d" });
    const ready = pr(5, { title: "CCP-1 e", review_status: "APPROVED", checks_status: "SUCCESS" });
    const deck = build(
      { openPRs: [old, newer, failing, ready], reviewRequests: [review] },
      { current: [`pr:${old.html_url}`] },
    );
    // current (1), danger (3), info (4), success (5), neutral newest first (2)
    expect(numbers(deck.current[0])).toEqual([1, 3, 4, 5, 2]);
  });

  it("carries signals and priority on each PR", () => {
    const deck = build({ openPRs: [pr(1, { title: "CCP-1 a", has_conflict: true })] });
    const p = deck.open[0].prs[0];
    expect(p.signals[0]).toEqual({ label: "✗ Resolve conflict with main", tone: "danger" });
    expect(p.priority).toBe(0);
  });
});

describe("buildDeck arrival order", () => {
  it("orders by oldest PR created_at when there is no arrival state, and assigns sequence numbers", () => {
    const deck = build({
      openPRs: [
        pr(1, { title: "CCP-1 a", created_at: "2026-10-05T10:00:00Z" }),
        pr(2, { title: "CCP-2 a", created_at: "2026-10-03T10:00:00Z" }),
        pr(3, { title: "CCP-1 b", created_at: "2026-10-02T10:00:00Z" }),
      ],
      assignedIssues: [issue("CCP-3", { created: "2026-10-04T10:00:00Z" })],
    });
    expect(ids(deck.open)).toEqual(["CCP-1", "CCP-2", "CCP-3"]);
    expect(deck.stateUpdates.arrival).toEqual({ "CCP-1": 0, "CCP-2": 1, "CCP-3": 2 });
  });

  it("uses state.arrival when present and numbers new ids after the max", () => {
    const deck = build(
      {
        openPRs: [
          pr(1, { title: "CCP-1 a", created_at: "2026-10-01T10:00:00Z" }),
          pr(2, { title: "CCP-2 a", created_at: "2026-10-02T10:00:00Z" }),
          pr(3, { title: "CCP-3 a", created_at: "2026-09-01T10:00:00Z" }),
          pr(4, { title: "CCP-4 a", created_at: "2026-09-02T10:00:00Z" }),
        ],
      },
      { arrival: { "CCP-2": 4, "CCP-1": 7, "CCP-GONE": 9 } },
    );
    expect(ids(deck.open)).toEqual(["CCP-2", "CCP-1", "CCP-3", "CCP-4"]);
    expect(deck.stateUpdates.arrival).toEqual({ "CCP-3": 10, "CCP-4": 11 });
  });

  it("emits no arrival update when every id is known", () => {
    const deck = build(
      { openPRs: [pr(1, { title: "CCP-1 a" })] },
      { arrival: { "CCP-1": 0 }, seeded: true },
    );
    expect(deck.stateUpdates.arrival).toBeUndefined();
    expect(deck.stateUpdates).toEqual({});
  });

  it("is stable across refreshes with re-sorted inputs", () => {
    const prs = [
      pr(1, { title: "CCP-1 a", created_at: "2026-10-05T10:00:00Z" }),
      pr(2, { title: "CCP-2 a", created_at: "2026-10-03T10:00:00Z" }),
      pr(3, { title: "Ticketless", created_at: "2026-10-03T10:00:00Z" }),
      pr(4, { title: "CCP-4 a", created_at: "2026-10-03T10:00:00Z" }),
    ];
    const first = build({ openPRs: prs });
    const reversed = build({ openPRs: [...prs].reverse() });
    expect(ids(reversed.open)).toEqual(ids(first.open));
    expect(reversed.stateUpdates.arrival).toEqual(first.stateUpdates.arrival);

    // A refresh with the arrival persisted and activity changed keeps the order.
    const arrival = first.stateUpdates.arrival!;
    const touched = prs.map((p) => ({ ...p, updated_at: "2026-10-14T11:00:00Z" })).reverse();
    const again = build({ openPRs: touched }, { arrival, seeded: true });
    expect(ids(again.open)).toEqual(ids(first.open));
    expect(again.stateUpdates).toEqual({});
  });
});

function ghMention(id: number, prNumber: number, o: Partial<GitHubComment> = {}): GitHubComment {
  return {
    id,
    html_url: `https://github.com/o/repo/pull/${prNumber}#issuecomment-${id}`,
    body: `comment ${id}`,
    created_at: "2026-10-12T10:00:00Z",
    updated_at: "2026-10-12T10:00:00Z",
    user: { login: "abu", avatar_url: "" },
    pr_number: prNumber,
    repo_full_name: "o/repo",
    context_title: `PR ${prNumber}`,
    reason: "comment",
    ...o,
  };
}

function jiraMention(id: string, key: string, o: Partial<JiraComment> = {}): JiraComment {
  return {
    id,
    author: { displayName: "Abu", avatarUrls: { "48x48": "" } },
    body: { text: `jira ${id}` },
    created: "2026-10-12T10:00:00Z",
    updated: "2026-10-12T10:00:00Z",
    issueKey: key,
    issueSummary: `Summary ${key}`,
    ...o,
  };
}

/** Seeded state where every given PR was seen at its current updated_at. */
const seenAll = (prs: GitHubPR[]): Partial<DeckState> => ({
  seeded: true,
  seen: Object.fromEntries(prs.map((p) => [p.html_url, p.updated_at])),
});

describe("buildDeck current group", () => {
  const a = pr(1, { title: "CCP-1 a", created_at: "2026-10-01T10:00:00Z" });
  const b = pr(2, { title: "CCP-2 b", created_at: "2026-10-02T10:00:00Z" });
  const c = pr(3, { title: "CCP-3 c", created_at: "2026-10-03T10:00:00Z" });
  const arrival = { "CCP-1": 0, "CCP-2": 1, "CCP-3": 2 };

  it("puts tickets with a current item in Current, ordered by currentTickets", () => {
    const deck = build(
      { openPRs: [a, b, c] },
      {
        arrival,
        current: [`pr:${c.html_url}`, `pr:${a.html_url}`],
        currentTickets: ["CCP-3", "CCP-1"],
      },
    );
    expect(ids(deck.current)).toEqual(["CCP-3", "CCP-1"]);
    expect(ids(deck.open)).toEqual(["CCP-2"]);
  });

  it("puts current tickets missing from currentTickets last, in arrival order", () => {
    const deck = build(
      { openPRs: [a, b, c] },
      {
        arrival,
        current: [`pr:${c.html_url}`, `pr:${a.html_url}`, `pr:${b.html_url}`],
        currentTickets: ["CCP-2"],
      },
    );
    expect(ids(deck.current)).toEqual(["CCP-2", "CCP-1", "CCP-3"]);
  });

  it("counts a ticket:<KEY> entry as current for a PR-less ticket", () => {
    const deck = build(
      { assignedIssues: [issue("CCP-9")] },
      { current: ["ticket:CCP-9"], currentTickets: ["CCP-9"] },
    );
    expect(ids(deck.current)).toEqual(["CCP-9"]);
  });

  it("returns an unmarked ticket to its arrival slot in Open", () => {
    const marked = build(
      { openPRs: [a, b, c] },
      { arrival, current: [`pr:${b.html_url}`], currentTickets: ["CCP-2"] },
    );
    expect(ids(marked.open)).toEqual(["CCP-1", "CCP-3"]);
    const unmarked = build({ openPRs: [a, b, c] }, { arrival, current: [], currentTickets: [] });
    expect(ids(unmarked.current)).toEqual([]);
    expect(ids(unmarked.open)).toEqual(["CCP-1", "CCP-2", "CCP-3"]);
  });
});

describe("buildDeck auto-close and pruning", () => {
  const a = pr(1, { title: "CCP-1 a" });
  const b = pr(2, { title: "CCP-1 b" });

  it("drops a PR that merged or closed (absent from inputs); the ticket stays with its other PRs", () => {
    const before = build({ openPRs: [a, b] });
    expect(numbers(before.open[0]).sort()).toEqual([1, 2]);
    const after = build({ openPRs: [b] }, { arrival: before.stateUpdates.arrival });
    expect(ids(after.open)).toEqual(["CCP-1"]);
    expect(numbers(after.open[0])).toEqual([2]);
  });

  it("removes a ticket whose last PR merged or whose review was fulfilled", () => {
    const review = theirs(5, { title: "CCP-5 theirs" });
    const before = build({ openPRs: [a], reviewRequests: [review] });
    expect(ids(all(before)).sort()).toEqual(["CCP-1", "CCP-5"]);
    // Review submitted: no longer requested and not a new-commits re-review.
    const fulfilled = { ...review, viewer_review_state: "APPROVED" as const };
    const after = build({ openPRs: [a], reviewingPRs: [fulfilled] });
    expect(ids(all(after))).toEqual(["CCP-1"]);
  });

  it("prunes current entries for PRs and tickets that left the deck", () => {
    const deck = build(
      { openPRs: [b], assignedIssues: [issue("CCP-7")] },
      {
        current: [`pr:${a.html_url}`, `pr:${b.html_url}`, "ticket:CCP-7", "ticket:CCP-GONE"],
        currentTickets: ["CCP-1", "CCP-7"],
      },
    );
    expect(deck.stateUpdates.dropCurrent).toEqual([`pr:${a.html_url}`, "ticket:CCP-GONE"]);
    expect(ids(deck.current)).toEqual(["CCP-1", "CCP-7"]);
  });

  it("emits no dropCurrent when every current entry is still in the deck", () => {
    const deck = build({ openPRs: [a] }, { current: [`pr:${a.html_url}`] });
    expect(deck.stateUpdates.dropCurrent).toBeUndefined();
  });

  it("emits dropCurrentTickets when every current item of a ticket is being dropped", () => {
    // CCP-1 has two current items (a and b), both are dropped (a merges)
    const deck = build(
      { openPRs: [] },
      {
        current: [`pr:${a.html_url}`, `pr:${b.html_url}`],
        currentTickets: ["CCP-1"],
      },
    );
    expect(deck.stateUpdates.dropCurrent).toEqual([`pr:${a.html_url}`, `pr:${b.html_url}`]);
    expect(deck.stateUpdates.dropCurrentTickets).toEqual(["CCP-1"]);
  });

  it("does not emit dropCurrentTickets when only some current items of a ticket are dropped", () => {
    // CCP-1 has two current items (a and b), only a is dropped
    const deck = build(
      { openPRs: [b] },
      {
        current: [`pr:${a.html_url}`, `pr:${b.html_url}`],
        currentTickets: ["CCP-1"],
      },
    );
    expect(deck.stateUpdates.dropCurrent).toEqual([`pr:${a.html_url}`]);
    expect(deck.stateUpdates.dropCurrentTickets).toBeUndefined();
  });
});

describe("buildDeck ticket pin migration", () => {
  it("moves a ticket:<KEY> pin to the first card-order PR once the ticket has PRs", () => {
    const failing = pr(2, {
      title: "CCP-9 b",
      checks_status: "FAILURE",
      checks: [{ name: "unit", status: "FAILURE" }] as GitHubPR["checks"],
    });
    const deck = build(
      { openPRs: [pr(1, { title: "CCP-9 a" }), failing], assignedIssues: [issue("CCP-9")] },
      { current: ["ticket:CCP-9"], currentTickets: ["CCP-9"] },
    );
    const t = byId(deck.current, "CCP-9");
    // Still Current, now through the PR pin: Space on that PR un-pins it.
    expect(t.current).toBe(true);
    expect(t.prs[0].pr.number).toBe(2);
    expect(t.prs[0].current).toBe(true);
    expect(t.prs[1].current).toBe(false);
    expect(deck.stateUpdates.migrateCurrent).toEqual([
      { from: "ticket:CCP-9", to: `pr:${failing.html_url}`, ticketId: "CCP-9" },
    ]);
    expect(deck.stateUpdates.dropCurrentTickets).toBeUndefined();
  });

  it("just drops the ticket pin when one of its PRs is already current", () => {
    const a = pr(1, { title: "CCP-9 a" });
    const deck = build(
      { openPRs: [a, pr(2, { title: "CCP-9 b" })] },
      { current: ["ticket:CCP-9", `pr:${a.html_url}`], currentTickets: ["CCP-9"] },
    );
    expect(byId(deck.current, "CCP-9").prs.filter((p) => p.current)).toHaveLength(1);
    expect(deck.stateUpdates.migrateCurrent).toEqual([
      { from: "ticket:CCP-9", to: null, ticketId: "CCP-9" },
    ]);
  });

  it("leaves a PR-less ticket's pin alone", () => {
    const deck = build(
      { assignedIssues: [issue("CCP-9")] },
      { current: ["ticket:CCP-9"], currentTickets: ["CCP-9"] },
    );
    expect(deck.stateUpdates.migrateCurrent).toBeUndefined();
    expect(byId(deck.current, "CCP-9").current).toBe(true);
  });
});

describe("buildDeck closed group and reopening", () => {
  const a = pr(1, { title: "CCP-1 a", updated_at: "2026-10-10T10:00:00Z" });
  const b = pr(2, { title: "CCP-2 b", updated_at: "2026-10-10T10:00:00Z" });
  const c = pr(3, { title: "CCP-3 c", updated_at: "2026-10-10T10:00:00Z" });
  const arrival = { "CCP-1": 0, "CCP-2": 1, "CCP-3": 2 };

  it("lists closed tickets most recently closed first and leaves them out of Open", () => {
    const deck = build(
      { openPRs: [a, b, c] },
      {
        arrival,
        closed: { "CCP-1": "2026-10-11T10:00:00Z", "CCP-3": "2026-10-12T10:00:00Z" },
      },
    );
    expect(ids(deck.closed)).toEqual(["CCP-3", "CCP-1"]);
    expect(ids(deck.open)).toEqual(["CCP-2"]);
    expect(deck.stateUpdates.reopen).toBeUndefined();
    expect(deck.counts.tickets).toBe(1);
  });

  it("keeps a closed ticket closed even if it has a current item", () => {
    const deck = build(
      { openPRs: [a] },
      { closed: { "CCP-1": "2026-10-11T10:00:00Z" }, current: [`pr:${a.html_url}`] },
    );
    expect(ids(deck.closed)).toEqual(["CCP-1"]);
    expect(ids(deck.current)).toEqual([]);
  });

  it("reopens into its arrival slot when a PR has updated_at after closedAt", () => {
    const touched = { ...b, updated_at: "2026-10-13T10:00:00Z" };
    const deck = build(
      { openPRs: [a, touched, c] },
      { arrival, closed: { "CCP-2": "2026-10-12T10:00:00Z" } },
    );
    expect(ids(deck.closed)).toEqual([]);
    expect(ids(deck.open)).toEqual(["CCP-1", "CCP-2", "CCP-3"]);
    expect(deck.stateUpdates.reopen).toEqual(["CCP-2"]);
  });

  it("reopens when a new PR joins the ticket after it was closed", () => {
    const joined = theirs(4, {
      title: "CCP-2 follow-up",
      created_at: "2026-10-13T09:00:00Z",
      updated_at: "2026-10-13T09:00:00Z",
    });
    const deck = build(
      { openPRs: [a, b, c], reviewRequests: [joined] },
      { arrival, closed: { "CCP-2": "2026-10-12T10:00:00Z" } },
    );
    expect(ids(deck.open)).toEqual(["CCP-1", "CCP-2", "CCP-3"]);
    expect(deck.stateUpdates.reopen).toEqual(["CCP-2"]);
  });

  it("ignores closed ids that are no longer in the deck", () => {
    const deck = build({ openPRs: [a] }, { closed: { "CCP-GONE": "2026-10-12T10:00:00Z" } });
    expect(ids(deck.closed)).toEqual([]);
    expect(deck.stateUpdates.reopen).toBeUndefined();
  });
});

describe("buildDeck seen state", () => {
  const a = pr(1, { title: "CCP-1 a", updated_at: "2026-10-10T10:00:00Z" });
  const b = pr(2, { title: "CCP-2 b", updated_at: "2026-10-11T10:00:00Z" });

  it("seeds every PR as seen on the first run and treats all as seen", () => {
    const deck = build({
      openPRs: [a, b],
      githubMentions: [ghMention(10, 1)],
      jiraMentions: [jiraMention("j1", "CCP-1")],
    });
    expect(deck.stateUpdates.seeded).toBe(true);
    expect(deck.stateUpdates.seen).toMatchObject({
      [a.html_url]: a.updated_at,
      [b.html_url]: b.updated_at,
    });
    for (const t of all(deck)) {
      expect(t.unseen).toBe(false);
      expect(t.jiraMention).toBeNull();
      for (const p of t.prs) expect(p).toMatchObject({ unseen: false, unseenComment: null });
    }
    expect(deck.counts.unseen).toBe(0);
  });

  it("emits no seeding once seeded", () => {
    const deck = build({ openPRs: [a] }, seenAll([a]));
    expect(deck.stateUpdates.seen).toBeUndefined();
    expect(deck.stateUpdates.seeded).toBeUndefined();
  });

  it("marks a PR unseen when updated_at is after seen, and a newly arrived PR unseen", () => {
    const touched = { ...a, updated_at: "2026-10-13T10:00:00Z" };
    const fresh = theirs(3, { title: "CCP-3 new" });
    const deck = build({ openPRs: [touched, b], reviewRequests: [fresh] }, seenAll([a, b]));
    expect(byId(deck.open, "CCP-1").unseen).toBe(true);
    expect(byId(deck.open, "CCP-1").prs[0].unseen).toBe(true);
    expect(byId(deck.open, "CCP-2").unseen).toBe(false);
    expect(byId(deck.open, "CCP-3").unseen).toBe(true);
    expect(deck.counts.unseen).toBe(2);
  });

  it("quotes the newest GitHub mention on the PR created after seen", () => {
    const touched = { ...a, updated_at: "2026-10-13T10:00:00Z" };
    const deck = build(
      {
        openPRs: [touched],
        githubMentions: [
          ghMention(10, 1, { created_at: "2026-10-09T10:00:00Z" }),
          ghMention(11, 1, { created_at: "2026-10-12T10:00:00Z", body: "newest\nmore" }),
          ghMention(12, 1, { created_at: "2026-10-11T10:00:00Z" }),
          ghMention(13, 1, { created_at: "2026-10-13T10:00:00Z", repo_full_name: "o/other" }),
        ],
      },
      seenAll([a]),
    );
    const p = deck.open[0].prs[0];
    expect(p.unseenComment).toMatchObject({
      id: "gh:11",
      source: "GitHub",
      who: "abu",
      where: "repo#1",
      snippet: "newest",
      at: "2026-10-12T10:00:00Z",
    });
    expect(deck.open[0].status).toBe("#1 ⏳ Waiting on guru · 13d · 2 new comments");
  });

  it("has no comment quote when every mention is older than seen", () => {
    const deck = build(
      { openPRs: [a], githubMentions: [ghMention(10, 1, { created_at: "2026-10-09T10:00:00Z" })] },
      seenAll([a]),
    );
    expect(deck.open[0].prs[0].unseenComment).toBeNull();
    expect(deck.open[0].status).toBe("#1 ⏳ Waiting on guru · 13d");
  });

  it("quotes the newest Jira mention after the ticket's newest seen time", () => {
    const deck = build(
      {
        openPRs: [a, pr(5, { title: "CCP-1 z", updated_at: "2026-10-11T10:00:00Z" })],
        jiraMentions: [
          jiraMention("j1", "CCP-1", { created: "2026-10-10T12:00:00Z" }),
          jiraMention("j2", "CCP-1", { created: "2026-10-12T10:00:00Z" }),
          jiraMention("j3", "CCP-1", { created: "2026-10-11T12:00:00Z" }),
        ],
      },
      seenAll([a, pr(5, { updated_at: "2026-10-11T10:00:00Z" })]),
    );
    const t = deck.open[0];
    expect(t.jiraMention).toMatchObject({ id: "jira:j2", source: "Jira", where: "CCP-1" });
    expect(t.unseen).toBe(true);
  });

  it("uses seen['ticket:<KEY>'] for PR-less tickets' Jira mentions", () => {
    const m = jiraMention("j1", "CCP-9", { created: "2026-10-12T10:00:00Z" });
    const seenAfter = build(
      { assignedIssues: [issue("CCP-9")], jiraMentions: [m] },
      { seeded: true, seen: { "ticket:CCP-9": "2026-10-13T10:00:00Z" } },
    );
    expect(seenAfter.open[0].jiraMention).toBeNull();
    const seenBefore = build(
      { assignedIssues: [issue("CCP-9")], jiraMentions: [m] },
      { seeded: true, seen: { "ticket:CCP-9": "2026-10-11T10:00:00Z" } },
    );
    expect(seenBefore.open[0].jiraMention?.id).toBe("jira:j1");
  });

  it("lists mentions on PRs and tickets not in the deck as unmatched, newest first", () => {
    const deck = build(
      {
        openPRs: [a],
        githubMentions: [
          ghMention(10, 1),
          ghMention(11, 99, { created_at: "2026-10-11T10:00:00Z" }),
        ],
        jiraMentions: [
          jiraMention("j1", "CCP-1"),
          jiraMention("j2", "OTHER-4", { created: "2026-10-13T10:00:00Z" }),
        ],
      },
      seenAll([a]),
    );
    expect(deck.unmatched.map((m) => m.id)).toEqual(["jira:j2", "gh:11"]);
  });
});

describe("buildDeck rail status line", () => {
  it("says '1 new comment' for a single unseen comment", () => {
    const a = pr(1, { title: "CCP-1 a", updated_at: "2026-10-13T10:00:00Z" });
    const deck = build(
      { openPRs: [a], githubMentions: [ghMention(10, 1)] },
      { seeded: true, seen: { [a.html_url]: "2026-10-11T10:00:00Z" } },
    );
    expect(deck.open[0].status).toBe("#1 ⏳ Waiting on guru · 13d · 1 new comment");
  });
});

function note(id: number, o: Partial<Note> = {}): Note {
  return {
    id,
    type: "github_pr",
    title: "",
    content: `note ${id}`,
    reference_id: "o/repo#1",
    resolved: 0,
    pinned: 0,
    remind_at: null,
    created_at: "2026-10-10T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    ...o,
  };
}

describe("buildDeck notes", () => {
  const a = pr(1, { title: "CCP-1 a" });

  it("picks the newest unresolved note per PR, matching normalised references", () => {
    const deck = build({
      openPRs: [a, pr(2, { title: "CCP-1 b" })],
      notes: [
        note(1, { created_at: "2026-10-11T10:00:00Z" }),
        note(2, {
          reference_id: "https://github.com/o/repo/pull/1/",
          created_at: "2026-10-12T10:00:00Z",
        }),
        note(3, { created_at: "2026-10-13T10:00:00Z", resolved: 1 }),
        note(4, { reference_id: "o/repo#2", created_at: "2026-10-09T10:00:00Z" }),
        note(5, { reference_id: "o/other#1", created_at: "2026-10-14T10:00:00Z" }),
      ],
    });
    const t = deck.open[0];
    expect(t.prs.find((p) => p.pr.number === 1)!.note?.id).toBe(2);
    expect(t.prs.find((p) => p.pr.number === 2)!.note?.id).toBe(4);
    expect(t.note).toBeNull();
  });

  it("has no note when every note on the PR is resolved", () => {
    const deck = build({ openPRs: [a], notes: [note(1, { resolved: 1 })] });
    expect(deck.open[0].prs[0].note).toBeNull();
  });

  it("gives a PR-less ticket its newest unresolved jira_ticket note", () => {
    const deck = build({
      assignedIssues: [issue("CCP-9")],
      notes: [
        note(1, { type: "jira_ticket", reference_id: "CCP-9", created_at: "2026-10-11T10:00:00Z" }),
        note(2, { type: "jira_ticket", reference_id: "ccp-9", created_at: "2026-10-12T10:00:00Z" }),
        note(3, { type: "jira_ticket", reference_id: "CCP-9", resolved: 1 }),
        note(4, { type: "jira_ticket", reference_id: "CCP-8", created_at: "2026-10-13T10:00:00Z" }),
      ],
    });
    expect(deck.open[0].note?.id).toBe(2);
  });
});

describe("buildDeck #todo notes", () => {
  const todo = (id: number, o: Partial<Note> = {}) =>
    note(id, { content: `<p>do thing ${id} #todo</p>`, ...o });

  it("attaches a #todo note to the tab of its PR and keeps it off the PR's 📝 line", () => {
    const deck = build({
      openPRs: [pr(1, { title: "CCP-1 a" })],
      notes: [todo(1), note(2, { created_at: "2026-10-09T10:00:00Z" })],
    });
    expect(ids(all(deck))).toEqual(["CCP-1"]);
    expect(deck.open[0].todos.map((n) => n.id)).toEqual([1]);
    expect(deck.open[0].prs[0].note?.id).toBe(2);
  });

  it("attaches a ticket note, by bare key or browse URL, even when the ticket has PRs", () => {
    const deck = build({
      openPRs: [pr(1, { title: "CCP-1 a" })],
      notes: [
        todo(1, { type: "jira_ticket", reference_id: "ccp-1", created_at: "2026-10-11T10:00:00Z" }),
        todo(2, {
          type: "jira_ticket",
          reference_id: "https://x.atlassian.net/browse/CCP-1?focusedCommentId=3",
          created_at: "2026-10-12T10:00:00Z",
        }),
      ],
    });
    expect(deck.open[0].todos.map((n) => n.id)).toEqual([2, 1]);
  });

  it("attaches to a closed tab rather than opening a note tab", () => {
    const deck = build(
      { openPRs: [pr(1, { title: "CCP-1 a" })], notes: [todo(1)] },
      { closed: { "CCP-1": "2026-10-13T10:00:00Z" }, arrival: { "CCP-1": 0 } },
    );
    expect(ids(deck.closed)).toEqual(["CCP-1"]);
    expect(deck.closed[0].todos).toHaveLength(1);
    expect(ids(deck.open)).toEqual([]);
  });

  it("gives a #todo note with nothing on the deck a tab of its own", () => {
    const deck = build({
      openPRs: [pr(1, { title: "CCP-1 a" })],
      notes: [
        todo(1, { type: "free_text", reference_id: null, title: "Renew staging cert" }),
        todo(2, { type: "jira_ticket", reference_id: "CCP-999" }),
        todo(3, { reference_id: "o/other#7" }),
        todo(4, { type: "link", reference_id: "https://wiki.example.com/runbook" }),
      ],
    });
    const tab = (id: number) => byId(deck.open, `note:${id}`);
    expect(tab(1)).toMatchObject({
      key: null,
      title: "Renew staging cert",
      status: "Note",
      prs: [],
      unseen: false,
      todos: [],
    });
    expect(tab(1).noteItem?.id).toBe(1);
    expect(tab(2).title).toBe("do thing 2 #todo");
    expect(tab(2).status).toBe("CCP-999");
    expect(tab(3).status).toBe("other#7");
    expect(tab(4).status).toBe("https://wiki.example.com/runbook");
    expect(deck.open[0].todos).toEqual([]);
  });

  it("leaves out resolved notes and notes without the tag", () => {
    const deck = build({
      notes: [
        todo(1, { type: "free_text", reference_id: null, resolved: 1 }),
        note(2, { type: "free_text", reference_id: null, content: "#todos later" }),
      ],
    });
    expect(all(deck)).toEqual([]);
  });

  it("numbers a note tab's arrival by the note's creation", () => {
    const deck = build({
      openPRs: [pr(1, { title: "CCP-1 a", created_at: "2026-10-05T10:00:00Z" })],
      notes: [
        todo(1, { type: "free_text", reference_id: null, created_at: "2026-10-03T10:00:00Z" }),
      ],
    });
    expect(ids(deck.open)).toEqual(["note:1", "CCP-1"]);
  });

  it("puts a pinned note tab in Current and drops the pin once the note goes", () => {
    const free = todo(1, { type: "free_text", reference_id: null });
    const pinned = build(
      { notes: [free] },
      { current: ["note:1"], currentTickets: ["note:1"], seeded: true },
    );
    expect(ids(pinned.current)).toEqual(["note:1"]);
    const gone = build(
      { notes: [{ ...free, resolved: 1 }] },
      { current: ["note:1"], currentTickets: ["note:1"], seeded: true },
    );
    expect(gone.stateUpdates.dropCurrent).toEqual(["note:1"]);
    expect(gone.stateUpdates.dropCurrentTickets).toEqual(["note:1"]);
  });

  it("reads a note's marker-less SQLite time as UTC", () => {
    const free = todo(1, { type: "free_text", reference_id: null });
    const state = { closed: { "note:1": "2026-10-12T10:00:00Z" }, arrival: { "note:1": 0 } };
    const before = build({ notes: [{ ...free, updated_at: "2026-10-12 09:59:00" }] }, state);
    expect(ids(before.closed)).toEqual(["note:1"]);
    const after = build({ notes: [{ ...free, updated_at: "2026-10-12 10:01:00" }] }, state);
    expect(ids(after.open)).toEqual(["note:1"]);
  });

  it("reopens a closed note tab once the note is edited after the close", () => {
    const free = todo(1, { type: "free_text", reference_id: null });
    const state = { closed: { "note:1": "2026-10-12T10:00:00Z" }, arrival: { "note:1": 0 } };
    expect(ids(build({ notes: [free] }, state).closed)).toEqual(["note:1"]);
    const edited = build({ notes: [{ ...free, updated_at: "2026-10-13T10:00:00Z" }] }, state);
    expect(edited.stateUpdates.reopen).toEqual(["note:1"]);
    expect(ids(edited.open)).toEqual(["note:1"]);
  });
});

describe("buildDeck off-sprint", () => {
  it("flags tickets whose key is in offSprintKeys", () => {
    const deck = build({
      openPRs: [pr(1, { title: "CCP-1 a" }), pr(2, { title: "CCP-2 b" })],
      assignedIssues: [issue("CCP-3")],
      offSprintKeys: new Set(["CCP-1", "CCP-3"]),
    });
    expect(byId(deck.open, "CCP-1").ticket?.offSprint).toBe(true);
    expect(byId(deck.open, "CCP-2").ticket?.offSprint).toBe(false);
    expect(byId(deck.open, "CCP-3").ticket?.offSprint).toBe(true);
  });

  it("defaults to not off-sprint without offSprintKeys", () => {
    const deck = build({ openPRs: [pr(1, { title: "CCP-1 a" })] });
    expect(deck.open[0].ticket?.offSprint).toBe(false);
  });
});

describe("shortKey", () => {
  const t = (key: string | null): DeckTicket =>
    ({ id: key ?? "pr:x", key }) as unknown as DeckTicket;

  it("shortens to the number when every keyed ticket shares one prefix", () => {
    const deck = [t("CCP-412"), t("CCP-7"), t(null)];
    expect(shortKey("CCP-412", deck)).toBe("412");
  });

  it("accepts a precomputed project set", () => {
    const projects = deckProjects([t("CCP-412"), t("CCP-7")]);
    expect(shortKey("CCP-412", projects)).toBe("412");
    expect(shortKey("OPS-1", projects)).toBe("OPS-1");
    expect(shortKey("OPS-1", deckProjects([t("CCP-412"), t("OPS-7")]))).toBe("OPS-1");
  });

  it("keeps the full key when prefixes differ", () => {
    const deck = [t("CCP-412"), t("OPS-7")];
    expect(shortKey("CCP-412", deck)).toBe("CCP-412");
    expect(shortKey("OPS-7", deck)).toBe("OPS-7");
  });
});
