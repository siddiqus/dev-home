import type { GitHubPR } from "../../types";
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
}: DeckModeProps) {
  const ticket = [...deck.current, ...deck.open].find((t) => t.id === selectedId) ?? null;
  return (
    <div className="deck-mode" data-testid="deck-mode">
      <DeckRail deck={deck} selectedId={selectedId} onSelect={onSelect} />
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
