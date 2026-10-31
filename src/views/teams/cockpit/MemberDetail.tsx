import { useState } from "react";
import {
  IconAlertTriangle,
  IconCalendar,
  IconChevronRight,
  IconCircleCheck,
  IconCirclePlus,
  IconCircleX,
  IconClock,
  IconGitMerge,
  IconGitPullRequest,
  IconUserQuestion,
  type Icon,
} from "@tabler/icons-react";
import type {
  DashboardIssue,
  IssueFlags,
  Ref,
  RiskLevel,
  WorkloadEntry,
} from "../../../types/teams";
import {
  LEVEL_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  describeSignals,
  memberTickets,
  prBadge,
  statusBucket,
  type StatusBucket,
} from "./memberSignals";
import { STALLED_CHIP_STYLE, staleTone } from "./staleTone";

interface Props {
  member: WorkloadEntry;
  /** Every sprint issue; the panel picks the member's own. */
  issues: DashboardIssue[];
  onOpenRef?: (ref: Ref) => void;
}

/** Done tickets shown before the "Show N more" button. */
const DONE_PREVIEW = 3;

const SIGNAL_ICONS: Partial<Record<keyof IssueFlags, Icon>> = {
  prFailingCI: IconCircleX,
  prWaitingReview: IconClock,
  dueSoon: IconCalendar,
  unassigned: IconUserQuestion,
  inProgressNoPR: IconGitPullRequest,
  addedAfterStart: IconCirclePlus,
};

const LEVEL_TONES: Record<RiskLevel, string> = {
  high: "danger",
  attention: "warning",
  normal: "success",
};

function plural(n: number, word: string): string {
  return `${word}${n === 1 ? "" : "s"}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function ageLabel(days: number): string {
  return days === 0 ? "today" : `${days}d ago`;
}

function StatusSquare({ bucket }: { bucket: StatusBucket }) {
  return <span className="member-status-square" style={{ background: STATUS_COLORS[bucket] }} />;
}

/** The ticket's most telling PR; `full` adds its state in words. */
function PRChip({ issue, full }: { issue: DashboardIssue; full?: boolean }) {
  const pr = prBadge(issue);
  if (!pr) return null;
  const PRIcon = pr.tone === "purple" ? IconGitMerge : IconGitPullRequest;
  return (
    <span className={`member-pr member-tone--${pr.tone}`} title={`PR #${pr.number} ${pr.label}`}>
      <PRIcon size={13} />#{pr.number}
      {full && ` ${pr.label}`}
    </span>
  );
}

/**
 * One member on the People tab: their numbers, why they're flagged, then every
 * ticket they hold. Key it by member so the done fold resets between people.
 */
export function MemberDetail({ member, issues, onOpenRef }: Props) {
  const [showAllDone, setShowAllDone] = useState(false);
  const onOpen = (key: string) => onOpenRef?.({ kind: "issue", key });
  const now = new Date();
  const { atRisk, needsLook, groups } = memberTickets(issues, member.accountId);
  const total = groups.reduce((n, g) => n + g.issues.length, 0);

  const flagged = [
    { level: "high" as const, issues: atRisk },
    { level: "attention" as const, issues: needsLook },
  ].filter((s) => s.issues.length > 0);

  return (
    <div className="member-detail">
      <div className="member-detail__head">
        <span className="member-detail__avatar" aria-hidden>
          {initials(member.displayName)}
        </span>
        <div className="member-detail__who">
          <h2 className="member-detail__name">{member.displayName}</h2>
          <div className="member-detail__chips">
            <span className="member-detail__chip">
              <b>{member.ticketCount}</b> {plural(member.ticketCount, "ticket")}
            </span>
            <span className="member-detail__chip">
              <b>{member.wip}</b> in flight
            </span>
            <span
              className={`member-detail__chip${member.stalledCount > 0 ? " member-detail__chip--stalled" : ""}`}
              style={member.stalledCount > 0 ? STALLED_CHIP_STYLE : undefined}
            >
              <b>{member.stalledCount}</b> stalled
            </span>
            <span className="member-detail__chip">
              <b>{member.doneCount}</b> done
            </span>
            <span className="member-detail__chip">
              <b>{member.prOpen}</b> open {plural(member.prOpen, "PR")}
              {member.prReviewing > 0 && (
                <>
                  {" · "}
                  <b>{member.prReviewing}</b> waiting on reviewers
                </>
              )}
              {" · "}
              <b>{member.prMerged}</b> merged
            </span>
          </div>
        </div>
      </div>

      <div className="member-detail__body">
        {flagged.length === 0 ? (
          <div className="member-detail__clear">
            <IconCircleCheck size={14} />
            All clear: nothing needs a look.
          </div>
        ) : (
          flagged.map(({ level, issues: list }) => (
            <section key={level} aria-label={`${LEVEL_LABELS[level]} tickets`}>
              <div className="member-detail__section">
                <span className={`member-tone--${LEVEL_TONES[level]}`}>
                  <IconAlertTriangle size={13} />
                </span>
                {LEVEL_LABELS[level]}
                <span className="member-detail__count">{list.length}</span>
              </div>
              <div className="d-flex flex-column gap-2">
                {list.map((issue) => {
                  const bucket = statusBucket(issue);
                  return (
                    <button
                      key={issue.key}
                      type="button"
                      className="member-ticket"
                      onClick={() => onOpen(issue.key)}
                    >
                      <span className="member-ticket__body">
                        <span className="member-ticket__title">
                          <span className="member-ticket__key">{issue.key}</span>
                          <span>{issue.summary}</span>
                        </span>
                        <span className="member-ticket__meta">
                          <span className="member-status">
                            <StatusSquare bucket={bucket} />
                            {issue.status}
                          </span>
                          <span
                            style={
                              issue.flags.stale
                                ? { color: staleTone(issue.daysSinceUpdate) }
                                : undefined
                            }
                          >
                            updated {ageLabel(issue.daysSinceUpdate)}
                          </span>
                          <PRChip issue={issue} full />
                        </span>
                        <span className="member-ticket__signals">
                          {describeSignals(issue, now).map((s) => {
                            const SignalIcon = SIGNAL_ICONS[s.key] ?? IconAlertTriangle;
                            return (
                              <span key={s.key} className="member-signal">
                                <span className={`member-tone--${s.tone}`}>
                                  <SignalIcon size={14} />
                                </span>
                                <span>{s.text}</span>
                              </span>
                            );
                          })}
                        </span>
                      </span>
                      <IconChevronRight size={14} className="member-ticket__chev" />
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}

        <div className="member-detail__section">
          All tickets <span className="member-detail__count">{total}</span>
        </div>
        {total === 0 && <div className="text-muted small">No tickets in this sprint.</div>}
        {groups.map(({ bucket, issues: list }) => {
          const folded = bucket === "done" && !showAllDone && list.length > DONE_PREVIEW;
          const visible = folded ? list.slice(0, DONE_PREVIEW) : list;
          return (
            <section
              key={bucket}
              className="member-group"
              aria-label={`${STATUS_LABELS[bucket]} tickets`}
            >
              <div className="cockpit-group-head">
                <StatusSquare bucket={bucket} />
                {STATUS_LABELS[bucket]}
                <span className="member-detail__count">{list.length}</span>
              </div>
              <div className="member-rows">
                {visible.map((issue) => (
                  <button
                    key={issue.key}
                    type="button"
                    className="member-row"
                    onClick={() => onOpen(issue.key)}
                  >
                    <span className="member-ticket__key">{issue.key}</span>
                    <span className="member-row__title" title={issue.summary}>
                      {issue.summary}
                    </span>
                    <span className="member-row__meta">
                      {issue.risk.level !== "normal" && (
                        <span
                          className={`member-tone--${LEVEL_TONES[issue.risk.level]}`}
                          title={LEVEL_LABELS[issue.risk.level]}
                          aria-label={LEVEL_LABELS[issue.risk.level]}
                        >
                          <IconAlertTriangle size={13} />
                        </span>
                      )}
                      <PRChip issue={issue} />
                      <span className="member-row__age">{ageLabel(issue.daysSinceUpdate)}</span>
                    </span>
                  </button>
                ))}
                {folded && (
                  <button
                    type="button"
                    className="member-row member-row--more"
                    onClick={() => setShowAllDone(true)}
                  >
                    Show {list.length - DONE_PREVIEW} more
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
