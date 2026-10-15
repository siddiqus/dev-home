import type { Note } from "../types";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * A note body as plain text: the editor stores HTML, so block ends become line
 * breaks, tags go and entities are decoded. Plain text passes through.
 */
export function noteText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>\s*/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1));
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/\n+$/, "");
}

/** A note's first non-empty line: its title, else the first line of its body. */
export function noteHeadline(n: Note): string {
  return (
    (n.title?.trim() || noteText(n.content))
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
}

const URL_RE = /\bhttps?:\/\/\S+/gi;

/**
 * Whether the note carries `#tag` (case-insensitive) in its title or body, as
 * a word of its own: not `#todos`, `foo#todo` or a URL fragment.
 */
export function hasTag(note: Note, tag: string): boolean {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\w#&/])#${escaped}(?![\\w-])`, "i");
  const text = `${note.title}\n${noteText(note.content)}`.replace(URL_RE, " ");
  return re.test(text);
}
