import { Fragment, useMemo, useState } from "react";
import type { ReviewQueueEntry } from "../../../types/teams";
import { ReviewQueueModal } from "./ReviewQueueModal";
import { groupByState, prLabel, waitedFor } from "./reviewQueueModel";

export interface ReviewQueueMember {
  login: string;
  name: string;
}

interface Props {
  entries: ReviewQueueEntry[];
  /** Team roster; tells the team's own PRs apart from reviews asked of it. */
  members?: ReviewQueueMember[];
  onOpenPR?: (repoFullName: string, number: number) => void;
}

/** PRs shown per group on the card; the rest are a click away in See all. */
const PER_GROUP = 2;

/** Who has to act: the reviewers when it's their move, the author otherwise. */
function whoActs(e: ReviewQueueEntry): string {
  if (e.state === "waitingReview" && e.reviewers.length > 0) {
    const [first, ...rest] = e.reviewers;
    return `on @${first}${rest.length > 0 ? ` +${rest.length}` : ""}`;
  }
  return `@${e.author}`;
}

export function ReviewQueuePanel({ entries, members, onOpenPR }: Props) {
  const [showAll, setShowAll] = useState(false);

  const teamLogins = useMemo(
    () => new Set((members ?? []).map((m) => m.login.toLowerCase())),
    [members],
  );
  // Drafts aren't waiting on anyone yet; they only show in See all.
  const groups = useMemo(() => groupByState(entries.filter((e) => e.state !== "draft")), [entries]);

  return (
    <div className="border rounded p-3">
      <div className="h6 mb-3 d-flex align-items-center gap-2">
        Review Queue
        <span className="text-muted fw-normal small">{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <div className="text-muted small">No open PRs.</div>
      ) : (
        <>
          {groups.length === 0 ? (
            <div className="text-muted small">Only drafts are open.</div>
          ) : (
            <div className="review-grid review-grid--card">
              {groups.map((g) => (
                <Fragment key={g.state}>
                  <div className="review-group" data-testid="review-group">
                    <span className="cockpit-dot" style={{ background: g.color }} />
                    {g.label}
                    <span className="text-muted fw-normal">{g.entries.length}</span>
                  </div>
                  {g.entries.slice(0, PER_GROUP).map((e) => (
                    <button
                      key={`${e.repo_full_name}#${e.number}`}
                      type="button"
                      className="review-row"
                      title={e.reason}
                      onClick={() => onOpenPR?.(e.repo_full_name, e.number)}
                    >
                      <span className="review-row__key">{prLabel(e)}</span>
                      <span className="review-row__title">{e.title}</span>
                      <span className="review-row__muted">{whoActs(e)}</span>
                      <span className="review-row__muted text-end">
                        {waitedFor(e.waitingSince)}
                      </span>
                    </button>
                  ))}
                </Fragment>
              ))}
            </div>
          )}
          <button type="button" className="cockpit-more mt-2" onClick={() => setShowAll(true)}>
            See all {entries.length} →
          </button>
        </>
      )}

      <ReviewQueueModal
        show={showAll}
        onHide={() => setShowAll(false)}
        entries={entries}
        teamLogins={teamLogins}
        onOpenPR={onOpenPR}
      />
    </div>
  );
}
