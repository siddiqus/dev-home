import type { MouseEvent } from "react";
import { blurOnPointer } from "./pointer";
import type { DeckTicket } from "./deckTypes";

export interface DeckRailRowProps {
  /** DOM id, referenced by the rail's `aria-activedescendant`. */
  id?: string;
  ticket: DeckTicket;
  /** The key as shown: shortened to the number when every ticket shares one project. */
  label: string;
  selected: boolean;
  onSelect(id: string, e: MouseEvent): void;
  /**
   * "option" (default): a row of the rail listbox, driven by ←/→.
   * "button": a Closed row outside the listbox, reachable with Tab and
   * activated natively with Enter/Space.
   */
  as?: "option" | "button";
}

/** One rail row: stripe, key, title, review chip, status line and activity dot (spec §5.3). */
export function DeckRailRow({
  id,
  ticket,
  label,
  selected,
  onSelect,
  as = "option",
}: DeckRailRowProps) {
  const onClick = (e: MouseEvent) => {
    blurOnPointer(e);
    onSelect(ticket.id, e);
  };
  const classes = [
    "deck-rail-row",
    selected && "deck-rail-row--selected",
    ticket.current && "deck-rail-row--current",
  ]
    .filter(Boolean)
    .join(" ");
  // Spans only: a button may hold phrasing content alone.
  const content = (
    <>
      <span className={`deck-stripe deck-stripe--${ticket.stripe}`} aria-hidden="true" />
      <span className="deck-rail-main">
        <span className="deck-rail-line">
          {/* A ticket-less PR's "#123" is as real an identifier as a Jira key:
              only an empty row's placeholder is muted. */}
          <span
            className={`deck-key${ticket.key || ticket.prs.length > 0 ? "" : " deck-key--none"}`}
          >
            {label}
          </span>{" "}
          <span className="deck-rail-title" title={ticket.title}>
            {ticket.title}
          </span>
          {ticket.todos.length > 0 && (
            <span
              className="badge badge-status badge-status--purple deck-rail-review"
              title={`${ticket.todos.length} #todo note${ticket.todos.length === 1 ? "" : "s"}`}
            >
              #todo
            </span>
          )}
          {ticket.reviewOnly && (
            // Badge's neutral tone by class: the Badge component pins an inline
            // 12px font size that only !important could shrink.
            <span className="badge badge-status badge-status--neutral deck-rail-review">
              review
            </span>
          )}
        </span>
        <span className="deck-rail-status">{ticket.status}</span>
      </span>
      {ticket.unseen ? (
        <span className="deck-dot" role="img" aria-label="new activity" />
      ) : (
        <span aria-hidden="true" />
      )}
    </>
  );
  if (as === "button") {
    return (
      <button type="button" id={id} className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <div id={id} role="option" aria-selected={selected} className={classes} onClick={onClick}>
      {content}
    </div>
  );
}
