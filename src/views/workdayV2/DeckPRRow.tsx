import type { MouseEvent } from "react";
import type { GitHubPR } from "../../types";
import { Badge } from "../../components/primitives/Badge";
import { compactAge } from "../workday/dates";
import { titleWithoutKey } from "../workday/prState";
import { visibleChips } from "./signals";
import type { DeckPR } from "./types";

export interface DeckPRRowProps {
  /** DOM id, referenced by the PR list's `aria-activedescendant`. */
  id: string;
  item: DeckPR;
  ticketKey: string | null;
  selected: boolean;
  now: Date;
  onSelect(url: string): void;
  onOpen(pr: GitHubPR): void;
}

/**
 * One PR on the card (spec §5.4): current marker, `#number`, title without the
 * key, author when not mine, up to four signal chips with "+N", and age.
 */
export function DeckPRRow({
  id,
  item,
  ticketKey,
  selected,
  now,
  onSelect,
  onOpen,
}: DeckPRRowProps) {
  const { pr } = item;
  const { shown, more } = visibleChips(item.signals);
  const onClick = (e: MouseEvent) => {
    if (e.detail > 0 && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onSelect(pr.html_url);
    onOpen(pr);
  };
  const classes = ["deck-pr", item.current && "deck-pr--current", selected && "deck-pr--selected"]
    .filter(Boolean)
    .join(" ");
  return (
    <div id={id} role="option" aria-selected={selected} className={classes} onClick={onClick}>
      <span className="deck-pr-marker">{item.current ? "▶" : ""}</span>
      <span className="deck-pr-number">#{pr.number}</span>
      <div className="deck-pr-main">
        <div className="deck-pr-title">
          <span>{titleWithoutKey(pr.title, ticketKey)}</span>
          {!item.mine && <span className="deck-pr-author">{pr.user.login}</span>}
        </div>
        {item.signals.length > 0 && (
          <div className="deck-pr-signals">
            {shown.map((s) => (
              <Badge key={s.label} variant={s.tone} title={s.detail}>
                {s.label}
              </Badge>
            ))}
            {more.length > 0 && (
              <Badge variant="neutral" title={more.map((s) => s.label).join(", ")}>
                +{more.length}
              </Badge>
            )}
          </div>
        )}
      </div>
      <span className="deck-pr-age">{compactAge(pr.updated_at, now)}</span>
    </div>
  );
}
