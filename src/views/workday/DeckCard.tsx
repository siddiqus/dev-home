import type { GitHubPR, Note } from "../../types";
import { Badge } from "../../components/primitives/Badge";
import { OffSprintPill, TicketKey } from "./CompactRow";
import { compactAge } from "./dates";
import { repoRef } from "./prState";
import { DeckNoteLine, DeckQuote, jiraCommentUrl } from "./DeckContext";
import { DeckNoteComposer } from "./DeckNoteComposer";
import { DeckPRRow } from "./DeckPRRow";
import type { DeckTicket } from "./deckTypes";

export interface DeckCardProps {
  ticket: DeckTicket;
  selectedPrUrl: string | null;
  onSelectPr(url: string): void;
  onOpen(pr: GitHubPR): void;
  jiraBaseUrl: string;
  now: Date;
  onOpenNote?(note: Note): void;
  /** The `.` composer is open under the selected PR (or the "No PR yet" line). */
  composing?: boolean;
  onSaveNote?(text: string): Promise<void>;
  onCancelNote?(): void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const prRowId = (index: number) => `deck-pr-${index}`;

/** The ticket card (spec §5.4): header, sub-line and PR rows as a listbox. */
export function DeckCard({
  ticket,
  selectedPrUrl,
  onSelectPr,
  onOpen,
  jiraBaseUrl,
  now,
  onOpenNote,
  composing = false,
  onSaveNote,
  onCancelNote,
}: DeckCardProps) {
  const { key, prs } = ticket;
  const label = key ? `${key} ${ticket.title}` : ticket.title;
  const newest = prs.reduce<string | null>(
    (best, p) => (!best || p.pr.updated_at > best ? p.pr.updated_at : best),
    null,
  );
  const currentCount = prs.filter((p) => p.current).length;
  const activeIndex = prs.findIndex((p) => p.pr.html_url === selectedPrUrl);
  const activePR = activeIndex === -1 ? null : prs[activeIndex].pr;
  const composer =
    composing && onSaveNote ? (
      <DeckNoteComposer
        target={activePR ? repoRef(activePR) : undefined}
        onSave={onSaveNote}
        onCancel={() => onCancelNote?.()}
      />
    ) : null;

  return (
    <section className="deck-card" role="region" aria-label={label}>
      <div className="deck-card-header">
        <div className="deck-card-titleline">
          {key && (
            <span className="deck-card-key">
              <TicketKey ticketKey={key} jiraBaseUrl={jiraBaseUrl} />
            </span>
          )}
          <h3 className="deck-card-title">{ticket.title}</h3>
          <span className="deck-card-pills">
            {ticket.ticket?.offSprint && <OffSprintPill />}
            {ticket.ticket?.statusName && (
              <Badge variant="neutral">{ticket.ticket.statusName}</Badge>
            )}
          </span>
        </div>
        {prs.length > 0 && newest && (
          <div className="deck-card-sub">
            {`${plural(prs.length, "PR")} · ${currentCount} current · updated ${compactAge(newest, now)}`}
          </div>
        )}
        {ticket.jiraMention && key && (
          <DeckQuote
            item={ticket.jiraMention}
            now={now}
            href={ticket.jiraMention.url || jiraCommentUrl(jiraBaseUrl, key, ticket.jiraMention.id)}
          />
        )}
      </div>
      <div className="deck-card-body">
        {prs.length === 0 ? (
          <>
            <div className="deck-card-empty">No PR yet</div>
            {ticket.note && <DeckNoteLine note={ticket.note} onOpen={onOpenNote} />}
            {composer}
          </>
        ) : (
          <>
            <div
              className="deck-pr-list"
              role="listbox"
              aria-label="Pull requests"
              aria-activedescendant={activeIndex === -1 ? undefined : prRowId(activeIndex)}
              tabIndex={0}
            >
              {prs.map((p, i) => (
                <DeckPRRow
                  key={p.pr.html_url}
                  id={prRowId(i)}
                  item={p}
                  ticketKey={key}
                  selected={i === activeIndex}
                  onSelect={onSelectPr}
                  onOpen={onOpen}
                  onOpenNote={onOpenNote}
                  now={now}
                />
              ))}
            </div>
            {/* Outside the listbox (only options belong in it), right under the
              list, naming the PR it's for. */}
            {composer}
          </>
        )}
      </div>
    </section>
  );
}
