import React from "react";
import {
  IconCopy,
  IconExternalLink,
  IconGitPullRequest,
  IconMessageCircle,
} from "@tabler/icons-react";
import { jiraBrowseUrl } from "../../utils/tickets";
import { TicketChip } from "../../components/TicketGroupHeader";
import { Badge } from "../../components/primitives/Badge";
import type { GitHubPR } from "../../types";
import { myPRState, repoRef, worstState, type StateBadge } from "./prState";
import { groupUpdatedAt, type KeyedGroup } from "./buildWorkday";
import type { TicketRef } from "./types";
import { ageHeat, compactAge } from "./dates";

/** Dashed marker for tickets assigned to me but not in an active sprint. */
export function OffSprintPill() {
  return <span className="workday-pill workday-pill--offsprint">Off-sprint</span>;
}

/** Copies a ticket key with a toast; provided by WorkdayView. */
export const CopyTicketContext = React.createContext<((key: string) => void) | null>(null);

/** Copies a PR link with a toast; provided by WorkdayView. */
export const CopyPRLinkContext = React.createContext<((url: string) => void) | null>(null);

/**
 * Ticket key chip (click opens the Jira drawer), then copy-key and open-in-Jira
 * icons. "—" when none. The icons stop propagation so the row doesn't open.
 */
export function TicketKey({
  ticketKey,
  jiraBaseUrl,
}: {
  ticketKey: string | null;
  jiraBaseUrl: string;
}) {
  const onCopy = React.useContext(CopyTicketContext);
  if (!ticketKey) return <span className="workday-key workday-key--none">—</span>;
  return (
    <span className="workday-key">
      <TicketChip ticket={ticketKey} jiraBaseUrl={jiraBaseUrl} />
      {onCopy && (
        <button
          type="button"
          className="pr-cluster-icon-btn"
          title="Copy ticket key"
          aria-label={`Copy ${ticketKey}`}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(ticketKey);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <IconCopy size={13} stroke={1.8} />
        </button>
      )}
      {jiraBaseUrl && (
        <a
          className="pr-cluster-ext"
          href={jiraBrowseUrl(jiraBaseUrl, ticketKey)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Jira"
          aria-label={`Open ${ticketKey} in Jira`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <IconExternalLink size={13} stroke={1.8} />
        </a>
      )}
    </span>
  );
}

/**
 * Muted "repo#12", then copy-link and open-on-GitHub icons (like TicketKey's),
 * plus any extra bits, after a one-liner's title.
 */
export function LineSub({ pr, after }: { pr: GitHubPR; after?: string }) {
  const onCopy = React.useContext(CopyPRLinkContext);
  const ref = repoRef(pr);
  return (
    <span className="workday-line-sub">
      {ref}
      {onCopy && (
        <button
          type="button"
          className="pr-cluster-icon-btn"
          title="Copy PR link"
          aria-label={`Copy link to ${ref}`}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(pr.html_url);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <IconCopy size={13} stroke={1.8} />
        </button>
      )}
      <a
        className="pr-cluster-ext"
        href={pr.html_url}
        target="_blank"
        rel="noopener noreferrer"
        title="Open on GitHub"
        aria-label={`Open ${ref} on GitHub`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <IconExternalLink size={13} stroke={1.8} />
      </a>
      {after && ` · ${after}`}
    </span>
  );
}

/** Compact age that turns amber after a day and red after three (waiting matters). */
export function HeatAge({ iso, now }: { iso: string; now: Date }) {
  const heat = ageHeat(iso, now);
  return <span className={heat ? `workday-age--${heat}` : undefined}>{compactAge(iso, now)}</span>;
}

/** One small dot per PR in its state's colour, after an "N PRs" count. */
export function PRDots({ tones }: { tones: StateBadge["tone"][] }) {
  return (
    <span className="workday-pr-dots" aria-hidden="true">
      {tones.map((tone, i) => (
        <i key={i} className={`workday-dot--${tone}`} />
      ))}
    </span>
  );
}

/** "1 PR" / "3 PRs". */
export const countLabel = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** "3 PRs ●●●": a count followed by its state dots. */
export function CountDots({ label, tones }: { label: string; tones: StateBadge["tone"][] }) {
  return (
    <>
      {label}
      <PRDots tones={tones} />
    </>
  );
}

/** Click + Enter/Space handlers for a div acting as a button. */
function clickable(onClick?: () => void) {
  if (!onClick) return {};
  return {
    role: "button",
    tabIndex: 0,
    onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };
}

/** Tickets get no icon (the key chip says it); only PRs and mentions do. */
export type RowKind = "pr" | "mention";

const ROW_ICONS = { pr: IconGitPullRequest, mention: IconMessageCircle };

/** The shared grid's icon column; an empty cell when the row has no icon. */
export function RowIcon({ kind }: { kind?: RowKind }) {
  const Icon = kind && ROW_ICONS[kind];
  return (
    <span className="workday-row-icon">
      {Icon && <Icon size={16} stroke={1.75} aria-hidden="true" />}
    </span>
  );
}

interface WorkdayLineProps {
  /** Left label (verb / what / state), coloured by tone. */
  lead: React.ReactNode;
  tone?: StateBadge["tone"];
  /** Draws a dot before the lead (Needs you verbs). */
  dot?: boolean;
  /** Icon in the icon column: what the row is (none for a ticket). */
  icon?: RowKind;
  ticketKey: string | null;
  /** Show the lead instead of the key (lines under a ticket header). */
  hideKey?: boolean;
  jiraBaseUrl: string;
  title: React.ReactNode;
  /** Extra inline bits after the title (off-sprint pill, author). */
  extra?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * A one-liner on the shared row grid: key (or, without one, the lead label) ·
 * icon · title · meta. Nested under a ticket header the lead replaces the key.
 */
export function WorkdayLine({
  lead,
  tone,
  dot,
  icon,
  ticketKey,
  hideKey,
  jiraBaseUrl,
  title,
  extra,
  meta,
  className = "",
  onClick,
}: WorkdayLineProps) {
  const showKey = !hideKey && !!ticketKey;
  return (
    <div className={`workday-line ${className}`.trim()} {...clickable(onClick)}>
      {showKey ? (
        <TicketKey ticketKey={ticketKey} jiraBaseUrl={jiraBaseUrl} />
      ) : (
        <span
          className={`workday-line-lead${tone ? ` workday-tone--${tone}` : ""}${dot ? " workday-line-lead--dot" : ""}`}
        >
          {lead}
        </span>
      )}
      <RowIcon kind={icon} />
      <span className="workday-line-title">
        <span className="workday-line-text">{title}</span>
        {extra}
      </span>
      <span className="workday-line-meta">{meta}</span>
    </div>
  );
}

interface WorkdayItemRowProps {
  /** Icon column; omit for a ticket, whose title then starts there (its PRs indent under it). */
  kind?: "pr";
  ticketKey?: string | null;
  /** Hide the key column (e.g. PRs nested under a ticket header). */
  hideKey?: boolean;
  jiraBaseUrl: string;
  title: React.ReactNode;
  extra?: React.ReactNode;
  badge?: StateBadge | null;
  /** Badge tooltip. */
  badgeTitle?: string;
  time?: string | null;
  child?: boolean;
  onClick?: () => void;
}

/**
 * A PR / ticket row on the shared row grid: key (empty when nested or
 * ticketless) · icon · title + inline extras (repo#N, status) · badge · time.
 */
export function WorkdayItemRow({
  kind,
  ticketKey = null,
  hideKey,
  jiraBaseUrl,
  title,
  extra,
  badge,
  badgeTitle,
  time,
  child,
  onClick,
}: WorkdayItemRowProps) {
  return (
    <div
      className={`workday-item${child ? " workday-item--child" : ""}${kind ? "" : " workday-item--ticket"}`}
      {...clickable(onClick)}
    >
      {!hideKey && ticketKey ? (
        <TicketKey ticketKey={ticketKey} jiraBaseUrl={jiraBaseUrl} />
      ) : (
        <span />
      )}
      {kind && <RowIcon kind={kind} />}
      <div className="workday-item-main">
        <div className="workday-item-line1">
          <span className="workday-item-title">{title}</span>
          {extra}
        </div>
      </div>
      <div className="workday-item-side">
        {badge && (
          <Badge variant={badge.tone} title={badgeTitle}>
            {badge.label}
          </Badge>
        )}
        <span className="workday-item-time">{time}</span>
      </div>
    </div>
  );
}

interface WorkTicketRowProps {
  ticket: TicketRef;
  prs: GitHubPR[];
  /** List the PRs under the ticket (else only the row's dots and badge). */
  showPRs: boolean;
  jiraBaseUrl: string;
  now: Date;
  onOpenTicket: (key: string) => void;
  /** One nested PR row (child of the ticket). */
  prRow: (pr: GitHubPR, state: StateBadge) => React.ReactNode;
}

/**
 * A ticket I'm working on (Focus's Working on, Standup's In Progress): key ·
 * summary · status · "n PRs ●●" · worst-state badge · time, optionally with
 * its PRs nested under it. Nested PRs carry their own states, so the badge
 * steps aside then.
 */
export function WorkTicketRow({
  ticket,
  prs,
  showPRs,
  jiraBaseUrl,
  now,
  onOpenTicket,
  prRow,
}: WorkTicketRowProps) {
  const states = prs.map(myPRState);
  const nested = showPRs && prs.length > 0;
  const status = ticket.statusName ?? "—";
  const at = groupUpdatedAt({ ticket, prs });
  return (
    <>
      <WorkdayItemRow
        ticketKey={ticket.key}
        jiraBaseUrl={jiraBaseUrl}
        title={ticket.summary || ticket.key}
        extra={
          <>
            {ticket.offSprint && <OffSprintPill />}
            <span className="workday-item-inline">
              <CountDots
                label={prs.length > 0 ? `${status} · ${countLabel(prs.length, "PR")}` : status}
                tones={states.map((st) => st.tone)}
              />
            </span>
          </>
        }
        badge={nested ? null : worstState(prs)}
        time={at && compactAge(at, now)}
        onClick={() => onOpenTicket(ticket.key)}
      />
      {nested && prs.map((pr, i) => prRow(pr, states[i]))}
    </>
  );
}

interface TicketGroupLineProps {
  ticketKey: string;
  jiraBaseUrl: string;
  title: React.ReactNode;
  extra?: React.ReactNode;
  meta?: React.ReactNode;
  onClick?: () => void;
}

/** Header above a ticket's rows: key · summary · meta. */
export function TicketGroupLine({ ticketKey, ...rest }: TicketGroupLineProps) {
  return (
    <WorkdayLine className="workday-line--group" lead={null} ticketKey={ticketKey} {...rest} />
  );
}

interface GroupedRowsProps<T> {
  groups: KeyedGroup<T>[];
  /** Header for a ticket's items. */
  header: (key: string, items: T[]) => React.ReactNode;
  /** One item's row; `child` when nested under a header (hide the key). */
  row: (item: T, child: boolean) => React.ReactNode;
}

/**
 * Rows grouped by ticket: every ticket gets a header (key + summary) with its
 * items nested under it, even a lone one; ticketless items stand alone.
 */
export function GroupedRows<T>({ groups, header, row }: GroupedRowsProps<T>) {
  return (
    <>
      {groups.map((g) =>
        g.key ? (
          <React.Fragment key={g.key}>
            {header(g.key, g.items)}
            {g.items.map((item) => row(item, true))}
          </React.Fragment>
        ) : (
          g.items.map((item) => row(item, false))
        ),
      )}
    </>
  );
}

/** Small uppercase divider inside a section. */
export function WorkdaySubhead({ children }: { children: React.ReactNode }) {
  return <div className="workday-subhead">{children}</div>;
}
