import Button from "react-bootstrap/Button";
import type { GitHubPR, Note } from "../../types";
import { Badge } from "../../components/primitives/Badge";
import { OffSprintPill, TicketKey } from "./CompactRow";
import { compactAge } from "./dates";
import { noteText } from "../../utils/noteTags";
import { normalizeNoteRef, prNoteKey } from "../../utils/prNotes";
import { jiraBrowseUrl } from "../../utils/tickets";
import { getReferenceUrl } from "../../utils/text";
import { repoRef } from "./prState";
import { DeckNoteLine, DeckQuote, jiraCommentUrl } from "./DeckContext";
import { DeckNoteComposer } from "./DeckNoteComposer";
import { DeckPRRow } from "./DeckPRRow";
import type { DeckTicket } from "./deckTypes";
import { IconExternalLink } from "@tabler/icons-react";

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
  /** Resolve on a note tab's card. */
  onResolveNote?(note: Note): void;
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
  onResolveNote,
}: DeckCardProps) {
  if (ticket.noteItem) {
    return (
      <DeckNoteCard
        ticket={ticket}
        note={ticket.noteItem}
        jiraBaseUrl={jiraBaseUrl}
        now={now}
        onOpenNote={onOpenNote}
        onResolveNote={onResolveNote}
      />
    );
  }
  const { key, prs } = ticket;
  const label = key ? `${key} ${ticket.title}` : ticket.title;
  const newest = prs.reduce<string | null>(
    (best, p) => (!best || p.pr.updated_at > best ? p.pr.updated_at : best),
    null,
  );
  const jiraHref = key && jiraBaseUrl ? jiraBrowseUrl(jiraBaseUrl, key) : null;
  const currentCount = prs.filter((p) => p.current).length;
  const mergedCount = prs.filter((p) => p.pr.merged_at).length;
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
        {/* Key line above the title, so every header row starts at one left edge. */}
        {key && (
          <div className="deck-card-keyline">
            <TicketKey ticketKey={key} jiraBaseUrl={jiraBaseUrl} showOpen={false} />
            {jiraHref && (
              <a
                className="deck-link font-sm"
                href={jiraHref}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${key} in Jira`}
              >
                Open in Jira <IconExternalLink size={13} stroke={1.8} aria-hidden="true" />
              </a>
            )}
            {ticket.ticket?.statusName && (
              <Badge variant="neutral">{ticket.ticket.statusName}</Badge>
            )}
            {ticket.ticket?.offSprint && <OffSprintPill />}
          </div>
        )}
        <h3 className="deck-card-title">{ticket.title}</h3>
        {(newest || jiraHref) && (
          <div className="deck-card-sub">
            {newest && (
              <span>
                {[
                  plural(prs.length, "PR"),
                  mergedCount > 0 && `${mergedCount} merged`,
                  currentCount > 0 && `${currentCount} current`,
                  `updated ${compactAge(newest, now)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
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
        {ticket.todos.length > 0 && (
          <div className="deck-todos" role="group" aria-label="#todo notes">
            <div className="deck-todos-label" aria-hidden="true">
              #todo
            </div>
            {ticket.todos.map((n) => (
              <DeckNoteLine
                key={n.id}
                note={n}
                onOpen={onOpenNote}
                detail={[todoPR(n, ticket), compactAge(n.created_at, now)]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </div>
        )}
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
            {/* A ticket whose PRs have all merged keeps its ticket note. */}
            {ticket.note && <DeckNoteLine note={ticket.note} onOpen={onOpenNote} />}
            {/* Outside the listbox (only options belong in it), right under the
              list, naming the PR it's for. */}
            {composer}
          </>
        )}
      </div>
    </section>
  );
}

/** The PR a #todo note is on, as "repo#12", when the ticket has more than one PR. */
function todoPR(note: Note, ticket: DeckTicket): string | null {
  if (ticket.prs.length < 2) return null;
  const ref = normalizeNoteRef(note.reference_id);
  const p = ref ? ticket.prs.find((x) => prNoteKey(x.pr) === ref) : undefined;
  return p ? repoRef(p.pr) : null;
}

/** A note tab's card: the note's headline, what it points at (linked), its text, and edit / resolve. */
function DeckNoteCard({
  ticket,
  note,
  jiraBaseUrl,
  now,
  onOpenNote,
  onResolveNote,
}: {
  ticket: DeckTicket;
  note: Note;
  jiraBaseUrl: string;
  now: Date;
  onOpenNote?(note: Note): void;
  onResolveNote?(note: Note): void;
}) {
  const body = noteText(note.content).trim();
  const href = getReferenceUrl(note, jiraBaseUrl);
  return (
    <section className="deck-card deck-card--note" role="region" aria-label={ticket.title}>
      <div className="deck-card-header">
        <div className="deck-card-titleline">
          <span className="deck-card-key" aria-hidden="true">
            📝
          </span>
          <h3 className="deck-card-title">{ticket.title}</h3>
        </div>
        <div className="deck-card-sub">
          {href ? (
            <a
              className="deck-link"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${href}`}
            >
              {ticket.status} <IconExternalLink size={13} stroke={1.8} aria-hidden="true" />
            </a>
          ) : (
            ticket.status
          )}
          {` · #todo · ${compactAge(note.created_at, now)}`}
        </div>
      </div>
      <div className="deck-card-body">
        {body && <div className="deck-note-body">{body}</div>}
        <div className="deck-note-actions">
          {onOpenNote && (
            <Button variant="outline-primary" size="sm" onClick={() => onOpenNote(note)}>
              Edit <kbd>⏎</kbd>
            </Button>
          )}
          {onResolveNote && (
            <Button variant="outline-secondary" size="sm" onClick={() => onResolveNote(note)}>
              Resolve
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
