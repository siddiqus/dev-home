import { useState } from "react";
import {
  IconAlertTriangle,
  IconCalendar,
  IconCircleCheck,
  IconCirclePlus,
  IconCircleX,
  IconClock,
  IconGitMerge,
  IconGitPullRequest,
  IconHourglass,
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
  prBadges,
  statusBucket,
  type StatusBucket,
} from "./memberSignals";
import { refLabel } from "./refLookup";
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
  stale: IconHourglass,
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

/**
 * One ticket: key and title, then its status line (Jira status, last update,
 * every PR with its state). A flagged ticket adds a callout: its level, then
 * each warning sign in words. Only the key (Jira drawer) and PRs (PR modal)
 * open anything; the rest is plain text.
 */
function TicketCard({
  issue,
  now,
  onOpenRef,
}: {
  issue: DashboardIssue;
  now: Date;
  onOpenRef?: (ref: Ref) => void;
}) {
  const level = issue.risk.level;
  const flagged = level !== "normal";
  return (
    <div className="member-ticket">
      <div className="member-ticket__top">
        <button
          type="button"
          className="member-link member-ticket__key"
          onClick={() => onOpenRef?.({ kind: "issue", key: issue.key })}
        >
          {issue.key}
        </button>
        <span className="member-ticket__title" title={issue.summary}>
          {issue.summary}
        </span>
      </div>
      <div className="member-ticket__meta">
        <span className="member-status">
          <StatusSquare bucket={statusBucket(issue)} />
          {issue.status}
        </span>
        <span style={issue.flags.stale ? { color: staleTone(issue.daysSinceUpdate) } : undefined}>
          updated {ageLabel(issue.daysSinceUpdate)}
        </span>
        {prBadges(issue).map((pr) => {
          const ref = { kind: "pr" as const, repo: pr.repo, number: pr.number };
          const PRIcon = pr.tone === "purple" ? IconGitMerge : IconGitPullRequest;
          return (
            <button
              key={`${pr.repo}#${pr.number}`}
              type="button"
              className={`member-link member-pr member-tone--${pr.tone}`}
              onClick={() => onOpenRef?.(ref)}
            >
              <PRIcon size={13} />
              {refLabel(ref)} {pr.label}
            </button>
          );
        })}
      </div>
      {flagged && (
        <div className={`member-callout member-callout--${LEVEL_TONES[level]}`}>
          <span className="member-callout__level">
            <IconAlertTriangle size={14} />
            {LEVEL_LABELS[level]}
          </span>
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
        </div>
      )}
    </div>
  );
}

/**
 * One member on the People tab: their numbers, then every ticket they hold,
 * each flagged one saying why. Key it by member so the done fold resets
 * between people.
 */
export function MemberDetail({ member, issues, onOpenRef }: Props) {
  const [showAllDone, setShowAllDone] = useState(false);
  const now = new Date();
  const { atRisk, needsLook, groups } = memberTickets(issues, member.accountId);
  const total = groups.reduce((n, g) => n + g.issues.length, 0);
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
        <div className="member-detail__section">
          All tickets <span className="member-detail__count">{total}</span>
          {total > 0 && (
            <span className="member-detail__summary">
              {atRisk > 0 && (
                <span className="member-tone--danger">
                  <IconAlertTriangle size={13} />
                  {atRisk} at risk
                </span>
              )}
              {needsLook > 0 && (
                <span className="member-tone--warning">
                  <IconAlertTriangle size={13} />
                  {needsLook} {needsLook === 1 ? "needs" : "need"} a look
                </span>
              )}
              {atRisk + needsLook === 0 && (
                <span className="member-tone--success">
                  <IconCircleCheck size={13} />
                  All clear
                </span>
              )}
            </span>
          )}
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
                  <TicketCard key={issue.key} issue={issue} now={now} onOpenRef={onOpenRef} />
                ))}
                {folded && (
                  <button
                    type="button"
                    className="member-more"
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
