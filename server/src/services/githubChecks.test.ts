import { describe, it, expect } from "vitest";
import { computeChecksStatus, parseRequiredContexts } from "./githubChecks";

/** Build a CheckRun context node (GitHub Actions / Checks API). */
function ck(name: string, conclusion: string | null, completedAt?: string) {
  return {
    __typename: "CheckRun",
    name,
    conclusion,
    status: conclusion ? "COMPLETED" : "IN_PROGRESS",
    detailsUrl: null,
    startedAt: completedAt || null,
    completedAt: completedAt || null,
  };
}

/** Build a legacy StatusContext node (commit status API). */
function sc(context: string, state: string, createdAt?: string) {
  return {
    __typename: "StatusContext",
    context,
    state,
    targetUrl: null,
    createdAt: createdAt || null,
  };
}

describe("computeChecksStatus", () => {
  // Regression for PR #12566: the JIRA check re-ran across four suites, the three
  // older runs failed, the newest passed. The raw statusCheckRollup.state was
  // FAILURE, but the merge box shows all green. Latest-per-name must win.
  it("treats stale failed re-runs as superseded by the newest passing run", () => {
    const pr12566 = [
      ck("JIRA", "FAILURE", "2026-09-22T06:38:33Z"),
      ck("JIRA", "FAILURE", "2026-09-22T06:43:38Z"),
      ck("JIRA", "FAILURE", "2026-09-22T06:48:28Z"),
      ck("JIRA", "SUCCESS", "2026-09-22T06:49:18Z"),
      ck("Git Checks", "SUCCESS", "2026-09-22T06:40:00Z"),
      ck("test-playwright", "SUCCESS", "2026-09-22T06:41:00Z"),
      ck("ai-suggestion", "SKIPPED", "2026-09-22T06:41:00Z"),
      ck("file_changes", "SUCCESS", "2026-09-22T06:41:00Z"),
      ck("lint", "SUCCESS", "2026-09-22T06:41:00Z"),
      ck("build", "SKIPPED", "2026-09-22T06:41:00Z"),
      ck("test", "SKIPPED", "2026-09-22T06:41:00Z"),
      ck("test-enzyme", "SKIPPED", "2026-09-22T06:41:00Z"),
      ck("report", "SKIPPED", "2026-09-22T06:41:00Z"),
      sc("Danger-PR-Format", "SUCCESS", "2026-09-22T06:41:00Z"),
    ];
    expect(computeChecksStatus(pr12566)).toBe("SUCCESS");
  });

  it("returns null when there are no checks", () => {
    expect(computeChecksStatus([])).toBeNull();
  });

  it("takes the newest run per name — a newer failure supersedes an older success", () => {
    const ctx = [
      ck("lint", "SUCCESS", "2026-09-22T06:00:00Z"),
      ck("lint", "FAILURE", "2026-09-22T07:00:00Z"),
    ];
    expect(computeChecksStatus(ctx)).toBe("FAILURE");
  });

  it("reports PENDING when a check is still running", () => {
    const inProgress = {
      __typename: "CheckRun",
      name: "lint",
      conclusion: null,
      status: "IN_PROGRESS",
      startedAt: "2026-09-22T06:00:00Z",
      completedAt: null,
    };
    expect(computeChecksStatus([inProgress])).toBe("PENDING");
  });

  it("treats skipped and neutral conclusions as passing", () => {
    const ctx = [ck("test", "SKIPPED"), ck("lint", "NEUTRAL")];
    expect(computeChecksStatus(ctx)).toBe("SUCCESS");
  });

  it("dedupes legacy StatusContext nodes by createdAt", () => {
    const ctx = [
      sc("ci/legacy", "FAILURE", "2026-09-22T06:00:00Z"),
      sc("ci/legacy", "SUCCESS", "2026-09-22T07:00:00Z"),
    ];
    expect(computeChecksStatus(ctx)).toBe("SUCCESS");
  });

  describe("with a required-contexts set", () => {
    const required = new Set(["lint", "test", "report", "Git Checks"]);

    it("ignores a failing non-required check (the PR #12566 shape)", () => {
      const ctx = [
        ck("JIRA", "FAILURE", "2026-09-22T06:49:18Z"), // latest JIRA failed, but not required
        ck("lint", "SUCCESS"),
        ck("Git Checks", "SUCCESS"),
        ck("test", "SKIPPED"),
        ck("report", "SKIPPED"),
      ];
      expect(computeChecksStatus(ctx, required)).toBe("SUCCESS");
    });

    it("reports FAILURE when a required check's latest run is red", () => {
      const ctx = [ck("JIRA", "SUCCESS"), ck("lint", "FAILURE")];
      expect(computeChecksStatus(ctx, required)).toBe("FAILURE");
    });

    it("returns null when none of the required checks have reported", () => {
      expect(computeChecksStatus([ck("JIRA", "SUCCESS")], required)).toBeNull();
    });

    it("falls back to evaluating all checks when the required set is empty", () => {
      const ctx = [ck("JIRA", "FAILURE")];
      expect(computeChecksStatus(ctx, new Set())).toBe("FAILURE");
    });
  });
});

describe("parseRequiredContexts", () => {
  it("unions branch-protection contexts with ruleset required checks", () => {
    const protection = {
      contexts: ["lint", "test"],
      checks: [{ context: "lint" }, { context: "test" }],
    };
    const rules = [
      {
        type: "required_status_checks",
        parameters: { required_status_checks: [{ context: "report" }, { context: "Git Checks" }] },
      },
    ];
    expect([...parseRequiredContexts(protection, rules)].sort()).toEqual([
      "Git Checks",
      "lint",
      "report",
      "test",
    ]);
  });

  it("returns an empty set when neither source has required checks", () => {
    expect(parseRequiredContexts(null, null).size).toBe(0);
    expect(parseRequiredContexts({}, []).size).toBe(0);
  });

  it("reads from branch protection alone", () => {
    expect([...parseRequiredContexts({ contexts: ["a"] }, [])]).toEqual(["a"]);
  });

  it("reads from rulesets alone", () => {
    const rules = [
      { type: "required_status_checks", parameters: { required_status_checks: [{ context: "b" }] } },
    ];
    expect([...parseRequiredContexts(null, rules)]).toEqual(["b"]);
  });
});
