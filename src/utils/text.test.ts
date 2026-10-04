import { describe, it, expect } from "vitest";
import { noteMatchesQuery } from "./text";
import { Note } from "../types";

const note = (overrides: Partial<Note>): Note => ({
  id: 1,
  type: "free_text",
  title: "",
  content: "",
  reference_id: null,
  resolved: 0,
  pinned: 0,
  remind_at: null,
  created_at: "2026-01-01 00:00:00",
  updated_at: "2026-01-01 00:00:00",
  ...overrides,
});

describe("noteMatchesQuery", () => {
  it("matches everything for an empty or whitespace query", () => {
    expect(noteMatchesQuery(note({}), "")).toBe(true);
    expect(noteMatchesQuery(note({}), "   ")).toBe(true);
  });

  it("matches title and content case-insensitively", () => {
    expect(noteMatchesQuery(note({ title: "Deploy Plan" }), "deploy")).toBe(true);
    expect(noteMatchesQuery(note({ content: "check the LOGS" }), "logs")).toBe(true);
  });

  it("matches the reference id", () => {
    const n = note({ type: "jira_ticket", reference_id: "https://x.atlassian.net/browse/CMP-123" });
    expect(noteMatchesQuery(n, "cmp-123")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(noteMatchesQuery(note({ title: "foo", content: "bar" }), "baz")).toBe(false);
  });
});
