import type { MouseEvent } from "react";
import type { Note } from "../../types";
import { compactAge } from "../workday/dates";
import type { MentionItem } from "../workday/types";

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * An unseen comment or mention as a one-line quote with a blue dot (spec §5.4):
 * author, age and snippet, linking to the comment in a new tab.
 */
export function DeckQuote({ item, now, href }: { item: MentionItem; now: Date; href?: string }) {
  return (
    <a
      className="deck-quote"
      href={href ?? item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      title={item.snippet}
    >
      <span className="deck-dot" aria-hidden="true" />
      <span className="deck-quote-who">{item.who}</span>
      <span className="deck-quote-age">{compactAge(item.at, now)}</span>
      <span className="deck-quote-snippet">“{item.snippet}”</span>
    </a>
  );
}

/** First line of a note, for the 📝 line. */
const noteLine = (note: Note) =>
  (note.title?.trim() || note.content).split("\n").find((l) => l.trim()) ?? "";

/** My newest unresolved note (📝); clicking opens the note editor (spec §5.10). */
export function DeckNoteLine({ note, onOpen }: { note: Note; onOpen?(note: Note): void }) {
  const text = noteLine(note);
  return (
    <button
      type="button"
      className="deck-note-line"
      title={text}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(note);
      }}
    >
      <span aria-hidden="true">📝</span> <span className="deck-note-text">{text}</span>
    </button>
  );
}
