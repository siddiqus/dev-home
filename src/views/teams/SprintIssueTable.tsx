import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import type { DashboardIssue } from "../../types/teams";

const col = createColumnHelper<DashboardIssue>();

interface Props {
  issues: DashboardIssue[];
  jiraBaseUrl?: string;
  /** Open the Jira drawer for an issue key. */
  onIssueClick?: (key: string) => void;
  /** Open the PR description modal for a linked PR. */
  onPRClick?: (repoFullName: string, number: number) => void;
}

export function SprintIssueTable({ issues, jiraBaseUrl, onIssueClick, onPRClick }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");

  const columns = useMemo(
    () => [
      col.accessor("key", {
        header: "Key",
        cell: (c) => {
          const key = c.getValue();
          const base = jiraBaseUrl?.replace(/\/+$/, "");
          // The key links out to Jira in a new tab; clicking elsewhere on the
          // row opens the drawer (see the <tr> onClick below). stopPropagation
          // keeps the link from also triggering the row handler.
          return base ? (
            <a
              href={`${base}/browse/${key}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {key}
            </a>
          ) : (
            key
          );
        },
      }),
      col.accessor("summary", { header: "Summary" }),
      col.accessor("assigneeName", { header: "Assignee", cell: (c) => c.getValue() || "—" }),
      col.accessor("status", { header: "Status" }),
      col.accessor("epicName", { header: "Epic", cell: (c) => c.getValue() || "—" }),
      col.accessor((r) => r.linkedPRs.length, {
        id: "prs",
        header: "PRs",
        cell: (c) => {
          const prs = c.row.original.linkedPRs;
          if (prs.length === 0) return "—";
          return prs.map((pr) =>
            onPRClick ? (
              <button
                key={pr.number}
                type="button"
                className="btn btn-link p-0 me-1 align-baseline"
                style={{ fontSize: "inherit" }}
                title={pr.checks_status || ""}
                onClick={(e) => {
                  e.stopPropagation();
                  onPRClick(pr.repo_full_name, pr.number);
                }}
              >
                #{pr.number}
              </button>
            ) : (
              <a
                key={pr.number}
                href={pr.html_url}
                target="_blank"
                rel="noreferrer"
                className="me-1"
                title={pr.checks_status || ""}
              >
                #{pr.number}
              </a>
            ),
          );
        },
      }),
    ],
    [jiraBaseUrl, onIssueClick, onPRClick],
  );

  const table = useReactTable({
    data: issues,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      <input
        className="form-control form-control-sm mb-2"
        style={{ maxWidth: 260 }}
        placeholder="Filter issues…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <table className="table table-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{ cursor: "pointer" }}
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: " ▲", desc: " ▼" }[h.column.getIsSorted() as string] ?? ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={onIssueClick ? () => onIssueClick(row.original.key) : undefined}
              style={onIssueClick ? { cursor: "pointer" } : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
