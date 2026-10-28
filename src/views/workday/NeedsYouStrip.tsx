import { IconBolt } from "@tabler/icons-react";
import type { GitHubPR } from "../../types";
import { MergeButton } from "../../components/MergeButton";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { TicketChip } from "../../components/TicketGroupHeader";
import { usePersistedState } from "../../hooks/usePersistedState";
import { WorkdaySection } from "./WorkdaySection";
import {
  CountDots,
  countLabel,
  GroupedRows,
  HeatAge,
  LineSub,
  TicketGroupLine,
  WorkdayLine,
} from "./CompactRow";
import { groupByTicketKey, type KeyedGroup } from "./buildWorkday";
import { titleWithoutKey, type StateBadge } from "./prState";
import { NEEDS_TIER_ORDER, type NeedsItem, type NeedsTier } from "./types";

const TIER_LABEL: Record<NeedsTier, string> = {
  self: "Unblock yourself",
  others: "Unblock others",
  ship: "Ship",
};

/** What each tier holds, shown beside its label. */
const TIER_HINT: Record<NeedsTier, string> = {
  self: "Your PRs that are stuck",
  others: "People waiting on your review",
  ship: "Ready to merge",
};

/** Colour of each tier's label dot. */
const TIER_TONE: Record<NeedsTier, StateBadge["tone"]> = {
  self: "danger",
  others: "warning",
  ship: "success",
};

/**
 * Ticket key → PR count per tier. A ticket whose PRs need different actions
 * shows under each tier, so its header points at the others.
 */
function tierCountsByTicket(items: NeedsItem[]): Map<string, Map<NeedsTier, number>> {
  const out = new Map<string, Map<NeedsTier, number>>();
  for (const { ticketKey, tier } of items) {
    if (!ticketKey) continue;
    const counts = out.get(ticketKey) ?? new Map<NeedsTier, number>();
    counts.set(tier, (counts.get(tier) ?? 0) + 1);
    out.set(ticketKey, counts);
  }
  return out;
}

/** "+1 in Unblock others" pills for a ticket's PRs in other tiers. */
function AlsoInPills({ counts, tier }: { counts?: Map<NeedsTier, number>; tier: NeedsTier }) {
  const others = NEEDS_TIER_ORDER.filter((t) => t !== tier && counts?.get(t));
  if (others.length === 0) return null;
  return (
    <>
      {others.map((t) => (
        <span key={t} className="workday-pill workday-pill--also">
          +{counts!.get(t)} in {TIER_LABEL[t]}
        </span>
      ))}
    </>
  );
}

/** "+2 more issues" beside a PR's title; the tooltip lists them. */
function MoreIssuesPill({ item }: { item: NeedsItem }) {
  const rest = item.issues.slice(1);
  if (rest.length === 0) return null;
  return (
    <span
      className="workday-pill workday-pill--more"
      title={rest.map((i) => `${i.verb}: ${i.reason}`).join("\n")}
    >
      +{rest.length} more {rest.length === 1 ? "issue" : "issues"}
    </span>
  );
}

type Grouping = "ticket" | "pr";

/** Lock in rows: under ticket headers, or one ranked row per PR (persisted). */
const GROUPING_KEY = "dev-home-focus-needs-grouping";

const GROUPINGS = [
  { key: "ticket", label: "By ticket" },
  { key: "pr", label: "By PR" },
];

interface NeedsYouStripProps {
  items: NeedsItem[];
  loading: boolean;
  error: string | null;
  jiraBaseUrl: string;
  /** Ticket key → summary, for group headers. */
  ticketTitles: Map<string, string>;
  onTicket: (key: string) => void;
  now: Date;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (pr: GitHubPR) => void;
}

/**
 * Focus's to-do strip: what's waiting on me, approved PRs first, then most blocking. View-only:
 * the coloured verb is a label, and items clear when upstream state changes.
 */
export function NeedsYouStrip({
  items,
  loading,
  error,
  jiraBaseUrl,
  ticketTitles,
  onTicket,
  now,
  collapsed,
  onToggle,
  onOpen,
}: NeedsYouStripProps) {
  const [grouping, setGrouping] = usePersistedState<Grouping>(GROUPING_KEY, "ticket");
  const byPR = grouping === "pr";
  const empty = items.length === 0;
  const tierCounts = tierCountsByTicket(items);
  const groupsOf = (tierItems: NeedsItem[]): KeyedGroup<NeedsItem>[] =>
    byPR
      ? tierItems.map((i) => ({ key: null, items: [i] }))
      : groupByTicketKey(tierItems, (i) => i.ticketKey);
  return (
    <WorkdaySection
      title="Lock in"
      icon={IconBolt}
      count={items.length}
      loading={loading}
      error={error}
      empty={<span className="workday-all-clear">✓ Nothing needs you right now</span>}
      // hint={''}
      actions={
        !empty && (
          <SegmentedTabs
            className="compact"
            tabs={GROUPINGS}
            activeKey={grouping}
            onChange={(k) => setGrouping(k as Grouping)}
          />
        )
      }
      className={`workday-needs${empty ? " workday-needs--empty" : ""}`}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {NEEDS_TIER_ORDER.map((tier) => {
        const tierItems = items.filter((i) => i.tier === tier);
        if (tierItems.length === 0) return null;
        return (
          // Each tier is its own row list, so ticket groups and loose PRs get
          // the standard dividers; the tier header is a full-width band.
          <div key={tier} className="workday-needs-tier workday-rows">
            <div className="workday-subhead workday-tier">
              <i className={`workday-tier-dot workday-dot--${TIER_TONE[tier]}`} />
              <span className="workday-tier-label">{TIER_LABEL[tier]}</span>
              <span className="workday-tier-count">{tierItems.length}</span>
              <span className="workday-tier-hint">{TIER_HINT[tier]}</span>
            </div>
            <GroupedRows
              groups={groupsOf(tierItems)}
              header={(key, group) => (
                <TicketGroupLine
                  key={`group:${key}`}
                  ticketKey={key}
                  jiraBaseUrl={jiraBaseUrl}
                  title={ticketTitles.get(key) ?? ""}
                  extra={<AlsoInPills counts={tierCounts.get(key)} tier={tier} />}
                  meta={
                    <CountDots
                      label={countLabel(group.length, "PR")}
                      tones={group.map((i) => i.tone)}
                    />
                  }
                  onClick={() => onTicket(key)}
                />
              )}
              row={(item, child) => (
                <WorkdayLine
                  key={item.pr.html_url}
                  className={`workday-line--needs${child ? " workday-line--child" : ""}`}
                  lead={item.verb}
                  tone={item.tone}
                  dot
                  icon="pr"
                  ticketKey={item.ticketKey}
                  // The verb keeps the key column; by PR, the key leads the title.
                  hideKey
                  jiraBaseUrl={jiraBaseUrl}
                  title={
                    byPR && item.ticketKey ? (
                      <>
                        <TicketChip ticket={item.ticketKey} jiraBaseUrl={jiraBaseUrl} />
                        {titleWithoutKey(item.pr.title, item.ticketKey)}
                      </>
                    ) : (
                      titleWithoutKey(item.pr.title, item.ticketKey)
                    )
                  }
                  extra={
                    <>
                      <MoreIssuesPill item={item} />
                      <LineSub pr={item.pr} />
                    </>
                  }
                  meta={
                    <>
                      {/* The "Merge" verb leads the row; the button does it. */}
                      {tier === "ship" && <MergeButton pr={item.pr} fallback={null} />}
                      {item.reason} · <HeatAge iso={item.at} now={now} />
                    </>
                  }
                  onClick={() => onOpen(item.pr)}
                />
              )}
            />
          </div>
        );
      })}
    </WorkdaySection>
  );
}
