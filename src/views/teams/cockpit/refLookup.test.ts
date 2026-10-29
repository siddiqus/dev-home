import { describe, it, expect } from "vitest";
import { buildRefLookup, refLabel } from "./refLookup";
import dashboardFixture from "../__fixtures__/dashboardFixture";

describe("buildRefLookup", () => {
  const lookup = buildRefLookup(dashboardFixture.issues, dashboardFixture.offBoardPRs);

  it("finds sprint issues by key", () => {
    expect(lookup.issue("PLAT-301")?.summary).toBe("Unassigned cleanup");
    expect(lookup.issue("NOPE-1")).toBeUndefined();
  });

  it("finds PRs linked to sprint issues and off-board PRs", () => {
    expect(lookup.pr("acme/web", 12)).toMatchObject({
      title: "PLAT-101 health strip",
      author: "tashfia",
      createdAt: "2026-06-30T00:00:00.000Z",
    });
    expect(lookup.pr("acme/web", 88)).toMatchObject({ title: "hotfix: logging", author: "nadman" });
    expect(lookup.pr("acme/web", 999)).toBeUndefined();
  });
});

describe("refLabel", () => {
  it("uses the issue key, or the repo name and number for a PR", () => {
    expect(refLabel({ kind: "issue", key: "PLAT-1" })).toBe("PLAT-1");
    expect(refLabel({ kind: "pr", repo: "newscred/cmp-server", number: 29328 })).toBe(
      "cmp-server#29328",
    );
  });
});
