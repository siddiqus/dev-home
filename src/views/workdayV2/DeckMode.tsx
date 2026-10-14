import type { GitHubPR, Note } from "../../types";
import { DeckCard } from "./DeckCard";
import { DeckRail } from "./DeckRail";
import type { DeckData } from "./types";

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
}

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
}: DeckModeProps) {
  const ticket = [...deck.current, ...deck.open].find((t) => t.id === selectedId) ?? null;
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
      />
      <div className="deck-stage">
        {ticket && (
          <div className="deck-column">
            <div className="deck-ghost deck-ghost--back" aria-hidden="true" />
            <div className="deck-ghost deck-ghost--mid" aria-hidden="true" />
            <DeckCard
              key={ticket.id}
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
