import type { ReactNode } from "react";
import {
  IconAlertTriangle,
  IconCalendar,
  IconCirclePlus,
  IconCircleX,
  IconClock,
  IconGitPullRequest,
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
  WorkloadEntry,
} from "../../../types/teams";
import {
  LEVEL_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  describeSignals,
  memberWork,
  statusBucket,
  type PRLine,
  type StatusBucket,
  type TicketItem,
} from "./memberSignals";
import { titleWithoutKey } from "../../workday/prState";
import { refLabel } from "./refLookup";
import { STALLED_CHIP_STYLE } from "./staleTone";

interface Props {
  member: WorkloadEntry;
  /** Every sprint issue; the panel picks the member's own. */
  issues: DashboardIssue[];
  /** Every PR the team opened or merged in the sprint; the panel picks the member's own. */
  prs: AuthoredPR[];
  onOpenRef?: (ref: Ref) => void;
}

type OpenRef = ((ref: Ref) => void) | undefined;

const SIGNAL_ICONS: Partial<Record<keyof IssueFlags, Icon>> = {
  prFailingCI: IconCircleX,
  stale: IconHourglass,
  prWaitingReview: IconClock,
  dueSoon: IconCalendar,
  unassigned: IconUserQuestion,
  inProgressNoPR: IconGitPullRequest,
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

function monthDay(d: Date): string {
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Jun 27" for an ISO timestamp, or "" when there's none. */
function shortDate(iso: string | null): string {
  return iso ? monthDay(new Date(iso)) : "";
}

/** A Jira due date ("YYYY-MM-DD") read as a local calendar day, so it doesn't shift a day west of UTC. */
function dueDate(due: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(due);
  return monthDay(m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(due));
}

function StatusSquare({ bucket }: { bucket: StatusBucket }) {
  return <span className="member-status-square" style={{ background: STATUS_COLORS[bucket] }} />;
}

/**
 * One PR line: the repo#number link, its title (with its author when it isn't
 * the member, and the teammate's ticket it's for), lines changed, then its state
 * and date on the right: "merged Jun 27 by nadman", "failing CI · opened Jun 30".
 */
function PRRow({
  pr,
  me,
  ticketKey,
  forKey,
  onOpenRef,
}: {
  pr: PRLine;
  /** The member's GitHub login, lowercased. */
  me: string;
  /** The ticket the PR sits under: a leading "KEY:" in its title would repeat it. */
  ticketKey?: string;
  forKey?: string | null;
  onOpenRef: OpenRef;
}) {
  const ref = { kind: "pr" as const, repo: pr.repo, number: pr.number };
  const date = shortDate(pr.date);
  const author = pr.author.toLowerCase() === me ? null : pr.author;
  return (
    <div className="member-pr">
      <span className="member-pr__ref">
        <button type="button" className="member-link" onClick={() => onOpenRef?.(ref)}>
          {refLabel(ref)}
        </button>
      </span>
      <span className="member-pr__title" title={pr.title}>
        {titleWithoutKey(pr.title, ticketKey ?? forKey ?? null)}
        {author && <span className="member-pr__muted"> by {author}</span>}
        {forKey && (
          <>
            <span className="member-pr__muted"> for </span>
            <button
              type="button"
              className="member-link member-pr__for"
              onClick={() => onOpenRef?.({ kind: "issue", key: forKey })}
            >
              {forKey}
            </button>
          </>
        )}
      </span>
      <span className="member-pr__diff">
        <DiffStat pr={pr} />
      </span>
      <span className="member-pr__state">
        <span className={`member-tone--${pr.tone}`}>{pr.label}</span>
        {date && (
          <span className="member-pr__when">
            {pr.merged ? `${date}${pr.mergedBy ? ` by ${pr.mergedBy}` : ""}` : `· opened ${date}`}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * One ticket: key, title and Jira status on one line; then why it's flagged
 * (tinted by its group), its timing and labels; then its PRs on a tree line.
 * Only the key and PR links open anything.
 */
function TicketCard({
  item: { issue, prs },
  tone,
  me,
  now,
  onOpenRef,
}: {
  item: TicketItem;
  /** Set for flagged tickets: the tint of their reasons. */
  tone?: "danger" | "warning";
  me: string;
  now: Date;
  onOpenRef: OpenRef;
}) {
  const signals = tone ? describeSignals(issue, now) : [];
  // Leave out timing a reason already gives ("No update for 4 days", "Due tomorrow").
  const says = (key: keyof IssueFlags) => signals.some((s) => s.key === key);
  return (
    <div className="member-card">
      {/* Key and title as one cell, so the title follows the key instead of
          starting at the PR titles' column. */}
      <span className="member-card__head">
        <button
          type="button"
          className="member-link member-card__key"
          onClick={() => onOpenRef?.({ kind: "issue", key: issue.key })}
        >
          {issue.key}
        </button>
        <span className="member-card__title" title={issue.summary}>
          {issue.summary}
        </span>
      </span>
      <span className="member-card__status">
        <StatusSquare bucket={statusBucket(issue)} />
        {issue.status}
      </span>
      <div className="member-card__details">
        {signals.length > 0 && (
          <span className={`member-why member-why--${tone}`}>
            {signals.map((s) => {
              const SignalIcon = SIGNAL_ICONS[s.key] ?? IconAlertTriangle;
              return (
                <span key={s.key} className="member-signal">
                  <span className={`member-tone--${s.tone}`}>
                    <SignalIcon size={14} />
                  </span>
                  {s.text}
                </span>
              );
            })}
          </span>
        )}
        {issue.daysInProgress != null && (
          <span>in progress {issue.daysInProgress === 0 ? "<1d" : `${issue.daysInProgress}d`}</span>
        )}
        {!says("stale") && <span>updated {ageLabel(issue.daysSinceUpdate)}</span>}
        {issue.dueDate && !says("dueSoon") && <span>due {dueDate(issue.dueDate)}</span>}
        {issue.flags.addedAfterStart && (
          <span className="member-label">
            <IconCirclePlus size={12} />
            added mid-sprint
          </span>
        )}
      </div>
      {prs.length > 0 && (
        <div className="member-prs">
          {prs.map((pr) => (
            <PRRow
              key={`${pr.repo}#${pr.number}`}
              pr={pr}
              me={me}
              ticketKey={issue.key}
              onOpenRef={onOpenRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkGroup({
  label,
  region,
  icon,
  count,
  children,
}: {
  label: string;
  region: string;
  icon: ReactNode;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="member-group" aria-label={region}>
      <div className="cockpit-group-head">
        {icon}
        {label}
        <span className="member-detail__count">{count}</span>
      </div>
      <div className="member-rows">{children}</div>
    </section>
  );
}

const FLAGGED = [
  { level: "high", tone: "danger" },
  { level: "attention", tone: "warning" },
] as const;

/**
 * One member on the People tab: their numbers, then one list of everything
 * they have in the sprint. Flagged tickets come first whatever their status,
 * then the rest by status, each ticket with its PRs under it, then the PRs
 * they wrote that sit on no ticket of theirs. Nothing is folded away.
 */
export function MemberDetail({ member, issues, prs, onOpenRef }: Props) {
  const now = new Date();
  const me = member.githubUsername.toLowerCase();
  const work = memberWork(issues, prs, member.accountId, member.githubUsername);
  const flagged = { high: work.atRisk, attention: work.needsLook };
  const empty =
    work.atRisk.length + work.needsLook.length + work.groups.length + work.otherPRs.length === 0;
  const cards = (items: TicketItem[], tone?: "danger" | "warning") =>
    items.map((item) => (
      <TicketCard
        key={item.issue.key}
        item={item}
        tone={tone}
        me={me}
        now={now}
        onOpenRef={onOpenRef}
      />
    ));

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

      <div className="member-detail__list">
        {empty ? (
          <div className="text-muted small">No tickets or PRs in this sprint.</div>
        ) : (
          <div className="member-work">
            {FLAGGED.map(
              ({ level, tone }) =>
                flagged[level].length > 0 && (
                  <WorkGroup
                    key={level}
                    label={LEVEL_LABELS[level]}
                    region={`${LEVEL_LABELS[level]} tickets`}
                    icon={
                      <span className={`member-tone--${tone}`}>
                        <IconAlertTriangle size={13} />
                      </span>
                    }
                    count={flagged[level].length}
                  >
                    {cards(flagged[level], tone)}
                  </WorkGroup>
                ),
            )}
            {work.groups.map(({ bucket, items }) => (
              <WorkGroup
                key={bucket}
                label={STATUS_LABELS[bucket]}
                region={`${STATUS_LABELS[bucket]} tickets`}
                icon={<StatusSquare bucket={bucket} />}
                count={items.length}
              >
                {cards(items)}
              </WorkGroup>
            ))}
            {work.otherPRs.length > 0 && (
              <WorkGroup
                label="Other PRs"
                region="Other PRs"
                icon={
                  <span className="member-tone--neutral">
                    <IconGitPullRequest size={13} />
                  </span>
                }
                count={work.otherPRs.length}
              >
                <div className="member-card">
                  <div className="member-prs member-prs--flat">
                    {work.otherPRs.map(({ pr, forKey }) => (
                      <PRRow
                        key={`${pr.repo}#${pr.number}`}
                        pr={pr}
                        me={me}
                        forKey={forKey}
                        onOpenRef={onOpenRef}
                      />
                    ))}
                  </div>
                </div>
              </WorkGroup>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
