import { useState } from "react";
import type { Hygiene, Ref } from "../../../types/teams";

interface Props {
  hygiene: Hygiene;
  onOpenRef?: (ref: Ref) => void;
}

interface HygieneRow {
  label: string;
  refs: Ref[];
}

function formatRef(ref: Ref): string {
  if (ref.kind === "issue") return ref.key;
  return `${ref.repo}#${ref.number}`;
}

export function DeliveryHygiene({ hygiene, onOpenRef }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows: HygieneRow[] = [
    { label: "PRs without Jira", refs: hygiene.prNoJira },
    { label: "Jira without PR", refs: hygiene.jiraNoPR },
    { label: "Merged but not done", refs: hygiene.mergedNotDone },
    { label: "Done without merged PR", refs: hygiene.doneNoMerged },
  ];

  const activeRows = rows.filter((r) => r.refs.length > 0);
  const allClear = activeRows.length === 0;

  const handleRowClick = (label: string) => {
    setExpanded((prev) => (prev === label ? null : label));
  };

  const handleRefClick = (ref: Ref, e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenRef?.(ref);
  };

  return (
    <div className="border rounded p-2">
      <div className="small text-muted mb-2">DELIVERY HYGIENE</div>
      {allClear ? (
        <div className="text-muted small">All linked up — no hygiene issues.</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {rows
            .filter((row) => row.refs.length > 0)
            .map((row) => {
              const count = row.refs.length;
              const isExpanded = expanded === row.label;

              return (
                <div key={row.label}>
                  <div
                    className="d-flex align-items-center gap-2 p-2 rounded"
                    style={{
                      cursor: "pointer",
                      background: isExpanded ? "rgba(125,125,125,.1)" : undefined,
                    }}
                    onClick={() => handleRowClick(row.label)}
                  >
                    <span className="small flex-fill">{row.label}</span>
                    <span
                      className="badge bg-secondary"
                      style={{
                        fontSize: "0.75rem",
                        minWidth: "24px",
                      }}
                    >
                      {count}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="ps-3 pt-2 d-flex flex-wrap gap-2">
                      {row.refs.map((ref, i) => (
                        <button
                          key={i}
                          className="btn btn-sm btn-outline-secondary"
                          onClick={(e) => handleRefClick(ref, e)}
                          style={{ fontSize: "0.75rem" }}
                        >
                          {formatRef(ref)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
