import { Fragment, useContext, type MouseEvent } from "react";
import type { GitHubPR, Note } from "../../types";
import { Badge } from "../../components/primitives/Badge";
import { CommentCountChip, useCommentCounts } from "../../components/CommentCountChip";
import { MergeButton } from "../../components/MergeButton";
import { Participants } from "../../components/prIndicators";
import { PRLinkIcons, ViewerLoginContext } from "./CompactRow";
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
  /** Show the author even when it's me (PR search lists anyone's PRs). */
  alwaysShowAuthor?: boolean;
}

/**
 * One PR on the card (spec §5.4): a muted meta line with repo#number,
 * copy-link / open-on-GitHub icons · author (unless it's me) · reviewers /
 * commenters (approvers, once merged), and a "current" label, the updated age
 * and the unseen dot on the right; the title without the key; up to four
 * signal chips with "+N", then the comment count (never folded into "+N",
 * since unread feedback is a reason to act); the newest unseen comment and my
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
  alwaysShowAuthor = false,
}: DeckPRRowProps) {
  const { pr } = item;
  const me = useContext(ViewerLoginContext);
  const showAuthor = alwaysShowAuthor || !me || pr.user.login.toLowerCase() !== me.toLowerCase();
  const { shown, more } = visibleChips(item.signals);
  // Null without comments or comment data (merged PRs), so no chip and no chip-only row.
  const comments = useCommentCounts(pr);
  // Merged PRs carry approvers instead (the merged query skips full reviews).
  const participants =
    pr.participants ?? pr.approved_by?.map((login) => ({ login, state: "APPROVED" as const }));
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
      <div className="deck-pr-main">
        <div className="deck-pr-meta">
          <span className="deck-pr-ref" title={ref}>
            <span className="deck-pr-repo">{repo}</span>
            <span className="deck-pr-number">#{pr.number}</span>
          </span>
          <span className="deck-pr-links">
            <PRLinkIcons pr={pr} />
          </span>
          {showAuthor && (
            <>
              <span aria-hidden="true">·</span>
              <span className="deck-pr-author">{pr.user.login}</span>
            </>
          )}
          {participants && participants.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <Participants pr={{ ...pr, participants }} />
            </>
          )}
          <span className="deck-pr-when">
            {item.current && <span className="deck-pr-current">▶ current</span>}
            <span
              className="deck-pr-age"
              title={`Updated ${new Date(pr.updated_at).toLocaleString()}`}
            >
              {age === "now" ? "just now" : `${age} ago`}
            </span>
            {item.unseen && <span className="deck-dot" role="img" aria-label="new activity" />}
          </span>
        </div>
        <div className="deck-pr-title">{titleWithoutKey(pr.title, ticketKey)}</div>
        {(item.signals.length > 0 || comments) && (
          <div className="deck-pr-signals">
            {shown.map((s, i) => {
              const chip = s.href ? (
                // Opens GitHub in a new tab, not the PR modal the row opens.
                <a
                  className="deck-chip-link"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.detail ?? "Open on GitHub"}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Badge variant={s.tone}>{s.label}</Badge>
                </a>
              ) : (
                <Badge variant={s.tone} title={s.detail}>
                  {s.label}
                </Badge>
              );
              // My PR's first chip is its next step; "Ready to merge" becomes the Merge button.
              return i === 0 ? (
                <MergeButton key={s.label} pr={pr} fallback={chip} />
              ) : (
                <Fragment key={s.label}>{chip}</Fragment>
              );
            })}
            {more.length > 0 && (
              <Badge variant="neutral" title={more.map((s) => s.label).join(", ")}>
                +{more.length}
              </Badge>
            )}
            <CommentCountChip counts={comments} />
          </div>
        )}
        {item.unseenComment && <DeckQuote item={item.unseenComment} now={now} />}
        {item.note && <DeckNoteLine note={item.note} onOpen={onOpenNote} />}
      </div>
    </div>
  );
}
