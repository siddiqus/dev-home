import { createPortal } from "react-dom";
import Button from "react-bootstrap/Button";
import Offcanvas from "react-bootstrap/Offcanvas";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { GitHubPR, Note } from "../../types";
import { useSwipe } from "../../hooks/useSwipe";
import { DeckCard } from "./DeckCard";
import { DeckRail } from "./DeckRail";
import type { DeckData, DeckPR } from "./deckTypes";
import type { MentionItem } from "./types";

/** Which way the card swipes when the selection changes: "next" enters from the right. */
export type SwipeDirection = "next" | "prev";

export interface DeckModeProps {
  deck: DeckData;
  selectedId: string | null;
  onSelect(id: string): void;
  selectedPrUrl: string | null;
  /** The selected card's PRs in their frozen per-visit order; defaults to the ticket's. */
  cardPRs?: DeckPR[];
  /** The selected card's Jira mention, held for the visit; defaults to the ticket's. */
  cardJiraMention?: MentionItem | null;
  onSelectPr(url: string): void;
  onOpen(pr: GitHubPR): void;
  jiraBaseUrl: string;
  now: Date;
  closedFolded?: boolean;
  onToggleClosed?(): void;
  onReopen?(id: string): void;
  onlyCurrent?: boolean;
  onOpenNote?(note: Note): void;
  /** The `.` note composer is open on the selected card. */
  composing?: boolean;
  onSaveNote?(text: string): Promise<void>;
  onCancelNote?(): void;
  onResolveNote?(note: Note): void;
  /** Swipe direction for the selection change that produced this card; null = no motion. */
  swipe?: SwipeDirection | null;
  /** First load with no data yet: rail and card skeletons (spec §5.13). */
  loading?: boolean;
  /** Source error banner text for the top of the rail. */
  sourceError?: string | null;
  onRetry?(): void;
  /** Assigned not-started tickets, counted on the empty deck. */
  notStartedCount?: number;
  onShowClosed?(): void;
  onSwitchToStandup?(): void;
  /** The big ← previous / next → hint under the card; follows the key-hint toggle. */
  navHints?: boolean;
  /**
   * Phone layout: the card takes the full width and the rail opens as a drawer
   * from the left. Swipes and a Prev / Next bar step through the cards.
   */
  phone?: PhoneDeck;
}

export interface PhoneDeck {
  railOpen: boolean;
  onRailOpenChange(open: boolean): void;
  onPrev(): void;
  onNext(): void;
  /** The card's 1-based place in the rail, and the rail's length. */
  position: number;
  total: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Stands in for the deck while loading, so no cached tab shows under the skeletons. */
const LOADING_DECK: DeckData = {
  current: [],
  merged: [],
  open: [],
  closed: [],
  unmatched: [],
  counts: { tickets: 0, current: 0, unseen: 0 },
};

/**
 * Focus mode: the rail and one centred card with two ghost cards behind it
 * (spec §5.1). Stateless; WorkdayView owns selection and keys.
 */
export function DeckMode({
  deck,
  selectedId,
  onSelect,
  selectedPrUrl,
  cardPRs,
  cardJiraMention,
  onSelectPr,
  onOpen,
  jiraBaseUrl,
  now,
  closedFolded,
  onToggleClosed,
  onReopen,
  onlyCurrent,
  onOpenNote,
  composing,
  onSaveNote,
  onCancelNote,
  onResolveNote,
  swipe = null,
  loading = false,
  sourceError = null,
  onRetry,
  notStartedCount = 0,
  onShowClosed,
  onSwitchToStandup,
  navHints = false,
  phone,
}: DeckModeProps) {
  // Phone: swiping the card steps through the rail; swiping the drawer left closes it.
  const swipeCard = useSwipe((s) => {
    if (s === "left") phone?.onNext();
    else phone?.onPrev();
  });
  const swipeDrawer = useSwipe((s) => {
    if (s === "left") phone?.onRailOpenChange(false);
  });
  if (loading) {
    deck = LOADING_DECK;
    selectedId = null;
  }
  const found =
    [...deck.current, ...deck.merged, ...deck.open].find((t) => t.id === selectedId) ?? null;
  const ticket = found && {
    ...found,
    prs: cardPRs ?? found.prs,
    jiraMention: cardJiraMention ?? found.jiraMention,
  };
  const empty = !loading && deck.current.length === 0 && deck.open.length === 0;
  const rail = (select: (id: string) => void, reopen?: (id: string) => void) => (
    <DeckRail
      deck={deck}
      selectedId={selectedId}
      onSelect={select}
      closedFolded={closedFolded}
      onToggleClosed={onToggleClosed}
      onReopen={reopen}
      onlyCurrent={onlyCurrent}
      loading={loading}
      sourceError={sourceError}
      onRetry={onRetry}
    />
  );
  // In the drawer, a pick (or a reopen) is a jump: the drawer closes on it.
  const closeAfter = (fn: (id: string) => void) => (id: string) => {
    fn(id);
    phone?.onRailOpenChange(false);
  };
  return (
    <div className={`deck-mode${phone ? " deck-mode--phone" : ""}`} data-testid="deck-mode">
      {phone ? (
        <Offcanvas
          show={phone.railOpen}
          onHide={() => phone.onRailOpenChange(false)}
          placement="start"
          className="deck-rail-drawer"
          aria-labelledby="deck-rail-drawer-title"
        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title id="deck-rail-drawer-title">Tickets · {phone.total}</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body {...swipeDrawer}>
            {rail(closeAfter(onSelect), onReopen && closeAfter(onReopen))}
          </Offcanvas.Body>
        </Offcanvas>
      ) : (
        rail(onSelect, onReopen)
      )}
      <div className="deck-stage" {...(phone ? swipeCard : {})}>
        {loading && (
          <div className="deck-column" data-testid="deck-card-skeleton" aria-hidden="true">
            <div className="deck-card deck-card--skeleton">
              <span className="deck-skeleton deck-skeleton--title" />
              <span className="deck-skeleton deck-skeleton--sub" />
              <span className="deck-skeleton deck-skeleton--pr" />
              <span className="deck-skeleton deck-skeleton--pr" />
            </div>
          </div>
        )}
        {empty && (
          <div className="deck-empty">
            <p className="deck-empty-title">
              {/* A source is down: the deck may be empty only because data is missing. */}
              {sourceError ? "Nothing to show" : "Nothing open. Nice."}
            </p>
            <p className="deck-empty-counts">
              {plural(deck.closed.length, "closed tab")} ·{" "}
              {plural(notStartedCount, "assigned ticket")} not started
            </p>
            <p className="deck-empty-links">
              {onShowClosed && deck.closed.length > 0 && (
                <button type="button" className="deck-link" onClick={onShowClosed}>
                  Show closed
                </button>
              )}
              {onSwitchToStandup && (
                <button type="button" className="deck-link" onClick={onSwitchToStandup}>
                  Switch to Standup
                </button>
              )}
            </p>
          </div>
        )}
        {ticket && (
          // Keyed on the ticket so each new selection restarts the swipe from scratch.
          <div key={ticket.id} className="deck-column" data-swipe={swipe ?? undefined}>
            {swipe && <div className="deck-swipe-out" aria-hidden="true" />}
            <div className="deck-ghost deck-ghost--back" aria-hidden="true" />
            <div className="deck-ghost deck-ghost--mid" aria-hidden="true" />
            <DeckCard
              ticket={ticket}
              selectedPrUrl={selectedPrUrl}
              onSelectPr={onSelectPr}
              onOpen={onOpen}
              jiraBaseUrl={jiraBaseUrl}
              now={now}
              onOpenNote={onOpenNote}
              composing={composing}
              onSaveNote={onSaveNote}
              onCancelNote={onCancelNote}
              onResolveNote={onResolveNote}
            />
          </div>
        )}
        {ticket && navHints && !phone && (
          <div className="deck-nav-hint" data-testid="deck-nav-hint" aria-hidden="true">
            <span>
              <kbd>←</kbd> previous
            </span>
            <span>
              next <kbd>→</kbd>
            </span>
          </div>
        )}
      </div>
      {phone &&
        ticket &&
        // Fixed to the viewport from <body>: inside the page, the tab's fade-in
        // transform would anchor it to the page instead.
        createPortal(
          <div className="deck-phone-nav">
            <Button variant="outline-secondary" aria-label="Previous ticket" onClick={phone.onPrev}>
              <IconChevronLeft size={14} aria-hidden="true" /> Prev
            </Button>
            <span className="deck-phone-position">
              {phone.position} / {phone.total}
            </span>
            <Button variant="outline-secondary" aria-label="Next ticket" onClick={phone.onNext}>
              Next <IconChevronRight size={14} aria-hidden="true" />
            </Button>
          </div>,
          document.body,
        )}
    </div>
  );
}
