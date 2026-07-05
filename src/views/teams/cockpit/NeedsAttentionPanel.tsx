import { useState } from "react";
import type { NeedsAttention, Ref } from "../../../types/teams";
import { staleTone } from "./staleTone";

interface Props {
  needsAttention: NeedsAttention;
  onOpenRef?: (ref: Ref) => void;
  staleDays?: Map<string, number>;
}

interface SignalRow {
  key: keyof NeedsAttention;
  label: string;
  severity: "danger" | "warning" | "secondary";
  refs: Ref[];
}

export function NeedsAttentionPanel({ needsAttention, onOpenRef, staleDays }: Props) {
  const [expandedRow, setExpandedRow] = useState<keyof NeedsAttention | null>(null);

  const rows: SignalRow[] = [
    { key: "stale", label: "Stale", severity: "danger", refs: needsAttention.stale },
    {
      key: "waitingReview",
      label: "Waiting review > 24h",
      severity: "warning",
      refs: needsAttention.waitingReview,
    },
    { key: "failingCI", label: "Failing CI", severity: "danger", refs: needsAttention.failingCI },
    {
      key: "noLinkedPR",
      label: "No linked PR",
      severity: "secondary",
      refs: needsAttention.noLinkedPR,
    },
    {
      key: "unassigned",
      label: "Unassigned",
      severity: "secondary",
      refs: needsAttention.unassigned,
    },
    { key: "noEpic", label: "No epic", severity: "secondary", refs: needsAttention.noEpic },
    {
      key: "scopeCreep",
      label: "Scope creep",
      severity: "warning",
      refs: needsAttention.scopeCreep,
    },
    {
      key: "offBoard",
      label: "Off-board PRs",
      severity: "secondary",
      refs: needsAttention.offBoard,
    },
  ];

  const visibleRows = rows.filter((row) => row.refs.length > 0);
  const allClear = visibleRows.length === 0;

  const toggleRow = (key: keyof NeedsAttention) => {
    setExpandedRow(expandedRow === key ? null : key);
  };

  const handleRefClick = (ref: Ref) => {
    onOpenRef?.(ref);
  };

  const formatRef = (ref: Ref): string => {
    if (ref.kind === "issue") {
      return ref.key;
    }
    return `${ref.repo}#${ref.number}`;
  };

  const getBadgeClass = (severity: "danger" | "warning" | "secondary"): string => {
    const baseClasses = "badge rounded-pill";
    switch (severity) {
      case "danger":
        return `${baseClasses} bg-danger`;
      case "warning":
        return `${baseClasses} bg-warning text-dark`;
      case "secondary":
        return `${baseClasses} bg-secondary`;
    }
  };

  return (
    <div className="border rounded p-3">
      <div className="h6 mb-3">Needs Attention</div>

      {allClear ? (
        <div className="text-muted small">All clear — nothing needs attention</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {visibleRows.map((row) => (
            <div key={row.key}>
              <div
                className="d-flex justify-content-between align-items-center p-2 rounded"
                style={{ cursor: "pointer", background: "rgba(125, 125, 125, 0.05)" }}
                onClick={() => toggleRow(row.key)}
              >
                <span className="small">{row.label}</span>
                <span className={getBadgeClass(row.severity)}>{row.refs.length}</span>
              </div>

              {expandedRow === row.key && (
                <div className="mt-2 ms-3 d-flex flex-wrap gap-2">
                  {row.refs.map((ref, idx) => {
                    const days =
                      row.key === "stale" && ref.kind === "issue"
                        ? staleDays?.get(ref.key)
                        : undefined;
                    return (
                      <button
                        key={idx}
                        className="btn btn-sm btn-outline-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRefClick(ref);
                        }}
                      >
                        {formatRef(ref)}
                        {days != null && (
                          <span
                            className="ms-1"
                            style={{ color: staleTone(days), fontSize: "0.75rem" }}
                          >
                            · No update {days}d
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
