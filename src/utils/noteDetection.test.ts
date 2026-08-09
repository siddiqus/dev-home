import { describe, it, expect } from "vitest";
import { detectNote } from "./noteDetection";

describe("detectNote", () => {
  it("detects a standalone bare JIRA key", () => {
    const r = detectNote("Fix PROJ-123 before the demo");
    expect(r.type).toBe("jira_ticket");
    expect(r.referenceId).toBe("PROJ-123");
  });

  it("upper-cases a lower-case bare key", () => {
    expect(detectNote("proj-42").referenceId).toBe("PROJ-42");
  });

  it("detects a bare key when it abuts punctuation", () => {
    expect(detectNote("(ABC2-7): done").type).toBe("jira_ticket");
    expect(detectNote("(ABC2-7): done").referenceId).toBe("ABC2-7");
  });

  it("detects a full JIRA browse URL", () => {
    const r = detectNote("https://acme.atlassian.net/browse/PROJ-123");
    expect(r.type).toBe("jira_ticket");
    expect(r.referenceId).toBe("https://acme.atlassian.net/browse/PROJ-123");
  });

  it("treats a pasted booking.com link as a plain link, not a JIRA ticket", () => {
    // Regression: the `min-30000` fragment inside the URL used to match the
    // bare-key regex (\b treats `-` as a boundary) and hijacked the whole paste.
    const text =
      "[BDT-min-30000-1%3Broomfacility%3D108&no_rooms=1](https://www.booking.com/hotel/th/pullman-pattaya-hotel-g.html?aid=304142&nflt=price%3DBDT-min-30000-1%3Broomfacility%3D108&checkin=2026-10-17&checkout=2026-10-20&sr_pri_blocks=23760632_246092431_2_1_0__1397440#_)";
    const r = detectNote(text);
    expect(r.type).toBe("link");
    expect(r.referenceId).toContain("https://www.booking.com/");
  });

  it("ignores a ticket-shaped fragment embedded in a hyphenated token", () => {
    expect(detectNote("prefix-min-30000-suffix").type).toBe("free_text");
  });

  it("ignores a ticket-shaped path segment inside a non-browse URL", () => {
    const r = detectNote("https://example.com/path/PROJ-123/extra");
    expect(r.type).toBe("link");
  });

  it("still finds a real bare key sitting next to a pasted URL", () => {
    const r = detectNote("PROJ-123 see https://www.booking.com/hotel/x-BDT-min-30000-1");
    expect(r.type).toBe("jira_ticket");
    expect(r.referenceId).toBe("PROJ-123");
  });

  it("detects a GitHub PR URL", () => {
    const r = detectNote("https://github.com/acme/repo/pull/42");
    expect(r.type).toBe("github_pr");
  });

  it("falls back to free_text for plain prose", () => {
    expect(detectNote("just a reminder to email the team").type).toBe("free_text");
  });
});
