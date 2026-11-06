import { useState } from "react";
import {
  IconAlertTriangle,
  IconCalendar,
  IconCirclePlus,
  IconCircleX,
  IconClock,
  IconGitMerge,
  IconGitPullRequest,
  IconGitPullRequestClosed,
  IconHourglass,
  IconUserQuestion,
  type Icon,
} from "@tabler/icons-react";
import { DiffStat } from "../../../components/prIndicators";
import type {
  AuthoredPR,
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
  /** Every PR the team opened or merged in the sprint; the panel picks the member's own. */
  prs: AuthoredPR[];
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

/** "Jun 27", or "" when there's no date. */
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatusSquare({ bucket }: { bucket: StatusBucket }) {
  return <span className="member-status-square" style={{ background: STATUS_COLORS[bucket] }} />;
}

/**
 * One ticket: key, with its Jira status on the right; the title; then time in
 * progress, last update, and every PR with its state. A flagged ticket
 * adds a callout: its level, then each warning sign in words. Only the key
 * (Jira drawer) and PRs (PR modal) open anything; the rest is plain text.
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
        <span className="member-ticket__aside">
          <span className="member-status">
            <StatusSquare bucket={statusBucket(issue)} />
            {issue.status}
          </span>
        </span>
      </div>
      <div className="member-ticket__title" title={issue.summary}>
        {issue.summary}
      </div>
      <div className="member-ticket__meta">
        {issue.daysInProgress != null && (
          <span>in progress {issue.daysInProgress === 0 ? "<1d" : `${issue.daysInProgress}d`}</span>
        )}
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

const PR_STATES: Record<string, { tone: string; icon: Icon }> = {
  open: { tone: "neutral", icon: IconGitPullRequest },
  merged: { tone: "purple", icon: IconGitMerge },
  closed: { tone: "neutral", icon: IconGitPullRequestClosed },
};

/**
 * One PR: its state as an icon, the link, and lines changed on the right; the
 * title; then when it was opened and merged (and by whom). Only the link
 * opens anything.
 */
function MemberPRCard({ pr, onOpenRef }: { pr: AuthoredPR; onOpenRef?: (ref: Ref) => void }) {
  const ref = { kind: "pr" as const, repo: pr.repo_full_name, number: pr.number };
  const { tone, icon: StateIcon } = PR_STATES[pr.state] ?? PR_STATES.open!;
  const opened = shortDate(pr.createdAt);
  const merged = shortDate(pr.mergedAt);
  return (
    <div className="member-ticket">
      <div className="member-ticket__top">
        <span
          className={`member-ticket__state member-tone--${tone}`}
          role="img"
          aria-label={pr.state}
          title={pr.state}
        >
          <StateIcon size={14} />
        </span>
        <button
          type="button"
          className="member-link member-ticket__key"
          onClick={() => onOpenRef?.(ref)}
        >
          {refLabel(ref)}
        </button>
        <span className="member-ticket__aside">
          <DiffStat pr={pr} />
        </span>
      </div>
      <div className="member-ticket__title" title={pr.title}>
        {pr.title}
      </div>
      {(opened || merged) && (
        <div className="member-ticket__meta">
          {opened && <span>opened {opened}</span>}
          {merged && (
            <span>
              merged {merged}
              {pr.mergedBy && ` by ${pr.mergedBy}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Newest first. */
function byOpenedDesc(a: AuthoredPR, b: AuthoredPR): number {
  return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}

/**
 * One member on the People tab: their numbers, then every ticket they hold,
 * each flagged one saying why. Key it by member so the done fold resets
 * between people.
 */
export function MemberDetail({ member, issues, prs, onOpenRef }: Props) {
  const [showAllDone, setShowAllDone] = useState(false);
  const now = new Date();
  const { groups } = memberTickets(issues, member.accountId);
  const total = groups.reduce((n, g) => n + g.issues.length, 0);
  const login = member.githubUsername.toLowerCase();
  const memberPRs = login
    ? prs.filter((p) => p.author.toLowerCase() === login).sort(byOpenedDesc)
    : [];
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

      {/* Tickets and PRs side by side, each list scrolling under its header;
          on a narrow pane they stack and scroll with the pane. */}
      <div className="member-detail__body">
        <div className="member-detail__col">
          <div className="member-detail__section">
            All tickets <span className="member-detail__count">{total}</span>
          </div>
          <div className="member-detail__list">
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

        <div className="member-detail__col">
          <div className="member-detail__section">
            All PRs <span className="member-detail__count">{memberPRs.length}</span>
          </div>
          <div className="member-detail__list">
            {memberPRs.length === 0 ? (
              <div className="text-muted small">No PRs in this sprint.</div>
            ) : (
              <section className="member-rows" aria-label="PRs">
                {memberPRs.map((pr) => (
                  <MemberPRCard
                    key={`${pr.repo_full_name}#${pr.number}`}
                    pr={pr}
                    onOpenRef={onOpenRef}
                  />
                ))}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
