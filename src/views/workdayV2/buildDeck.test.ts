import { describe, it, expect } from "vitest";
import type { GitHubPR, JiraIssue } from "../../types";
import { buildDeck, shortKey, EMPTY_DECK_STATE, type DeckState } from "./buildDeck";
import type { DeckInputs, DeckTicket } from "./types";

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
    expect(deck.open[0].status).toBe("#1203 ✗ Conflict with main");
  });

  it("status line ignores current: the needs-me PR is named even when another is current", () => {
    const ready = pr(2, { title: "CCP-1 b", review_status: "APPROVED", checks_status: "SUCCESS" });
    const deck = build(
      { openPRs: [pr(1, { title: "CCP-1 a", has_conflict: true }), ready] },
      { current: [`pr:${ready.html_url}`] },
    );
    expect(numbers(deck.open[0])).toEqual([2, 1]);
    expect(deck.open[0].status).toBe("#1 ✗ Conflict with main");
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
    expect(byId(deck.open, "CCP-1").current).toBe(true);
    expect(byId(deck.open, "CCP-1").prs[0].current).toBe(true);
    expect(byId(deck.open, "CCP-2").current).toBe(false);
    expect(byId(deck.open, "CCP-3").current).toBe(true);
    expect(deck.counts).toEqual({ tickets: 3, current: 2, unseen: 0 });
  });

  it("leaves seen-related fields empty for now", () => {
    const deck = build({ openPRs: [pr(1, { title: "CCP-1 a" })] });
    const t = deck.open[0];
    expect(t.unseen).toBe(false);
    expect(t.jiraMention).toBeNull();
    expect(t.prs[0]).toMatchObject({ unseen: false, unseenComment: null, note: null });
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
    expect(numbers(deck.open[0])).toEqual([1, 3, 4, 5, 2]);
  });

  it("carries signals and priority on each PR", () => {
    const deck = build({ openPRs: [pr(1, { title: "CCP-1 a", has_conflict: true })] });
    const p = deck.open[0].prs[0];
    expect(p.signals[0]).toEqual({ label: "✗ Conflict with main", tone: "danger" });
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
    const deck = build({ openPRs: [pr(1, { title: "CCP-1 a" })] }, { arrival: { "CCP-1": 0 } });
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
    const again = build({ openPRs: touched }, { arrival });
    expect(ids(again.open)).toEqual(ids(first.open));
    expect(again.stateUpdates).toEqual({});
  });
});

describe("shortKey", () => {
  const t = (key: string | null): DeckTicket =>
    ({ id: key ?? "pr:x", key }) as unknown as DeckTicket;

  it("shortens to the number when every keyed ticket shares one prefix", () => {
    const deck = [t("CCP-412"), t("CCP-7"), t(null)];
    expect(shortKey("CCP-412", deck)).toBe("412");
  });

  it("keeps the full key when prefixes differ", () => {
    const deck = [t("CCP-412"), t("OPS-7")];
    expect(shortKey("CCP-412", deck)).toBe("CCP-412");
    expect(shortKey("OPS-7", deck)).toBe("OPS-7");
  });
});
