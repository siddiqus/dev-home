import { describe, it, expect } from "vitest";
import type { Note } from "../types";
import { hasTag, noteText } from "./noteTags";

const note = (title: string, content: string): Note => ({
  id: 1,
  type: "free_text",
  title,
  content,
  reference_id: null,
  resolved: 0,
  pinned: 0,
  remind_at: null,
  created_at: "2026-10-10T10:00:00Z",
  updated_at: "2026-10-10T10:00:00Z",
});

describe("noteText", () => {
  it("strips editor HTML to text, one line per block", () => {
    expect(noteText("<p>Renew <strong>cert</strong></p><p>then ping</p>")).toBe(
      "Renew cert\nthen ping",
    );
  });

  it("decodes entities", () => {
    expect(noteText("<p>a &amp; b &lt;c&gt; &#39;d&#39; &nbsp;e</p>")).toBe("a & b <c> 'd'  e");
  });

  it("leaves plain text alone", () => {
    expect(noteText("line one\nline two")).toBe("line one\nline two");
  });
});

describe("hasTag", () => {
  it("finds the tag in the title or the body, in any case", () => {
    expect(hasTag(note("Renew cert #todo", ""), "todo")).toBe(true);
    expect(hasTag(note("", "<p>#TODO renew cert</p>"), "todo")).toBe(true);
    expect(hasTag(note("", "renew cert (#todo)"), "todo")).toBe(true);
  });

  it("needs the tag as a word of its own", () => {
    expect(hasTag(note("", "#todos"), "todo")).toBe(false);
    expect(hasTag(note("", "#todo-list"), "todo")).toBe(false);
    expect(hasTag(note("", "foo#todo"), "todo")).toBe(false);
    expect(hasTag(note("", "todo"), "todo")).toBe(false);
  });

  it("ignores the tag inside a URL", () => {
    expect(hasTag(note("", "https://example.com/page#todo"), "todo")).toBe(false);
    expect(hasTag(note("", '<p><a href="https://x.io/#todo">link</a></p>'), "todo")).toBe(false);
  });

  it("ignores entity-like text, but not a tag after one", () => {
    expect(hasTag(note("", "<p>it&#39;s fine</p>"), "39")).toBe(false);
    expect(hasTag(note("", "<p>done&nbsp;#todo</p>"), "todo")).toBe(true);
  });
});
