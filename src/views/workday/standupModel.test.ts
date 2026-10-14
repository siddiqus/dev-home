import { describe, expect, it } from "vitest";
import type { GitHubPR } from "../../types";
import type { TicketRef, WorkdaySections } from "./types";
import { standupGroups, standupGroupsToMarkdown, statusTone } from "./standupModel";

const now = new Date("2026-10-14T10:00:00Z");
const ticket = (key: string, summary = `${key} summary`): TicketRef => ({
  key,
  summary,
  statusName: null,
  offSprint: false,
  updated: null,
});
const pr = (n: number, title: string, extra: Partial<GitHubPR> = {}) =>
  ({
    number: n,
    title,
    html_url: `https://github.com/o/dev-home/pull/${n}`,
    repo_full_name: "o/dev-home",
    state: "open",
    draft: false,
    ...extra,
  }) as GitHubPR;
const sec = <T>(items: T[]) => ({ items, loading: false, error: null });

function sections(over: Partial<WorkdaySections>): WorkdaySections {
  return {
    done: sec([]),
    workingOn: sec([]),
    reviewing: sec([]),
    reviewRequestedUrls: new Set(),
    blockers: sec([]),
    waiting: sec([]),
    notStarted: { ...sec([]), offSprintItems: [] },
    offSprintCount: 0,
    ...over,
  };
}

describe("standupGroups", () => {
  it("groups Yesterday by action: merged, moved to Done, other moves, won't fix, reviewed", () => {
    const at = now.toISOString();
    const g = standupGroups(
      sections({
        done: sec([
          { kind: "reviewed", pr: pr(9, "Other fix"), ticket: null, state: "APPROVED", at },
          { kind: "status", ticket: ticket("CCP-3"), toStatus: "Won't Fix", at },
          { kind: "status", ticket: ticket("CCP-2"), toStatus: "In Review", at },
          { kind: "status", ticket: ticket("CCP-1"), toStatus: "Done", at },
          { kind: "merged", pr: pr(12, "CCP-4: Fix login"), ticket: ticket("CCP-4"), at },
          { kind: "status", ticket: ticket("CCP-5"), toStatus: "Done", at },
        ]),
      }),
      now,
    );
    expect(g.yesterday.map((x) => [x.label, x.tone, x.items.length])).toEqual([
      ["Merged", "purple", 1],
      ["Moved to Done", "success", 2],
      ["Moved to In Review", "purple", 1],
      ["Moved to Won't Fix", "neutral", 1],
      ["Reviewed", "info", 1],
    ]);
    expect(g.yesterday[0].items[0]).toMatchObject({ ticketKey: "CCP-4", title: "Fix login" });
    expect(g.yesterday[4].items[0].tag).toEqual({ text: "approved", tone: "success" });
  });

  it("copies the same groups with repo#number on every PR", () => {
    const at = now.toISOString();
    const g = standupGroups(
      sections({
        done: sec([
          { kind: "merged", pr: pr(12, "CCP-4: Fix login"), ticket: ticket("CCP-4"), at },
        ]),
        workingOn: sec([
          { ticket: ticket("CCP-7", "Bulk tags"), prs: [pr(20, "x", { draft: true })] },
        ]),
      }),
      now,
    );
    expect(standupGroupsToMarkdown(g, "- design review")).toBe(
      [
        "*Yesterday*\n_Merged_\n• CCP-4 Fix login (dev-home#12)",
        "*Today*\n_In progress_\n• CCP-7 Bulk tags (dev-home#20 · draft)",
        "*Blockers*\n• design review",
      ].join("\n\n"),
    );
  });

  it("colours statuses by meaning", () => {
    expect(statusTone("Won't Do")).toBe("neutral");
    expect(statusTone("Closed")).toBe("success");
    expect(statusTone("QA")).toBe("purple");
    expect(statusTone("In Progress")).toBe("info");
  });
});
