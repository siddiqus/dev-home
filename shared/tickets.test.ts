import { describe, it, expect } from "vitest";
import { extractTicketKey, projectOfKey, TICKET_KEY_REGEX } from "./tickets";

describe("extractTicketKey — string input", () => {
  const cases: Array<[string, string | null]> = [
    // leading key
    ["PROJ-123 fix the login bug", "PROJ-123"],
    // bracketed key, lowercase -> upper-cased
    ["[proj-123] fix the login bug", "PROJ-123"],
    // conventional-commit prefix (key not at start, not bracketed)
    ["feat(auth): PROJ-123 add SSO", "PROJ-123"],
    // trailing key in parentheses
    ["Add SSO login page (PROJ-123)", "PROJ-123"],
    // digit-containing project key
    ["ABC2-123 upgrade pipeline", "ABC2-123"],
    // leftmost wins when multiple keys present
    ["PROJ-1 depends on PROJ-2", "PROJ-1"],
    // no key
    ["just a plain title with no ticket", null],
    // empty
    ["", null],
  ];
  it.each(cases)("%j -> %j", (input, expected) => {
    expect(extractTicketKey(input)).toBe(expected);
  });
});

describe("extractTicketKey — source object (title -> branch -> body priority)", () => {
  it("prefers the title when it has a key", () => {
    expect(
      extractTicketKey({
        title: "PROJ-1 do the thing",
        branch: "feature/PROJ-2-do",
        body: "Closes PROJ-3",
      }),
    ).toBe("PROJ-1");
  });

  it("falls back to the branch when the title has no key", () => {
    expect(
      extractTicketKey({
        title: "chore: tidy up",
        branch: "feature/proj-2-do-the-thing",
        body: "Closes PROJ-3",
      }),
    ).toBe("PROJ-2");
  });

  it("falls back to the body when title and branch have no key", () => {
    expect(
      extractTicketKey({
        title: "chore: tidy up",
        branch: "cleanup",
        body: "This closes PROJ-3 finally",
      }),
    ).toBe("PROJ-3");
  });

  it("returns null when no source has a key", () => {
    expect(extractTicketKey({ title: "no key", branch: "cleanup", body: "nothing here" })).toBeNull();
  });

  it("tolerates missing/nullish fields", () => {
    expect(extractTicketKey({ title: null, branch: undefined, body: "PROJ-9 hi" })).toBe("PROJ-9");
    expect(extractTicketKey({})).toBeNull();
  });
});

describe("extractTicketKey — nullish input", () => {
  it("returns null for null/undefined", () => {
    expect(extractTicketKey(null)).toBeNull();
    expect(extractTicketKey(undefined)).toBeNull();
  });
});

describe("projectOfKey", () => {
  it("extracts the project part", () => {
    expect(projectOfKey("CCP-12")).toBe("CCP");
    expect(projectOfKey("abc2-123")).toBe("ABC2");
  });
  it("returns empty string for a non-key", () => {
    expect(projectOfKey("not-a-key-1x")).toBe("");
    expect(projectOfKey("")).toBe("");
  });
});

describe("TICKET_KEY_REGEX", () => {
  it("is exported for reuse by note/text detection", () => {
    expect(TICKET_KEY_REGEX).toBeInstanceOf(RegExp);
    expect("see PROJ-123".match(TICKET_KEY_REGEX)?.[1]).toBe("PROJ-123");
  });
});
