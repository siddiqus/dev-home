import type { MouseEvent } from "react";
import type { Note } from "../../types";
import { compactAge } from "./dates";
import type { MentionItem } from "./types";

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * Jira mentions carry no url: the comment on the issue page. Null without a
 * Jira base URL, so callers never render a relative link.
 */
export function jiraCommentUrl(base: string, key: string, mentionId: string): string | null {
  const root = base.trim().replace(/\/$/, "");
  if (!root) return null;
  return `${root}/browse/${key}?focusedCommentId=${mentionId.replace(/^jira:/, "")}`;
}

/**
 * An unseen comment or mention as a one-line quote with a blue dot (spec §5.4):
 * author, age and snippet, linking to the comment in a new tab. Plain text when
 * there is nothing to link to.
 */
export function DeckQuote({
  item,
  now,
  href,
}: {
  item: MentionItem;
  now: Date;
  href?: string | null;
}) {
  const url = href ?? item.url;
  const content = (
    <>
      <span className="deck-dot" aria-hidden="true" />
      <span className="deck-quote-who">{item.who}</span>
      <span className="deck-quote-age">{compactAge(item.at, now)}</span>
      <span className="deck-quote-snippet">“{item.snippet}”</span>
    </>
  );
  if (!url) {
    return (
      <span className="deck-quote" title={item.snippet}>
        {content}
      </span>
    );
  }
  return (
    <a
      className="deck-quote"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      title={item.snippet}
    >
      {content}
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
