import type { MouseEvent } from "react";
import type { GitHubPR, Note } from "../../types";
import { Badge } from "../../components/primitives/Badge";
import { PRLinkIcons } from "./CompactRow";
import { compactAge } from "./dates";
import { repoRef, titleWithoutKey } from "./prState";
import { DeckNoteLine, DeckQuote } from "./DeckContext";
import { blurOnPointer } from "./pointer";
import { visibleChips } from "./signals";
import type { DeckPR } from "./deckTypes";

export interface DeckPRRowProps {
  /** DOM id, referenced by the PR list's `aria-activedescendant`. */
  id: string;
  item: DeckPR;
  ticketKey: string | null;
  selected: boolean;
  now: Date;
  onSelect(url: string): void;
  onOpen(pr: GitHubPR): void;
  onOpenNote?(note: Note): void;
}

/**
 * One PR on the card (spec §5.4): current marker; a muted meta line with
 * repo#number, copy-link / open-on-GitHub icons · author · updated age and
 * the unseen dot; the title without the
 * key; up to four signal chips with "+N"; the newest unseen comment and my
 * newest unresolved note.
 */
export function DeckPRRow({
  id,
  item,
  ticketKey,
  selected,
  now,
  onSelect,
  onOpen,
  onOpenNote,
}: DeckPRRowProps) {
  const { pr } = item;
  const { shown, more } = visibleChips(item.signals);
  // v1's repoRef ("dev-home#1203"), split so the repo part can be muted and truncated.
  const ref = repoRef(pr);
  const repo = ref.slice(0, ref.lastIndexOf("#"));
  const age = compactAge(pr.updated_at, now);
  const onClick = (e: MouseEvent) => {
    blurOnPointer(e);
    onSelect(pr.html_url);
    onOpen(pr);
  };
  const classes = ["deck-pr", item.current && "deck-pr--current", selected && "deck-pr--selected"]
    .filter(Boolean)
    .join(" ");
  return (
    <div id={id} role="option" aria-selected={selected} className={classes} onClick={onClick}>
      <span className="deck-pr-marker">{item.current ? "▶" : ""}</span>
      <div className="deck-pr-main">
        <div className="deck-pr-meta">
          <span className="deck-pr-ref" title={ref}>
            <span className="deck-pr-repo">{repo}</span>
            <span className="deck-pr-number">#{pr.number}</span>
          </span>
          <span className="deck-pr-links">
            <PRLinkIcons pr={pr} />
          </span>
          <span aria-hidden="true">·</span>
          <span className="deck-pr-author">{pr.user.login}</span>
          <span aria-hidden="true">·</span>
          <span
            className="deck-pr-age"
            title={`Updated ${new Date(pr.updated_at).toLocaleString()}`}
          >
            {age === "now" ? "just now" : `${age} ago`}
          </span>
          {item.unseen && <span className="deck-dot" role="img" aria-label="new activity" />}
        </div>
        <div className="deck-pr-title">{titleWithoutKey(pr.title, ticketKey)}</div>
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
        {item.unseenComment && <DeckQuote item={item.unseenComment} now={now} />}
        {item.note && <DeckNoteLine note={item.note} onOpen={onOpenNote} />}
      </div>
    </div>
  );
}
