import { useEffect, useRef } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { deckProjects, shortKey } from "./buildDeck";
import { DeckRailRow } from "./DeckRailRow";
import { blurOnPointer } from "./pointer";
import type { DeckData, DeckTicket } from "./deckTypes";

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
  /** First load with no data yet: six skeleton rows (spec §5.13). */
  loading?: boolean;
  /** A source failed: a one-line banner at the top of the rail, e.g. "Jira unavailable, showing PRs only". */
  sourceError?: string | null;
  /** The banner's "retry" link. */
  onRetry?(): void;
}

const SKELETON_ROWS = 6;
const KEYS_HELP_ID = "deck-rail-keys";
const CLOSED_LIST_ID = "deck-rail-closed-list";

/** DOM id of a rail row: index-based, since ticket ids can be URLs. */
const rowId = (group: string, index: number) => `deck-rail-${group}-${index}`;

/** The key column: short key, or `#number` for a ticketless PR tab. */
function railLabel(t: DeckTicket, projects: Set<string>): string {
  if (t.key) return shortKey(t.key, projects);
  return t.prs[0] ? `#${t.prs[0].pr.number}` : "—";
}

/**
 * The rail (spec §5.3, §5.14): a listbox of Current and Open tickets with
 * `aria-activedescendant`, driven by the deck keys (←/→ tickets, ↑/↓ the PRs on
 * the card). The Closed group sits after the listbox, outside it: a real
 * disclosure button and a list of buttons that reopen a tab, reachable with Tab
 * and activated natively by Enter/Space (the deck keys leave buttons outside
 * listboxes alone).
 */
export function DeckRail({
  deck,
  selectedId,
  onSelect,
  closedFolded = true,
  onToggleClosed,
  onReopen,
  onlyCurrent = false,
  loading = false,
  sourceError = null,
  onRetry,
}: DeckRailProps) {
  // Built once per render: every row's short key checks against it.
  const projects = deckProjects([...deck.current, ...deck.open, ...deck.closed]);
  const groups = [
    { name: "current", label: "Current", heading: "▶ Current", tickets: deck.current },
    ...(onlyCurrent ? [] : [{ name: "open", label: "Open", heading: "Open", tickets: deck.open }]),
  ];
  let activeId: string | undefined;
  for (const g of groups) {
    const i = g.tickets.findIndex((t) => t.id === selectedId);
    if (i !== -1) activeId = rowId(g.name, i);
  }

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  return (
    <div className="deck-rail">
      {sourceError && (
        <div className="deck-rail-banner" role="status">
          <IconAlertTriangle size={14} aria-hidden="true" className="deck-rail-banner-icon" />
          <span className="deck-rail-banner-text">
            {sourceError}
            {onRetry && " · "}
          </span>
          {onRetry && (
            // Outside the text so the collapsed slim rail keeps it, as an icon.
            <button
              type="button"
              className="deck-rail-banner-retry"
              aria-label="Retry"
              title="Retry"
              onClick={(e) => {
                blurOnPointer(e);
                onRetry();
              }}
            >
              <IconRefresh size={14} aria-hidden="true" className="deck-rail-banner-retry-icon" />
              <span className="deck-rail-banner-retry-label">retry</span>
            </button>
          )}
        </div>
      )}
      <div className="deck-rail-scroll">
        <span id={KEYS_HELP_ID} className="visually-hidden">
          Left and right arrows move between tickets. Up and down arrows pick a pull request on the
          card.
        </span>
        <div
          ref={listRef}
          className="deck-rail-list"
          role="listbox"
          aria-label="Tickets"
          aria-describedby={KEYS_HELP_ID}
          aria-activedescendant={activeId}
          aria-busy={loading || undefined}
          tabIndex={0}
        >
          {loading && (
            <div className="deck-rail-skeleton" data-testid="deck-rail-skeleton" aria-hidden="true">
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div key={i} className="deck-skeleton-row">
                  <span className="deck-skeleton deck-skeleton--stripe" />
                  <span className="deck-skeleton deck-skeleton--line" />
                </div>
              ))}
            </div>
          )}
          {groups.map(
            (g) =>
              g.tickets.length > 0 && (
                <div key={g.name} role="group" aria-label={g.label} className="deck-rail-group">
                  <div
                    className={`deck-rail-heading deck-rail-heading--${g.name}`}
                    aria-hidden="true"
                  >
                    <span>{g.heading}</span>
                    <span>{g.tickets.length}</span>
                  </div>
                  {g.tickets.map((t, i) => (
                    <DeckRailRow
                      key={t.id}
                      id={rowId(g.name, i)}
                      ticket={t}
                      label={railLabel(t, projects)}
                      selected={t.id === selectedId}
                      onSelect={(id) => onSelect(id)}
                    />
                  ))}
                </div>
              ),
          )}
          {onlyCurrent && deck.current.length === 0 && (
            <div className="deck-rail-empty">Nothing current · g c shows all</div>
          )}
        </div>
        {deck.closed.length > 0 && (
          <div role="group" aria-label="Closed" className="deck-rail-group deck-rail-closed">
            <button
              type="button"
              className="deck-rail-heading deck-rail-heading--closed"
              aria-expanded={!closedFolded}
              aria-controls={closedFolded ? undefined : CLOSED_LIST_ID}
              onClick={(e) => {
                blurOnPointer(e);
                onToggleClosed?.();
              }}
            >
              <span>Closed · {deck.closed.length}</span>
              <span aria-hidden="true">{closedFolded ? "▸" : "▾"}</span>
            </button>
            {!closedFolded && (
              <ul id={CLOSED_LIST_ID} className="deck-rail-closed-list">
                {deck.closed.map((t) => (
                  <li key={t.id}>
                    <DeckRailRow
                      as="button"
                      ticket={t}
                      label={railLabel(t, projects)}
                      selected={false}
                      onSelect={(id, e) => {
                        onReopen?.(id);
                        // The button leaves with the row; keyboard users land on
                        // the listbox, where the reopened tab is now selected.
                        if (e.detail === 0) listRef.current?.focus();
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
