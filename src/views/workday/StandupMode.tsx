import { useMemo, useState } from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconEye,
  IconProgress,
} from "@tabler/icons-react";
import type { GitHubPR, Note, NoteType, ReviewState } from "../../types";
import { SectionHeader } from "../../components/primitives/SectionHeader";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { useOptionalJiraDrawer } from "../../context/JiraDrawerContext";
import {
  blockerLabel,
  groupByTicketKey,
  inProgressCount,
  reviewingLines,
  type ReviewingLine,
} from "./buildWorkday";
import { standupRef, compactAge, type Lookback } from "./dates";
import { myPRState, REVIEWING_LABEL, titleWithoutKey } from "./prState";
import type { StateBadge } from "./prState";
import type { BlockerItem, DoneItem, NotStartedItem, TicketRef, WorkdaySections } from "./types";
import { WorkdaySection } from "./WorkdaySection";
import {
  CountDots,
  countLabel,
  GroupedRows,
  HeatAge,
  LineSub,
  OffSprintPill,
  TicketGroupLine,
  WorkdayItemRow,
  WorkdayLine,
  WorkdaySubhead,
  WorkTicketRow,
} from "./CompactRow";
import { StandupNotes } from "./StandupNotes";

type SectionToggle = (id: string) => { collapsed: boolean; onToggle: () => void };

export const LOOKBACKS = ["workday", "3d", "7d"] as const satisfies readonly Lookback[];
const LOOKBACK_LABELS: Record<Lookback, string> = {
  workday: "Last workday",
  "3d": "3 days",
  "7d": "7 days",
};
const DONE_TITLES: Record<Lookback, string> = {
  workday: "Done since last workday",
  "3d": "Done in the last 3 days",
  "7d": "Done in the last 7 days",
};

const REVIEW_PILL: Record<ReviewState, StateBadge> = {
  APPROVED: { label: "Approved", tone: "success" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "danger" },
  COMMENTED: { label: "Commented", tone: "neutral" },
};

function doneLead(item: DoneItem): StateBadge {
  if (item.kind === "merged") return { label: "Merged", tone: "success" };
  if (item.kind === "reviewed") {
    // My verdict, plus where the PR ended up when it's no longer open.
    const pill = REVIEW_PILL[item.state];
    const outcome =
      item.pr.state === "merged" ? "Merged" : item.pr.state === "closed" ? "Closed" : null;
    if (!outcome) return pill;
    // Shortened so the combined label fits the key column.
    const verdict = item.state === "CHANGES_REQUESTED" ? "Changes req." : pill.label;
    return { ...pill, label: `${verdict} · ${outcome}` };
  }
  return { label: `To ${item.toStatus}`, tone: "info" };
}

const offPill = (ticket: TicketRef | null) => ticket?.offSprint && <OffSprintPill />;

export interface StandupModeProps {
  sections: WorkdaySections;
  sinceLabel: string;
  lookback: Lookback;
  onLookback: (l: Lookback) => void;
  loading: boolean;
  jiraBaseUrl: string;
  now: Date;
  sectionToggle: SectionToggle;
  onOpen: (pr: GitHubPR) => void;
  markdown: string;
  onNoteChange: (text: string) => void;
  notes: Note[];
  notesLoaded: boolean;
  addNote: (type: NoteType, content: string, referenceId?: string, title?: string) => Promise<Note>;
  editNote: (id: number, updates: { content?: string; title?: string }) => Promise<void>;
}

/**
 * Standup mode: compact sections that mirror the copied text (Done, In
 * progress, Blockers, Reviewing, Not started), plus notes and a text preview.
 */
export function StandupMode({
  sections,
  sinceLabel,
  lookback,
  onLookback,
  loading,
  jiraBaseUrl,
  now,
  sectionToggle,
  onOpen,
  markdown,
  onNoteChange,
  notes,
  notesLoaded,
  addNote,
  editNote,
}: StandupModeProps) {
  const openIssue = useOptionalJiraDrawer();
  const [showPreview, setShowPreview] = useState(false);
  const { done, workingOn, blockers, notStarted } = sections;
  const reviewing = useMemo(() => reviewingLines(sections), [sections]);
  const doneGroups = useMemo(
    () => groupByTicketKey(done.items, (d) => d.ticket?.key ?? null),
    [done.items],
  );
  const blockerGroups = useMemo(
    () => groupByTicketKey(blockers.items, (b) => b.ticket?.key ?? null),
    [blockers.items],
  );
  const reviewingGroups = useMemo(
    () => groupByTicketKey(reviewing, (r) => r.ticket?.key ?? null),
    [reviewing],
  );
  /** Header above a ticket's rows: "label ●●" with one dot per row's state. */
  const ticketHeader = (
    ticket: TicketRef | null,
    key: string,
    label: string,
    tones: StateBadge["tone"][],
  ) => (
    <TicketGroupLine
      key={`group:${key}`}
      ticketKey={key}
      jiraBaseUrl={jiraBaseUrl}
      title={ticket?.summary ?? ""}
      extra={offPill(ticket)}
      meta={<CountDots label={label} tones={tones} />}
      onClick={() => openTicket(key)}
    />
  );
  const offItems = notStarted.offSprintItems;
  const openTicket = (key: string) => openIssue?.(key);

  const prRow = (pr: GitHubPR, ticket: TicketRef | null, opts: { child?: boolean } = {}) => (
    <WorkdayItemRow
      key={pr.html_url}
      kind="pr"
      ticketKey={ticket?.key ?? null}
      hideKey={opts.child}
      child={opts.child}
      jiraBaseUrl={jiraBaseUrl}
      title={titleWithoutKey(pr.title, ticket?.key ?? null)}
      extra={
        <>
          {!opts.child && offPill(ticket)}
          <LineSub pr={pr} />
        </>
      }
      badge={myPRState(pr)}
      time={compactAge(pr.updated_at, now)}
      onClick={() => onOpen(pr)}
    />
  );

  const doneLine = (item: DoneItem, child: boolean) => {
    const lead = doneLead(item);
    return (
      <WorkdayLine
        key={`${item.kind}:${item.kind === "status" ? item.ticket.key : item.pr.html_url}:${item.at}`}
        className={child ? "workday-line--child" : undefined}
        lead={lead.label}
        tone={lead.tone}
        icon={item.kind === "status" ? undefined : "pr"}
        ticketKey={item.ticket?.key ?? null}
        hideKey={child}
        jiraBaseUrl={jiraBaseUrl}
        title={
          item.kind === "status"
            ? child
              ? "Ticket status"
              : item.ticket.summary
            : titleWithoutKey(item.pr.title, item.ticket?.key ?? null)
        }
        extra={
          <>
            {!child && offPill(item.ticket)}
            {item.kind !== "status" && <LineSub pr={item.pr} />}
          </>
        }
        meta={compactAge(item.at, now)}
        onClick={() => (item.kind === "status" ? openTicket(item.ticket.key) : onOpen(item.pr))}
      />
    );
  };

  const reviewingLine = (r: ReviewingLine, child: boolean) => {
    const lead = REVIEWING_LABEL[r.state];
    return (
      <WorkdayLine
        key={r.pr.html_url}
        className={child ? "workday-line--child" : undefined}
        lead={lead.label}
        tone={lead.tone}
        icon="pr"
        ticketKey={r.ticket?.key ?? null}
        hideKey={child}
        jiraBaseUrl={jiraBaseUrl}
        title={titleWithoutKey(r.pr.title, r.ticket?.key ?? null)}
        extra={<LineSub pr={r.pr} after={r.pr.user.login} />}
        meta={compactAge(r.pr.updated_at, now)}
        onClick={() => onOpen(r.pr)}
      />
    );
  };

  const blockerLine = (b: BlockerItem, child: boolean) => {
    const lead = blockerLabel(b);
    const blockerAt = b.kind === "pr" ? b.pr.updated_at : b.ticket.updated;
    return (
      <WorkdayLine
        key={b.kind === "pr" ? b.pr.html_url : `flagged:${b.ticket.key}`}
        className={child ? "workday-line--child" : undefined}
        lead={lead.label}
        tone={lead.tone}
        dot
        icon={b.kind === "pr" ? "pr" : undefined}
        ticketKey={b.ticket?.key ?? null}
        hideKey={child}
        jiraBaseUrl={jiraBaseUrl}
        title={
          b.kind === "pr"
            ? titleWithoutKey(b.pr.title, b.ticket?.key ?? null)
            : child
              ? "Flagged in Jira"
              : b.ticket.summary
        }
        extra={
          <>
            {!child && offPill(b.ticket)}
            {b.kind === "pr" && <LineSub pr={b.pr} />}
          </>
        }
        meta={
          <>
            {b.kind === "pr" && b.reasons.length > 1 && `${b.reasons.slice(1).join(", ")} · `}
            {blockerAt && <HeatAge iso={blockerAt} now={now} />}
          </>
        }
        onClick={() => (b.kind === "pr" ? onOpen(b.pr) : openTicket(b.ticket.key))}
      />
    );
  };

  const notStartedLine = (item: NotStartedItem) => {
    const points = item.points !== null ? `${item.points} pt${item.points === 1 ? "" : "s"}` : null;
    const when = item.ticket.offSprint
      ? item.updated && `updated ${compactAge(item.updated, now)} ago`
      : item.sprintName;
    return (
      <WorkdayLine
        key={item.ticket.key}
        lead={null}
        ticketKey={item.ticket.key}
        jiraBaseUrl={jiraBaseUrl}
        title={item.ticket.summary}
        meta={[points, when].filter(Boolean).join(" · ")}
        onClick={() => openTicket(item.ticket.key)}
      />
    );
  };

  return (
    <div className="workday">
      <div className="workday-main">
        <WorkdaySection
          {...sectionToggle("done")}
          title={DONE_TITLES[lookback]}
          icon={IconCircleCheck}
          tone="success"
          count={done.items.length}
          loading={done.loading}
          error={done.error}
          empty={`Nothing merged, reviewed or moved since ${sinceLabel}`}
          actions={
            <SegmentedTabs
              className="compact"
              tabs={LOOKBACKS.map((l) => ({ key: l, label: LOOKBACK_LABELS[l] }))}
              activeKey={lookback}
              onChange={(k) => onLookback(k as Lookback)}
            />
          }
        >
          <GroupedRows
            groups={doneGroups}
            header={(key, items) =>
              ticketHeader(
                items[0].ticket,
                key,
                countLabel(items.length, "update"),
                items.map((d) => doneLead(d).tone),
              )
            }
            row={doneLine}
          />
        </WorkdaySection>

        <WorkdaySection
          {...sectionToggle("inProgress")}
          title="In Progress"
          icon={IconProgress}
          tone="info"
          count={inProgressCount(workingOn.items)}
          loading={loading}
          error={workingOn.error}
          empty="No open PRs or in-progress tickets"
        >
          {workingOn.items.map((g) => {
            if (!g.ticket) return g.prs.map((pr) => prRow(pr, null));
            const { ticket } = g;
            return (
              <WorkTicketRow
                key={ticket.key}
                ticket={ticket}
                prs={g.prs}
                showPRs
                jiraBaseUrl={jiraBaseUrl}
                now={now}
                onOpenTicket={openTicket}
                prRow={(pr) => prRow(pr, ticket, { child: true })}
              />
            );
          })}
        </WorkdaySection>

        <WorkdaySection
          {...sectionToggle("blockers")}
          title="Blockers"
          icon={IconAlertTriangle}
          tone="danger"
          count={blockers.items.length}
          loading={loading || blockers.loading}
          error={blockers.error}
          empty="Nothing blocked"
        >
          <GroupedRows
            groups={blockerGroups}
            header={(key, items) =>
              ticketHeader(
                items[0].ticket,
                key,
                countLabel(items.length, "blocker"),
                items.map((b) => blockerLabel(b).tone),
              )
            }
            row={blockerLine}
          />
        </WorkdaySection>

        <WorkdaySection
          {...sectionToggle("reviewing")}
          title="Reviewing"
          icon={IconEye}
          tone="purple"
          count={reviewing.length}
          loading={loading}
          error={sections.reviewing.error}
          empty="No reviews requested or in progress"
        >
          <GroupedRows
            groups={reviewingGroups}
            header={(key, items) =>
              ticketHeader(
                items[0].ticket,
                key,
                countLabel(items.length, "PR"),
                items.map((r) => REVIEWING_LABEL[r.state].tone),
              )
            }
            row={reviewingLine}
          />
        </WorkdaySection>

        <WorkdaySection
          {...sectionToggle("notStarted")}
          title="Assigned, not started"
          icon={IconCircleDashed}
          count={notStarted.items.length + offItems.length}
          loading={loading || notStarted.loading}
          error={notStarted.error}
          empty="No assigned tickets waiting to start"
        >
          {notStarted.items.map(notStartedLine)}
          {offItems.length > 0 && (
            <>
              <WorkdaySubhead>Off-sprint</WorkdaySubhead>
              {offItems.map(notStartedLine)}
            </>
          )}
        </WorkdaySection>
      </div>

      <div className="workday-side">
        <StandupNotes
          key={standupRef(now)}
          now={now}
          notes={notes}
          notesLoaded={notesLoaded}
          addNote={addNote}
          editNote={editNote}
          onChange={onNoteChange}
        />
        <Card className="workday-side-card">
          <Card.Body className="p-0">
            <SectionHeader
              className={`workday-section-header${showPreview ? "" : " workday-section-header--collapsed"}`}
              action={
                <Button
                  variant="outline-secondary"
                  size="sm"
                  aria-expanded={showPreview}
                  onClick={() => setShowPreview((v) => !v)}
                >
                  {showPreview ? "Hide" : "Preview"}
                </Button>
              }
            >
              Standup text
            </SectionHeader>
            {showPreview && (
              <pre className="workday-preview">{markdown || "Nothing to report yet."}</pre>
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
