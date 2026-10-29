import { Fragment, useEffect, useMemo, useState } from "react";
import Modal from "react-bootstrap/Modal";
import { SearchInput } from "../../../components/SearchInput";
import { SegmentedTabs } from "../../../components/SegmentedTabs";
import { ChecksStatusIcon } from "../../../components/ChecksStatusIcon";
import type { ReviewQueueEntry } from "../../../types/teams";
import { groupByState, isTeamPR, matchesSearch, prLabel, waitedFor } from "./reviewQueueModel";

type Scope = "all" | "ours" | "asked";

interface Props {
  show: boolean;
  onHide: () => void;
  entries: ReviewQueueEntry[];
  /** Lower-cased GitHub logins of the team. */
  teamLogins: Set<string>;
  onOpenPR?: (repoFullName: string, number: number) => void;
}

/** "→ @a, @b", or a nudge when nobody has been asked. */
function reviewersSuffix(e: ReviewQueueEntry): string {
  if (e.state === "needsReviewer") return " → nobody yet";
  return e.reviewers.length > 0 ? ` → ${e.reviewers.map((r) => `@${r}`).join(", ")}` : "";
}

/** Every PR in the review queue: searchable, split by whose PR it is, grouped by state. */
export function ReviewQueueModal({ show, onHide, entries, teamLogins, onOpenPR }: Props) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");

  // Start fresh each time it opens.
  useEffect(() => {
    if (!show) {
      setQuery("");
      setScope("all");
    }
  }, [show]);

  const oursCount = useMemo(
    () => entries.filter((e) => isTeamPR(e, teamLogins)).length,
    [entries, teamLogins],
  );

  const groups = useMemo(
    () =>
      groupByState(
        entries.filter(
          (e) =>
            (scope === "all" || (scope === "ours") === isTeamPR(e, teamLogins)) &&
            matchesSearch(e, query),
        ),
      ),
    [entries, teamLogins, scope, query],
  );

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable animation={false}>
      <Modal.Header closeButton>
        <Modal.Title as="h6" className="mb-0">
          Review Queue · {entries.length}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search PRs, people…"
            className="flex-fill"
            autoFocus
          />
          <SegmentedTabs
            className="inline-control"
            activeKey={scope}
            onChange={(k) => setScope(k as Scope)}
            tabs={[
              { key: "all", label: `All ${entries.length}` },
              { key: "ours", label: `Our PRs ${oursCount}` },
              { key: "asked", label: `Asked of us ${entries.length - oursCount}` },
            ]}
          />
        </div>

        {groups.length === 0 ? (
          <div className="text-muted small">No PRs match.</div>
        ) : (
          <div className="review-grid review-grid--modal">
            <div className="review-grid__head">
              <span>PR</span>
              <span>Title</span>
              <span>Author → reviewers</span>
              <span>CI</span>
              <span className="text-end">Waiting</span>
            </div>
            {groups.map((g) => (
              <Fragment key={g.state}>
                <div className="review-group" data-testid="review-group">
                  <span className="cockpit-dot" style={{ background: g.color }} />
                  {g.label}
                  <span className="text-muted fw-normal">{g.entries.length}</span>
                </div>
                {g.entries.map((e) => (
                  <button
                    key={`${e.repo_full_name}#${e.number}`}
                    type="button"
                    className="review-row"
                    title={e.reason}
                    onClick={() => {
                      onHide();
                      onOpenPR?.(e.repo_full_name, e.number);
                    }}
                  >
                    <span className="review-row__key">{prLabel(e)}</span>
                    <span className="review-row__title-cell">
                      <span className="review-row__title">{e.title}</span>
                      {scope === "all" && !isTeamPR(e, teamLogins) && (
                        <span className="review-tag">asked of us</span>
                      )}
                    </span>
                    <span className="review-row__muted review-row__people">
                      <b>@{e.author}</b>
                      {reviewersSuffix(e)}
                    </span>
                    <span className="review-row__ci">
                      <ChecksStatusIcon status={e.checks_status} />
                    </span>
                    <span className="review-row__muted text-end">{waitedFor(e.waitingSince)}</span>
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
}
