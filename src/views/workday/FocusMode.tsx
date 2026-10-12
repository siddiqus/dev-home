import React, { useContext, useState } from "react";
import { IconAt, IconClock, IconTarget } from "@tabler/icons-react";
import type { GitHubPR } from "../../types";
import type { StateBadge } from "./prState";
import { useOptionalJiraDrawer } from "../../context/JiraDrawerContext";
import { ItemFilteringContext, WorkdaySection } from "./WorkdaySection";
import { NeedsYouStrip } from "./NeedsYouStrip";
import {
  CountDots,
  countLabel,
  GroupedRows,
  LineSub,
  RowIcon,
  TicketGroupLine,
  TicketKey,
  WorkdayItemRow,
  WorkdaySubhead,
  WorkTicketRow,
} from "./CompactRow";
import { groupByTicketKey } from "./buildWorkday";
import { compactAge } from "./dates";
import { titleWithoutKey } from "./prState";
import type { FocusData, WaitingOnAuthor } from "./types";

type SectionToggle = (id: string) => { collapsed: boolean; onToggle: () => void };

interface FocusModeProps {
  focus: FocusData;
  /** Open PRs / review requests still loading. */
  loading: boolean;
  mentionsLoading: boolean;
  jiraBaseUrl: string;
  /** Ticket key → summary, for group headers. */
  ticketTitles: Map<string, string>;
  now: Date;
  sectionToggle: SectionToggle;
  onOpen: (pr: GitHubPR) => void;
}

/** Working on: list each ticket's PRs under it (persisted; on by default). */
const SHOW_PRS_KEY = "dev-home-workday-working-prs";

/** "You requested changes · 3d" for a review that's waiting on its author. */
function authorBadge(w: WaitingOnAuthor, now: Date): StateBadge {
  const age = w.at ? ` · ${compactAge(w.at, now)}` : "";
  if (w.state === "CHANGES_REQUESTED")
    return { label: `You requested changes${age}`, tone: "danger" };
  if (w.state === "COMMENTED") return { label: `You commented${age}`, tone: "info" };
  if (w.state === "APPROVED") return { label: `You approved${age}`, tone: "success" };
  return { label: "You reviewed", tone: "info" };
}

/** Focus mode: what needs me, mentions, what I'm on, and what I'm waiting on. */
export function FocusMode({
  focus,
  loading,
  mentionsLoading,
  jiraBaseUrl,
  ticketTitles,
  now,
  sectionToggle,
  onOpen,
}: FocusModeProps) {
  const openIssue = useOptionalJiraDrawer();
  const [approvedOpen, setShowApproved] = useState(false);
  // While filtering, never hide a match behind "+ n you approved".
  const filtering = useContext(ItemFilteringContext);
  const showApproved = approvedOpen || filtering;
  const [showPRs, setShowPRs] = useState(() => localStorage.getItem(SHOW_PRS_KEY) !== "0");
  const toggleShowPRs = () => {
    localStorage.setItem(SHOW_PRS_KEY, showPRs ? "0" : "1");
    setShowPRs(!showPRs);
  };
  const { needs, mentions, working, waiting } = focus;
  const waitingCount =
    waiting.onReviewers.length + waiting.onAuthor.length + waiting.approved.length;

  const prRow = (
    pr: GitHubPR,
    ticketKey: string | null,
    badge: StateBadge,
    child = false,
    author?: string,
  ) => (
    <WorkdayItemRow
      key={pr.html_url}
      kind="pr"
      ticketKey={ticketKey}
      hideKey={child}
      child={child}
      jiraBaseUrl={jiraBaseUrl}
      title={titleWithoutKey(pr.title, ticketKey)}
      extra={<LineSub pr={pr} after={author} />}
      badge={badge}
      time={compactAge(pr.updated_at, now)}
      onClick={() => onOpen(pr)}
    />
  );

  /** Waiting rows grouped by ticket, so a ticket's PRs share one header. */
  const grouped = <T extends { pr: GitHubPR; ticketKey: string | null }>(
    items: T[],
    row: (item: T, child: boolean) => React.ReactNode,
    tone: (item: T) => StateBadge["tone"],
  ) => (
    <GroupedRows
      groups={groupByTicketKey(items, (i) => i.ticketKey)}
      header={(key, group) => (
        <TicketGroupLine
          key={`group:${key}`}
          ticketKey={key}
          jiraBaseUrl={jiraBaseUrl}
          title={ticketTitles.get(key) ?? ""}
          meta={<CountDots label={countLabel(group.length, "PR")} tones={group.map(tone)} />}
          onClick={() => openIssue?.(key)}
        />
      )}
      row={row}
    />
  );

  return (
    <div className="workday-focus">
      <NeedsYouStrip
        {...sectionToggle("needs")}
        items={needs}
        loading={loading}
        error={null}
        jiraBaseUrl={jiraBaseUrl}
        ticketTitles={ticketTitles}
        onTicket={(key) => openIssue?.(key)}
        now={now}
        onOpen={onOpen}
      />

      <WorkdaySection
        {...sectionToggle("mentions")}
        title="Mentions"
        icon={IconAt}
        tone="purple"
        count={mentions.length}
        loading={mentionsLoading}
        error={null}
        hint="Last 3 days"
        empty="No mentions in the last 3 days"
      >
        {mentions.map((m) => (
          <div
            key={m.id}
            className="workday-mention"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.currentTarget.blur();
              if (m.source === "Jira") openIssue?.(m.where);
              else window.open(m.url, "_blank", "noopener,noreferrer");
            }}
          >
            <span className="workday-mention-src">{m.source}</span>
            <RowIcon kind="mention" />
            <span className="workday-mention-main">
              <span className="workday-mention-line1">
                <span className="workday-mention-who">{m.who}</span>
                {m.ticketKey && <TicketKey ticketKey={m.ticketKey} jiraBaseUrl={jiraBaseUrl} />}
                {m.where !== m.ticketKey && (
                  <span className="workday-mention-where">{m.where}</span>
                )}
              </span>
              <span className="workday-mention-snippet">{m.snippet}</span>
            </span>
            <span className="workday-item-time">{compactAge(m.at, now)}</span>
          </div>
        ))}
      </WorkdaySection>

      <WorkdaySection
        {...sectionToggle("working")}
        title="Working on"
        icon={IconTarget}
        tone="info"
        count={working.length}
        loading={loading}
        error={null}
        hint="Your active tickets"
        empty="No open PRs or in-progress tickets"
        titleExtra={
          working.some((w) => w.ticket && w.prs.length > 0) && (
            <button
              type="button"
              className="workday-inline-toggle"
              aria-pressed={showPRs}
              onClick={toggleShowPRs}
            >
              {showPRs ? "Hide PRs" : "Show PRs"}
            </button>
          )
        }
      >
        {working.map((w) => {
          if (!w.ticket) {
            const pr = w.prs[0];
            return prRow(pr, null, w.state);
          }
          return (
            <WorkTicketRow
              key={w.ticket.key}
              ticket={w.ticket}
              prs={w.prs}
              showPRs={showPRs}
              jiraBaseUrl={jiraBaseUrl}
              now={now}
              onOpenTicket={(key) => openIssue?.(key)}
              prRow={(pr, state) => prRow(pr, w.ticket?.key ?? null, state, true)}
            />
          );
        })}
      </WorkdaySection>

      <WorkdaySection
        {...sectionToggle("waiting")}
        title="Waiting on others"
        icon={IconClock}
        tone="success"
        count={waitingCount}
        loading={loading}
        error={null}
        hint="Nothing for you to do · useful for nudging"
        empty="Not waiting on anyone"
      >
        {waiting.onReviewers.length > 0 && (
          <WorkdaySubhead>Your PRs, waiting on reviewers</WorkdaySubhead>
        )}
        {grouped(
          waiting.onReviewers,
          (w, child) =>
            prRow(
              w.pr,
              w.ticketKey,
              { label: `${w.reviewers.join(", ")} · ${compactAge(w.since, now)}`, tone: "neutral" },
              child,
            ),
          () => "neutral",
        )}
        {waiting.onAuthor.length > 0 && <WorkdaySubhead>Reviews, waiting on author</WorkdaySubhead>}
        {grouped(
          waiting.onAuthor,
          (w, child) => prRow(w.pr, w.ticketKey, authorBadge(w, now), child, w.pr.user.login),
          (w) => authorBadge(w, now).tone,
        )}
        {showApproved &&
          grouped(
            waiting.approved,
            (w, child) => prRow(w.pr, w.ticketKey, authorBadge(w, now), child, w.pr.user.login),
            (w) => authorBadge(w, now).tone,
          )}
        {waiting.approved.length > 0 && !filtering && (
          <button type="button" className="workday-more" onClick={() => setShowApproved((v) => !v)}>
            {showApproved
              ? "Hide approved"
              : `+ ${waiting.approved.length} you approved, awaiting merge`}
          </button>
        )}
      </WorkdaySection>
    </div>
  );
}
