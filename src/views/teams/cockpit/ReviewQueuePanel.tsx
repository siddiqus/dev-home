import { useState, useMemo } from "react";
import { IconChevronRight, IconChevronDown, IconUser } from "@tabler/icons-react";
import { SearchableDropdown, type DropdownItem } from "../../../components/SearchableDropdown";
import { formatRelativeTime } from "../../../utils/time";
import type { ReviewQueueEntry } from "../../../types/teams";

export interface ReviewQueueMember {
  login: string;
  name: string;
}

interface Props {
  entries: ReviewQueueEntry[];
  /** Team roster, used to populate the member filter. Omit to hide the filter. */
  members?: ReviewQueueMember[];
  onOpenPR?: (repoFullName: string, number: number) => void;
}

// Solid, flat colors for the state dot — no emoji, no gradient. Blue/orange
// match the LoadDistribution palette; red is Bootstrap's danger.
const STATE_META: Record<ReviewQueueEntry["state"], { color: string; label: string }> = {
  author: { color: "#4c8dff", label: "Author" },
  reviewer: { color: "#e0a458", label: "Reviewer" },
  none: { color: "#dc3545", label: "No reviewer" },
};

function StateCell({ state }: { state: ReviewQueueEntry["state"] }) {
  const meta = STATE_META[state];
  return (
    <span className="d-inline-flex align-items-center gap-1 text-nowrap">
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          backgroundColor: meta.color,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {/* Label stays default text color (black) — only the dot carries the state color. */}
      <span className="small text-body">{meta.label}</span>
    </span>
  );
}

export function ReviewQueuePanel({ entries, members, onOpenPR }: Props) {
  // Collapsed by default — the queue is a drill-in, not the cockpit's headline.
  const [collapsed, setCollapsed] = useState(true);
  const [memberFilter, setMemberFilter] = useState("");

  const memberItems: DropdownItem[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.login, label: m.name || m.login })),
    [members],
  );

  const filtered = useMemo(() => {
    if (!memberFilter) return entries;
    return entries.filter((e) => e.author === memberFilter || e.reviewers.includes(memberFilter));
  }, [entries, memberFilter]);

  return (
    <div className="border rounded p-2">
      <div className="d-flex align-items-center gap-2">
        <div
          className="small text-muted d-flex align-items-center gap-1"
          style={{ cursor: "pointer" }}
          role="button"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
          REVIEW QUEUE · {filtered.length}
        </div>
        {!collapsed && memberItems.length > 0 && (
          <div className="ms-auto">
            <SearchableDropdown
              items={memberItems}
              value={memberFilter}
              onChange={setMemberFilter}
              placeholder="Search members…"
              allLabel="All members"
              triggerIcon={<IconUser size={14} style={{ opacity: 0.5, flexShrink: 0 }} />}
              width={180}
            />
          </div>
        )}
      </div>

      {!collapsed &&
        (filtered.length === 0 ? (
          <div className="text-muted small mt-2">No open PRs.</div>
        ) : (
          <table className="table table-sm table-hover mb-0 mt-2">
            <thead>
              <tr className="small text-muted">
                <th>State</th>
                <th>PR</th>
                <th>Author</th>
                <th>Reviewers</th>
                <th>Checks</th>
                <th className="text-nowrap">Age / Activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={`${e.repo_full_name}#${e.number}`}
                  onClick={onOpenPR ? () => onOpenPR(e.repo_full_name, e.number) : undefined}
                  style={onOpenPR ? { cursor: "pointer" } : undefined}
                >
                  <td>
                    <StateCell state={e.state} />
                  </td>
                  <td>
                    <a
                      href={e.html_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      #{e.number} {e.title}
                    </a>
                    <div className="small text-muted">{e.reason}</div>
                  </td>
                  <td className="small text-muted text-nowrap">{e.author}</td>
                  <td className="small text-muted">
                    {e.reviewers.length > 0 ? e.reviewers.join(", ") : "—"}
                  </td>
                  <td className="small text-nowrap">
                    {e.checks_status === "FAILURE" ? (
                      <span className="text-danger">✗</span>
                    ) : e.checks_status === "SUCCESS" ? (
                      <span className="text-success">✓</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="small text-muted text-nowrap">
                    {e.createdAt ? formatRelativeTime(e.createdAt) : "—"} /{" "}
                    {e.updatedAt ? formatRelativeTime(e.updatedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}
