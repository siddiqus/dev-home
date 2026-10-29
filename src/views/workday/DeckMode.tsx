import { useState } from "react";
import { createPortal } from "react-dom";
import Button from "react-bootstrap/Button";
import Offcanvas from "react-bootstrap/Offcanvas";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { GitHubPR, Note } from "../../types";
import { useSwipe } from "../../hooks/useSwipe";
import { useBackClose } from "../../hooks/useBackClose";
import { DeckCard } from "./DeckCard";
import { DeckRail } from "./DeckRail";
import { loopWindow, outgoingOffset, type SwipeDirection } from "./deckCarousel";
import type { DeckData, DeckPR, DeckTicket } from "./deckTypes";
import type { MentionItem } from "./types";
import { useDeckCarousel } from "./useDeckCarousel";

export type { SwipeDirection };

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
  /** Direction of the selection change that produced this card; null = no motion. */
  swipe?: SwipeDirection | null;
  /**
   * The Prev / Next order the phone's carousel loops through (the rail, less
   * Merged recently); defaults to the selected card alone, with no neighbours.
   */
  stops?: DeckTicket[];
  /** Step to the previous / next stop, wrapping: the phone's bar, swipes and neighbour taps. */
  onPrev?(): void;
  onNext?(): void;
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
   * Phone layout: the carousel takes the full width and the rail opens as a
   * drawer from the left. A Prev / Next bar steps through the cards too.
   */
  phone?: PhoneDeck;
}

export interface PhoneDeck {
  railOpen: boolean;
  onRailOpenChange(open: boolean): void;
  /** The card's 1-based place among the Prev / Next stops, and how many there are. */
  position: number;
  total: number;
  /** The rail's length, for the drawer title. */
  tickets: number;
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

const noop = () => {};

/** The card on show, and a card that left the loop, kept beside it until the glide ends. */
interface Shown {
  id: string | null;
  ticket: DeckTicket | null;
  outgoing: { ticket: DeckTicket; offset: number } | null;
  /** Where the previous card sits on this card's track: the glide starts there. */
  from: number | null;
}

/**
 * Focus mode: the rail and one centred card with two ghost cards behind it
 * (spec §5.1). On a phone, the card is the centre of a looping carousel, its
 * neighbours shrunk and faded either side. WorkdayView owns selection and
 * keys; the carousel only reports where a swipe or a neighbour tap lands.
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
  stops,
  onPrev,
  onNext,
  loading = false,
  sourceError = null,
  onRetry,
  notStartedCount = 0,
  onShowClosed,
  onSwitchToStandup,
  navHints = false,
  phone,
}: DeckModeProps) {
  // Phone: swiping the drawer left closes it.
  const swipeDrawer = useSwipe((s) => {
    if (s === "left") phone?.onRailOpenChange(false);
  });
  useBackClose(!!phone?.railOpen, () => phone?.onRailOpenChange(false));
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
  const loop = stops ?? (found ? [found] : []);

  // On a move, find where the previous card sits on the new track, so the
  // glide starts from it. A card that left the loop (a jump, a close) joins
  // the track on the side it leaves by, until the glide ends.
  const [shown, setShown] = useState<Shown>(() => ({
    id: found?.id ?? null,
    ticket: found,
    outgoing: null,
    from: null,
  }));
  if (shown.id !== (found?.id ?? null) || shown.ticket !== found) {
    let { outgoing, from } = shown;
    if (shown.id !== (found?.id ?? null)) {
      outgoing = null;
      from = null;
      if (swipe && shown.ticket && found) {
        from = outgoingOffset(loopWindow(loop, found), shown.ticket.id, swipe);
        if (from === null) {
          outgoing = { ticket: shown.ticket, offset: swipe === "next" ? -1 : 1 };
          from = outgoing.offset;
        }
      }
    }
    setShown({ id: found?.id ?? null, ticket: found, outgoing, from });
  }
  const slots = phone && ticket ? loopWindow(loop, ticket, shown.outgoing) : [];

  // A swipe that lands on a neighbour, or a tap on one, steps to it.
  const goTo = (offset: number) => {
    if (offset === 1) onNext?.();
    else if (offset === -1) onPrev?.();
    else {
      const slot = slots.find((s) => s.offset === offset);
      if (slot) onSelect(slot.ticket.id);
    }
  };
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  useDeckCarousel(track, {
    selectedId: found?.id ?? null,
    from: shown.from,
    onSettle: goTo,
    onGlideEnd: () => setShown((s) => (s.outgoing ? { ...s, outgoing: null } : s)),
  });
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
  const card = ticket && (
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
            <Offcanvas.Title id="deck-rail-drawer-title">Tickets · {phone.tickets}</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body {...swipeDrawer}>
            {rail(closeAfter(onSelect), onReopen && closeAfter(onReopen))}
          </Offcanvas.Body>
        </Offcanvas>
      ) : (
        rail(onSelect, onReopen)
      )}
      <div className="deck-stage">
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
        {ticket && !phone && (
          // Keyed on the ticket so each new selection restarts the swipe from scratch.
          <div key={ticket.id} className="deck-column" data-swipe={swipe ?? undefined}>
            {swipe && <div className="deck-swipe-out" aria-hidden="true" />}
            <div className="deck-ghost deck-ghost--back" aria-hidden="true" />
            <div className="deck-ghost deck-ghost--mid" aria-hidden="true" />
            {card}
          </div>
        )}
        {ticket && phone && (
          // Sideways swiping is off while a note is being written, so a swipe
          // on the text box can't carry the card away.
          <div
            ref={setTrack}
            className={`deck-track${composing ? " deck-track--locked" : ""}`}
            data-testid="deck-track"
            data-swipe={swipe ?? undefined}
          >
            {slots.map((slot) =>
              slot.offset === 0 ? (
                <div key={slot.key} className="deck-slide" data-offset={0}>
                  <div className="deck-slide-card">{card}</div>
                </div>
              ) : (
                // A neighbour is a picture of its card: inert inside, a tap on it steps there.
                <div
                  key={slot.key}
                  className="deck-slide deck-slide--peek"
                  data-offset={slot.offset}
                  onClick={() => goTo(slot.offset)}
                >
                  <div className="deck-slide-card" aria-hidden="true" {...{ inert: "" }}>
                    <DeckCard
                      ticket={slot.ticket}
                      selectedPrUrl={null}
                      onSelectPr={noop}
                      onOpen={noop}
                      jiraBaseUrl={jiraBaseUrl}
                      now={now}
                    />
                  </div>
                </div>
              ),
            )}
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
            <Button variant="outline-secondary" aria-label="Previous ticket" onClick={onPrev}>
              <IconChevronLeft size={14} aria-hidden="true" /> Prev
            </Button>
            <span className="deck-phone-position">
              {phone.position} / {phone.total}
            </span>
            <Button variant="outline-secondary" aria-label="Next ticket" onClick={onNext}>
              Next <IconChevronRight size={14} aria-hidden="true" />
            </Button>
          </div>,
          document.body,
        )}
    </div>
  );
}
