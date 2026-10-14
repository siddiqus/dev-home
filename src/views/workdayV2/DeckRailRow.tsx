import type { MouseEvent } from "react";
import { Badge } from "../../components/primitives/Badge";
import type { DeckTicket } from "./types";

export interface DeckRailRowProps {
  /** DOM id, referenced by the rail's `aria-activedescendant`. */
  id: string;
  ticket: DeckTicket;
  /** The key as shown: shortened to the number when every ticket shares one project. */
  label: string;
  selected: boolean;
  onSelect(id: string): void;
}

/** One rail row: stripe, key, title, review chip, status line and activity dot (spec §5.3). */
export function DeckRailRow({ id, ticket, label, selected, onSelect }: DeckRailRowProps) {
  const onClick = (e: MouseEvent) => {
    // Pointer clicks drop focus so no ring lingers after a modal closes (spec §5.14).
    if (e.detail > 0 && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onSelect(ticket.id);
  };
  const classes = [
    "deck-rail-row",
    selected && "deck-rail-row--selected",
    ticket.current && "deck-rail-row--current",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div id={id} role="option" aria-selected={selected} className={classes} onClick={onClick}>
      <span className={`deck-stripe deck-stripe--${ticket.stripe}`} aria-hidden="true" />
      <div className="deck-rail-main">
        <div className="deck-rail-line">
          <span className={`deck-key${ticket.key ? "" : " deck-key--none"}`}>{label}</span>{" "}
          <span className="deck-rail-title" title={ticket.title}>
            {ticket.title}
          </span>
          {ticket.reviewOnly && (
            <Badge variant="neutral" className="deck-rail-review">
              review
            </Badge>
          )}
        </div>
        <div className="deck-rail-status">{ticket.status}</div>
      </div>
      {ticket.unseen ? (
        <span className="deck-dot" role="img" aria-label="new activity" />
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}
