import { describe, it, expect } from "vitest";
import { prNoteKey, normalizeNoteRef, notesForPr } from "./prNotes";
import type { Note, GitHubPR } from "../types";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    type: "free_text",
    title: "Test Note",
    content: "Test content",
    reference_id: null,
    resolved: 0,
    pinned: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 1,
    title: "Test PR",
    html_url: "https://github.com/o/r/pull/1",
    state: "open",
    draft: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    user: { login: "octocat", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    body: "",
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    in_merge_queue: false,
    ...overrides,
  };
}

describe("prNoteKey", () => {
  it("formats as owner/repo#number", () => {
    expect(prNoteKey({ repo_full_name: "octo/repo", number: 42 })).toBe("octo/repo#42");
    expect(prNoteKey({ repo_full_name: "owner/my-repo", number: 123 })).toBe("owner/my-repo#123");
  });
});

describe("normalizeNoteRef", () => {
  it("returns null for null/undefined/empty/whitespace", () => {
    expect(normalizeNoteRef(null)).toBe(null);
    expect(normalizeNoteRef(undefined)).toBe(null);
    expect(normalizeNoteRef("")).toBe(null);
    expect(normalizeNoteRef("   ")).toBe(null);
    expect(normalizeNoteRef("\t\n ")).toBe(null);
    expect(normalizeNoteRef("\n")).toBe(null);
  });

  it("returns canonical owner/repo#number as-is (trimmed)", () => {
    expect(normalizeNoteRef("octo/repo#42")).toBe("octo/repo#42");
    expect(normalizeNoteRef("  owner/my-repo#123  ")).toBe("owner/my-repo#123");
    expect(normalizeNoteRef("org-name/repo-name#999")).toBe("org-name/repo-name#999");
  });

  it("extracts owner/repo#number from GitHub PR URL (plain)", () => {
    expect(normalizeNoteRef("https://github.com/octo/repo/pull/42")).toBe("octo/repo#42");
    expect(normalizeNoteRef("https://github.com/owner/my-repo/pull/123")).toBe("owner/my-repo#123");
  });

  it("extracts owner/repo#number from GitHub PR URL with query and fragment", () => {
    expect(normalizeNoteRef("https://github.com/octo/repo/pull/42?diff=split#discussion")).toBe(
      "octo/repo#42",
    );
    expect(normalizeNoteRef("https://github.com/owner/repo/pull/99#issuecomment-123")).toBe(
      "owner/repo#99",
    );
    expect(normalizeNoteRef("https://github.com/a/b/pull/1?tab=commits")).toBe("a/b#1");
  });

  it("extracts owner/repo#number from GitHub PR URL with trailing slash", () => {
    expect(normalizeNoteRef("https://github.com/octo/repo/pull/42/")).toBe("octo/repo#42");
    expect(normalizeNoteRef("https://github.com/owner/repo/pull/99/?diff=split")).toBe(
      "owner/repo#99",
    );
  });

  it("extracts owner/repo#number from http scheme", () => {
    expect(normalizeNoteRef("http://github.com/octo/repo/pull/42")).toBe("octo/repo#42");
    expect(normalizeNoteRef("http://github.com/owner/repo/pull/123/")).toBe("owner/repo#123");
  });

  it("extracts owner/repo#number from mixed-case domain", () => {
    expect(normalizeNoteRef("https://GitHub.com/octo/repo/pull/42")).toBe("octo/repo#42");
  });

  it("returns null for malformed canonical refs", () => {
    expect(normalizeNoteRef("octo//repo#42")).toBe(null);
  });

  it("returns null for bare GitHub repo URL without /pull/", () => {
    expect(normalizeNoteRef("https://github.com/octo/repo")).toBe(null);
    expect(normalizeNoteRef("https://github.com/owner/my-repo/")).toBe(null);
    expect(normalizeNoteRef("https://github.com/owner/repo/issues/42")).toBe(null);
  });

  it("returns null for Jira key", () => {
    expect(normalizeNoteRef("PROJ-123")).toBe(null);
    expect(normalizeNoteRef("ABC-456")).toBe(null);
  });

  it("returns null for Jira URL", () => {
    expect(normalizeNoteRef("https://jira.example.com/browse/PROJ-123")).toBe(null);
    expect(normalizeNoteRef("http://company.atlassian.net/browse/ABC-456")).toBe(null);
  });

  it("returns null for generic link", () => {
    expect(normalizeNoteRef("https://example.com/some/path")).toBe(null);
    expect(normalizeNoteRef("http://google.com")).toBe(null);
  });

  it("returns null for free text", () => {
    expect(normalizeNoteRef("some random text")).toBe(null);
    expect(normalizeNoteRef("just a note")).toBe(null);
  });
});

describe("notesForPr", () => {
  it("returns notes whose reference_id resolves to the PR key", () => {
    const pr = makePR({ repo_full_name: "octo/repo", number: 42 });
    const canonicalNote = makeNote({ id: 1, reference_id: "octo/repo#42" });
    const urlNote = makeNote({ id: 2, reference_id: "https://github.com/octo/repo/pull/42" });
    const differentPrNote = makeNote({ id: 3, reference_id: "octo/repo#99" });
    const nonMatchingNote = makeNote({ id: 4, reference_id: "PROJ-123" });
    const nullRefNote = makeNote({ id: 5, reference_id: null });

    const result = notesForPr(
      [canonicalNote, urlNote, differentPrNote, nonMatchingNote, nullRefNote],
      pr,
    );

    expect(result).toEqual([canonicalNote, urlNote]);
  });

  it("preserves input order", () => {
    const pr = makePR({ repo_full_name: "owner/repo", number: 5 });
    const note1 = makeNote({ id: 10, reference_id: "owner/repo#5" });
    const note2 = makeNote({ id: 20, reference_id: "https://github.com/owner/repo/pull/5" });
    const note3 = makeNote({ id: 30, reference_id: "owner/repo#5" });

    const result = notesForPr([note1, note2, note3], pr);

    expect(result.map((n) => n.id)).toEqual([10, 20, 30]);
  });

  it("returns empty array when no notes match", () => {
    const pr = makePR({ repo_full_name: "octo/repo", number: 42 });
    const note1 = makeNote({ id: 1, reference_id: "different/repo#42" });
    const note2 = makeNote({ id: 2, reference_id: null });

    const result = notesForPr([note1, note2], pr);

    expect(result).toEqual([]);
  });

  it("handles empty notes array", () => {
    const pr = makePR({ repo_full_name: "octo/repo", number: 42 });

    const result = notesForPr([], pr);

    expect(result).toEqual([]);
  });
});
