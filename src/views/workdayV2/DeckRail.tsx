import { useEffect } from "react";
import { shortKey } from "./buildDeck";
import { DeckRailRow } from "./DeckRailRow";
import type { DeckData, DeckTicket } from "./types";

export interface DeckRailProps {
  deck: DeckData;
  selectedId: string | null;
  onSelect(id: string): void;
  /** Closed group folded (spec §5.3: folded by default). */
  closedFolded?: boolean;
  onToggleClosed?(): void;
  /** Clicking a Closed row reopens the tab in its arrival slot and selects it. */
  onReopen?(id: string): void;
  /** `g c`: show only ▶ Current, hiding Open. */
  onlyCurrent?: boolean;
}

/** DOM id of a rail row: index-based, since ticket ids can be URLs. */
const rowId = (group: string, index: number) => `deck-rail-${group}-${index}`;

/** The key column: short key, or `#number` for a ticketless PR tab. */
function railLabel(t: DeckTicket, all: DeckTicket[]): string {
  if (t.key) return shortKey(t.key, all);
  return t.prs[0] ? `#${t.prs[0].pr.number}` : "—";
}

/**
 * The rail (spec §5.3, §5.14): a listbox of Current and Open tickets with
 * `aria-activedescendant`, plus a Closed group that folds and reopens on click.
 */
export function DeckRail({
  deck,
  selectedId,
  onSelect,
  closedFolded = true,
  onToggleClosed,
  onReopen,
  onlyCurrent = false,
}: DeckRailProps) {
  const all = [...deck.current, ...deck.open, ...deck.closed];
  const groups = [
    { name: "current", label: "Current", heading: "▶ Current", tickets: deck.current },
    ...(onlyCurrent ? [] : [{ name: "open", label: "Open", heading: "Open", tickets: deck.open }]),
  ];
  let activeId: string | undefined;
  for (const g of groups) {
    const i = g.tickets.findIndex((t) => t.id === selectedId);
    if (i !== -1) activeId = rowId(g.name, i);
  }

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  return (
    <div
      className="deck-rail"
      role="listbox"
      aria-label="Tickets"
      aria-activedescendant={activeId}
      tabIndex={0}
    >
      {groups.map(
        (g) =>
          g.tickets.length > 0 && (
            <div key={g.name} role="group" aria-label={g.label} className="deck-rail-group">
              <div className={`deck-rail-heading deck-rail-heading--${g.name}`} aria-hidden="true">
                <span>{g.heading}</span>
                <span>{g.tickets.length}</span>
              </div>
              {g.tickets.map((t, i) => (
                <DeckRailRow
                  key={t.id}
                  id={rowId(g.name, i)}
                  ticket={t}
                  label={railLabel(t, all)}
                  selected={t.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ),
      )}
      {onlyCurrent && deck.current.length === 0 && (
        <div className="deck-rail-empty">Nothing current · g c shows all</div>
      )}
      {deck.closed.length > 0 && (
        <div role="group" aria-label="Closed" className="deck-rail-group">
          <button
            type="button"
            className="deck-rail-heading deck-rail-heading--closed"
            aria-expanded={!closedFolded}
            onClick={(e) => {
              if (e.detail > 0) e.currentTarget.blur();
              onToggleClosed?.();
            }}
          >
            <span>Closed · {deck.closed.length}</span>
            <span aria-hidden="true">{closedFolded ? "▸" : "▾"}</span>
          </button>
          {!closedFolded &&
            deck.closed.map((t, i) => (
              <DeckRailRow
                key={t.id}
                id={rowId("closed", i)}
                ticket={t}
                label={railLabel(t, all)}
                selected={false}
                onSelect={(id) => onReopen?.(id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
