import type { GitHubPR, Note } from "../../types";
import { DeckCard } from "./DeckCard";
import { DeckRail } from "./DeckRail";
import type { DeckData } from "./types";

/** Which way the card swipes when the selection changes: "next" enters from the right. */
export type SwipeDirection = "next" | "prev";

export interface DeckModeProps {
  deck: DeckData;
  selectedId: string | null;
  onSelect(id: string): void;
  selectedPrUrl: string | null;
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
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Focus mode: the rail and one centred card with two ghost cards behind it
 * (spec §5.1). Stateless; WorkdayV2View owns selection and keys.
 */
export function DeckMode({
  deck,
  selectedId,
  onSelect,
  selectedPrUrl,
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
  swipe = null,
  loading = false,
  sourceError = null,
  onRetry,
  notStartedCount = 0,
  onShowClosed,
  onSwitchToStandup,
}: DeckModeProps) {
  const ticket = [...deck.current, ...deck.open].find((t) => t.id === selectedId) ?? null;
  const empty = !loading && deck.current.length === 0 && deck.open.length === 0;
  return (
    <div className="deck-mode" data-testid="deck-mode">
      <DeckRail
        deck={deck}
        selectedId={selectedId}
        onSelect={onSelect}
        closedFolded={closedFolded}
        onToggleClosed={onToggleClosed}
        onReopen={onReopen}
        onlyCurrent={onlyCurrent}
        loading={loading}
        sourceError={sourceError}
        onRetry={onRetry}
      />
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
            <p className="deck-empty-title">Nothing open. Nice.</p>
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
