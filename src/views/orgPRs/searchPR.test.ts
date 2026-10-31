import { describe, it, expect } from "vitest";
import type { GitHubPR } from "../../types";
import { mySignals } from "../workday/signals";
import { searchPR } from "./searchPR";

const NOW = new Date("2026-10-31T12:00:00Z");

const pr = (over: Partial<GitHubPR> = {}): GitHubPR =>
  ({
    id: 1,
    number: 4821,
    title: "WMU-549 Persist section order",
    html_url: "https://github.com/acme/cmp-server/pull/4821",
    state: "open",
    draft: false,
    created_at: "2026-10-29T12:00:00Z",
    updated_at: "2026-10-31T10:00:00Z",
    user: { login: "shunjid", avatar_url: "" },
    head: { ref: "b", sha: "abc" },
    base: { ref: "main" },
    repo_full_name: "acme/cmp-server",
    checks_status: "SUCCESS",
    checks: [],
    review_status: "REVIEW_REQUIRED",
    requested_reviewers: [],
    ...over,
  }) as GitHubPR;

describe("searchPR", () => {
  it("shows an open PR's next step from its author's side", () => {
    const open = pr();
    const item = searchPR(open, NOW);
    expect(item.signals).toEqual(mySignals(open, NOW));
    expect(item.signals.length).toBeGreaterThan(0);
  });

  it("gives a merged PR one chip saying when and by whom", () => {
    const item = searchPR(
      pr({ state: "merged", merged_at: "2026-10-29T12:00:00Z", merged_by: "tashfia" }),
      NOW,
    );
    expect(item.signals).toEqual([{ label: "Merged 2d ago by tashfia", tone: "purple" }]);
  });

  it("carries none of Workday's per-me context", () => {
    const item = searchPR(pr(), NOW);
    expect(item).toMatchObject({ current: false, unseen: false, unseenComment: null, note: null });
  });
});
