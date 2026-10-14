import { describe, it, expect } from "vitest";
import type { GitHubPR } from "../../types";
import { parseLink, searchDeck } from "./deckSearch";
import type { DeckData, DeckTicket } from "./types";

function pr(n: number, o: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: n,
    number: n,
    title: `PR ${n}`,
    html_url: `https://github.com/owner/repo/pull/${n}`,
    state: "open",
    draft: false,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    user: { login: "alice", avatar_url: "" },
    head: { ref: `feature/x-${n}` },
    base: { ref: "main" },
    repo_full_name: "owner/repo",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: [],
    ...o,
  };
}

function ticket(id: string, prs: GitHubPR[], o: Partial<DeckTicket> = {}): DeckTicket {
  return {
    id,
    key: id.startsWith("pr:") ? null : id,
    title: `Summary ${id}`,
    ticket: null,
    prs: prs.map((p) => ({
      pr: p,
      mine: true,
      signals: [],
      priority: 0,
      unseenComment: null,
      note: null,
      current: false,
      unseen: false,
    })),
    stripe: "neutral",
    status: "Open",
    reviewOnly: false,
    unseen: false,
    current: false,
    jiraMention: null,
    note: null,
    ...o,
  };
}

function deck(o: Partial<DeckData> = {}): DeckData {
  return {
    current: [],
    open: [],
    closed: [],
    unmatched: [],
    counts: { tickets: 0, current: 0, unseen: 0 },
    ...o,
  };
}

describe("parseLink", () => {
  it("returns null for empty/whitespace strings", () => {
    expect(parseLink("")).toBeNull();
    expect(parseLink("   ")).toBeNull();
  });

  describe("GitHub PR URLs", () => {
    it("parses a standard GitHub PR URL", () => {
      const result = parseLink("https://github.com/owner/repo/pull/1234");
      expect(result).toEqual({
        kind: "pr",
        repo: "owner/repo",
        number: 1234,
        url: "https://github.com/owner/repo/pull/1234",
      });
    });

    it("parses GitHub PR URLs with /files sub-path", () => {
      const result = parseLink("https://github.com/owner/repo/pull/1234/files");
      expect(result).toEqual({
        kind: "pr",
        repo: "owner/repo",
        number: 1234,
        url: "https://github.com/owner/repo/pull/1234",
      });
    });

    it("parses GitHub PR URLs with /commits sub-path", () => {
      const result = parseLink("https://github.com/owner/repo/pull/1234/commits");
      expect(result).toEqual({
        kind: "pr",
        repo: "owner/repo",
        number: 1234,
        url: "https://github.com/owner/repo/pull/1234",
      });
    });

    it("parses GitHub PR URLs with #discussion_r hash", () => {
      const result = parseLink("https://github.com/owner/repo/pull/1234#discussion_r123456789");
      expect(result).toEqual({
        kind: "pr",
        repo: "owner/repo",
        number: 1234,
        url: "https://github.com/owner/repo/pull/1234",
      });
    });

    it("parses GitHub PR URLs with query strings", () => {
      const result = parseLink("https://github.com/owner/repo/pull/1234?foo=bar&baz=qux");
      expect(result).toEqual({
        kind: "pr",
        repo: "owner/repo",
        number: 1234,
        url: "https://github.com/owner/repo/pull/1234",
      });
    });

    it("parses GitHub PR URLs with query strings and hash", () => {
      const result = parseLink("https://github.com/owner/repo/pull/1234?foo=bar#issuecomment-999");
      expect(result).toEqual({
        kind: "pr",
        repo: "owner/repo",
        number: 1234,
        url: "https://github.com/owner/repo/pull/1234",
      });
    });

    it("handles http and https", () => {
      const result = parseLink("http://github.com/owner/repo/pull/1234");
      expect(result).toEqual({
        kind: "pr",
        repo: "owner/repo",
        number: 1234,
        url: "https://github.com/owner/repo/pull/1234",
      });
    });
  });

  describe("Jira URLs", () => {
    it("parses /browse/KEY URLs", () => {
      const result = parseLink("https://jira.example.com/browse/CCP-412");
      expect(result).toEqual({
        kind: "ticket",
        key: "CCP-412",
      });
    });

    it("parses ?selectedIssue=KEY URLs", () => {
      const result = parseLink("https://jira.example.com/issues/?selectedIssue=CCP-412");
      expect(result).toEqual({
        kind: "ticket",
        key: "CCP-412",
      });
    });

    it("parses ?selectedIssue=KEY with other query params", () => {
      const result = parseLink(
        "https://jira.example.com/issues/?foo=bar&selectedIssue=CCP-412&baz=qux",
      );
      expect(result).toEqual({
        kind: "ticket",
        key: "CCP-412",
      });
    });

    it("uppercases Jira keys", () => {
      const result = parseLink("https://jira.example.com/browse/ccp-412");
      expect(result).toEqual({
        kind: "ticket",
        key: "CCP-412",
      });
    });
  });

  describe("Bare keys and PR numbers", () => {
    it("parses a bare Jira key", () => {
      const result = parseLink("CCP-412");
      expect(result).toEqual({
        kind: "ticket",
        key: "CCP-412",
      });
    });

    it("uppercases bare Jira keys", () => {
      const result = parseLink("ccp-412");
      expect(result).toEqual({
        kind: "ticket",
        key: "CCP-412",
      });
    });

    it("returns null for a bare number (not a valid link)", () => {
      const result = parseLink("1234");
      expect(result).toBeNull();
    });

    it("returns null for #123 (not a valid link)", () => {
      const result = parseLink("#123");
      expect(result).toBeNull();
    });

    it("returns null for repo#123 (not a valid link)", () => {
      const result = parseLink("repo#123");
      expect(result).toBeNull();
    });
  });
});

describe("searchDeck", () => {
  it("returns empty array for empty query", () => {
    const d = deck({ open: [ticket("CCP-1", [pr(1)])] });
    expect(searchDeck("", d)).toEqual([]);
    expect(searchDeck("   ", d)).toEqual([]);
  });

  describe("fuzzy matching", () => {
    it("matches on ticket key", () => {
      const d = deck({ open: [ticket("CCP-412", [pr(1)])] });
      const results = searchDeck("ccp-412", d);
      expect(results).toHaveLength(1);
      expect(results[0].ticketKey).toBe("CCP-412");
    });

    it("matches on ticket title", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1)], { title: "Move asset sync to queue" })] });
      const results = searchDeck("asset", d);
      expect(results).toHaveLength(1);
      expect(results[0].ticketKey).toBe("CCP-1");
    });

    it("matches on PR number as #1199", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1199)])] });
      const results = searchDeck("#1199", d);
      expect(results).toHaveLength(1);
      expect(results[0].pr?.number).toBe(1199);
    });

    it("matches on PR number as 1199", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1199)])] });
      const results = searchDeck("1199", d);
      expect(results).toHaveLength(1);
      expect(results[0].pr?.number).toBe(1199);
    });

    it("matches on PR number as repo#1199", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1199)])] });
      const results = searchDeck("repo#1199", d);
      expect(results).toHaveLength(1);
      expect(results[0].pr?.number).toBe(1199);
    });

    it("matches on PR title", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1, { title: "Fix auth bug" })])] });
      const results = searchDeck("auth", d);
      expect(results).toHaveLength(1);
      expect(results[0].pr?.number).toBe(1);
    });

    it("matches on author login", () => {
      const d = deck({
        open: [ticket("CCP-1", [pr(1, { user: { login: "tomas", avatar_url: "" } })])],
      });
      const results = searchDeck("tomas", d);
      expect(results).toHaveLength(1);
      expect(results[0].pr?.number).toBe(1);
    });

    it("matches on requested reviewers", () => {
      const d = deck({
        open: [ticket("CCP-1", [pr(1, { requested_reviewers: ["alice", "bob"] })])],
      });
      const results = searchDeck("alice", d);
      expect(results).toHaveLength(1);
      expect(results[0].pr?.number).toBe(1);
    });

    it("matches on repo name", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1, { repo_full_name: "owner/my-repo" })])] });
      const results = searchDeck("my-repo", d);
      expect(results).toHaveLength(1);
      expect(results[0].pr?.number).toBe(1);
    });

    it("matches on branch name", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1, { head: { ref: "feature/auth-fix" } })])] });
      const results = searchDeck("auth-fix", d);
      expect(results).toHaveLength(1);
      expect(results[0].pr?.number).toBe(1);
    });

    it("is case-insensitive", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1, { title: "Fix Auth Bug" })])] });
      const results = searchDeck("AUTH", d);
      expect(results).toHaveLength(1);
    });

    it("matches subsequences", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1, { title: "authentication service" })])] });
      const results = searchDeck("aus", d);
      expect(results).toHaveLength(1);
    });
  });

  describe("ranking", () => {
    it("ranks exact key matches first", () => {
      const d = deck({
        open: [
          ticket("CCP-1", [pr(1, { title: "Contains CCP-2 in title" })]),
          ticket("CCP-2", [pr(2)]),
        ],
      });
      const results = searchDeck("CCP-2", d);
      expect(results[0].ticketKey).toBe("CCP-2");
      expect(results[1].ticketKey).toBe("CCP-1");
    });

    it("ranks exact number matches first", () => {
      const d = deck({
        open: [
          ticket("CCP-1", [pr(1, { title: "Mentions #999 in title" })]),
          ticket("CCP-2", [pr(999)]),
        ],
      });
      const results = searchDeck("999", d);
      expect(results[0].pr?.number).toBe(999);
      expect(results[1].pr?.number).toBe(1);
    });

    it("ranks exact matches above substring matches", () => {
      const d = deck({
        open: [
          ticket("CCP-1", [pr(1, { title: "test" })]),
          ticket("CCP-2", [pr(2, { title: "testing suite" })]),
        ],
      });
      const results = searchDeck("test", d);
      expect(results[0].pr?.title).toBe("test");
      expect(results[1].pr?.title).toBe("testing suite");
    });

    it("ranks substring matches above subsequence matches", () => {
      const d = deck({
        open: [
          ticket("CCP-1", [pr(1, { title: "auth fix" })]),
          ticket("CCP-2", [pr(2, { title: "authentication service" })]),
        ],
      });
      const results = searchDeck("auth", d);
      expect(results[0].pr?.title).toBe("auth fix");
      expect(results[1].pr?.title).toBe("authentication service");
    });
  });

  describe("closed tabs", () => {
    it("includes closed tabs in results with closed: true", () => {
      const t = ticket("CCP-1", [pr(1)]);
      const d = deck({ closed: [t] });
      const results = searchDeck("CCP-1", d);
      expect(results).toHaveLength(1);
      expect(results[0].closed).toBe(true);
    });

    it("marks open tabs with closed: false", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1)])] });
      const results = searchDeck("CCP-1", d);
      expect(results).toHaveLength(1);
      expect(results[0].closed).toBe(false);
    });
  });

  describe("external links", () => {
    it("returns an external result for a GitHub PR not in the deck", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1)])] });
      const results = searchDeck("https://github.com/owner/repo/pull/9999", d);
      expect(results).toHaveLength(1);
      expect(results[0].external).toEqual({
        kind: "pr",
        repo: "owner/repo",
        number: 9999,
        url: "https://github.com/owner/repo/pull/9999",
      });
      expect(results[0].pr).toBeNull();
      expect(results[0].ticketId).toBeNull();
    });

    it("returns an external result for a Jira ticket not in the deck", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1)])] });
      const results = searchDeck("CCP-999", d);
      expect(results).toHaveLength(1);
      expect(results[0].external).toEqual({
        kind: "ticket",
        key: "CCP-999",
      });
      expect(results[0].ticketKey).toBe("CCP-999");
      expect(results[0].ticketId).toBeNull();
    });

    it("does not add an external result if the link is in the deck", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1234)])] });
      const results = searchDeck("https://github.com/owner/repo/pull/1234", d);
      expect(results).toHaveLength(1);
      expect(results[0].external).toBeUndefined();
      expect(results[0].pr?.number).toBe(1234);
    });
  });

  describe("multiple PRs per ticket", () => {
    it("returns a result for each matching PR on a ticket", () => {
      const d = deck({
        open: [ticket("CCP-1", [pr(1, { title: "backend" }), pr(2, { title: "frontend" })])],
      });
      const results = searchDeck("CCP-1", d);
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.pr?.number).sort()).toEqual([1, 2]);
    });

    it("returns only matching PRs when searching by PR-specific field", () => {
      const d = deck({
        open: [ticket("CCP-1", [pr(1, { title: "backend" }), pr(2, { title: "frontend" })])],
      });
      const results = searchDeck("backend", d);
      expect(results).toHaveLength(1);
      expect(results[0].pr?.number).toBe(1);
    });
  });

  describe("tickets without PRs", () => {
    it("returns a ticket without PRs when it matches", () => {
      const d = deck({ open: [ticket("CCP-1", [], { title: "No PR yet" })] });
      const results = searchDeck("CCP-1", d);
      expect(results).toHaveLength(1);
      expect(results[0].ticketKey).toBe("CCP-1");
      expect(results[0].pr).toBeNull();
    });
  });

  describe("scoring edge cases", () => {
    it("returns nothing for a query that matches nothing, with ticketless tabs present", () => {
      const d = deck({
        open: [ticket("pr:https://github.com/owner/repo/pull/7", [pr(7)]), ticket("CCP-1", [])],
      });
      expect(searchDeck("zzzz", d)).toEqual([]);
    });

    it("does not let a short key or PR number inside the query match", () => {
      const d = deck({
        open: [ticket("CCP-1", [pr(1)]), ticket("CCP-12", [pr(12)])],
      });
      const results = searchDeck("CCP-12", d);
      expect(results.map((r) => r.ticketKey)).toEqual(["CCP-12"]);
    });

    it("matches PR numbers by exact equality only", () => {
      const d = deck({
        open: [
          ticket("CCP-1", [pr(1, { title: "fix 12 things" })]),
          ticket("CCP-2", [pr(12, { title: "other" })]),
        ],
      });
      const results = searchDeck("fix 12", d);
      expect(results.map((r) => r.pr?.number)).toEqual([1]);
      expect(searchDeck("12", d)[0].pr?.number).toBe(12);
      expect(searchDeck("Repo#12", d)[0].pr?.number).toBe(12);
    });

    it("ranks the exact key ticket above a ticket that mentions the key in its title", () => {
      const d = deck({
        open: [
          ticket("CCP-1", [], { title: "Follow-up to CCP-22" }),
          ticket("CCP-22", [], { title: "Something" }),
        ],
      });
      const results = searchDeck("CCP-22", d);
      expect(results.map((r) => r.ticketKey)).toEqual(["CCP-22", "CCP-1"]);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("compares a pasted PR link's repo case-insensitively", () => {
      const d = deck({ open: [ticket("CCP-1", [pr(1234)])] });
      const results = searchDeck("https://github.com/Owner/Repo/pull/1234", d);
      expect(results).toHaveLength(1);
      expect(results[0].external).toBeUndefined();
    });

    it("accepts Jira keys with digits in the project key", () => {
      expect(parseLink("AB2-12")).toEqual({ kind: "ticket", key: "AB2-12" });
      expect(parseLink("https://x.atlassian.net/browse/ab2-12")).toEqual({
        kind: "ticket",
        key: "AB2-12",
      });
      expect(parseLink("https://x.atlassian.net/jira?selectedIssue=AB2-12")).toEqual({
        kind: "ticket",
        key: "AB2-12",
      });
    });
  });
});
