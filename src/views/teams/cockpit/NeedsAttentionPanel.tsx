import type { ReactNode } from "react";
import type { NeedsAttention, Ref } from "../../../types/teams";
import { RefRow, Who } from "./RefRow";
import { refKey, type RefLookup } from "./refLookup";
import { staleTone } from "./staleTone";

interface Props {
  needsAttention: NeedsAttention;
  lookup: RefLookup;
  onOpenRef?: (ref: Ref) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface Group {
  key: keyof NeedsAttention;
  label: string;
  severity: "danger" | "warning" | "secondary";
  refs: Ref[];
}

export function NeedsAttentionPanel({ needsAttention, lookup, onOpenRef }: Props) {
  const groups: Group[] = [
    { key: "stale", label: "Stale", severity: "danger", refs: needsAttention.stale },
    {
      key: "waitingReview",
      label: "Waiting review > 24h",
      severity: "warning",
      refs: needsAttention.waitingReview,
    },
  ].filter((g): g is Group => g.refs.length > 0);

  // Stale → who and days since the last update; waiting review → the PR
  // author and its age.
  const describe = (group: Group["key"], ref: Ref): { title?: string; meta?: ReactNode } => {
    if (ref.kind === "pr") {
      const pr = lookup.pr(ref.repo, ref.number);
      if (!pr) return {};
      const created = pr.createdAt ? new Date(pr.createdAt).getTime() : NaN;
      const days = isNaN(created) ? null : Math.max(1, Math.floor((Date.now() - created) / DAY_MS));
      return {
        title: pr.title,
        meta: (
          <>
            <Who name={`@${pr.author}`} />
            {days != null && <span>{days}d</span>}
          </>
        ),
      };
    }
    const issue = lookup.issue(ref.key);
    if (!issue) return {};
    if (group === "stale") {
      return {
        title: issue.summary,
        meta: (
          <>
            {issue.assigneeName && <Who name={issue.assigneeName} />}
            <span style={{ color: staleTone(issue.daysSinceUpdate) }}>
              {issue.daysSinceUpdate}d
            </span>
          </>
        ),
      };
    }
    return { title: issue.summary, meta: issue.status };
  };

  return (
    <div className="border rounded p-3">
      <div className="h6 mb-3">Needs Attention</div>

      {groups.length === 0 ? (
        <div className="text-muted small">All clear — nothing needs attention</div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {groups.map((group) => {
            return (
              <div key={group.key}>
                <div className="cockpit-group-head">
                  <span className={`cockpit-dot bg-${group.severity}`} />
                  {group.label}
                  <span className="text-muted fw-normal">{group.refs.length}</span>
                </div>
                {group.refs.map((ref) => (
                  <RefRow
                    key={refKey(ref)}
                    item={ref}
                    {...describe(group.key, ref)}
                    onOpen={onOpenRef}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
