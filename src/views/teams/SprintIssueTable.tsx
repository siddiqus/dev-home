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
}

export function SprintIssueTable({ issues, jiraBaseUrl }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");

  const columns = useMemo(
    () => [
      col.accessor("key", {
        header: "Key",
        cell: (c) => {
          const base = jiraBaseUrl?.replace(/\/+$/, "");
          return base ? (
            <a href={`${base}/browse/${c.getValue()}`} target="_blank" rel="noreferrer">
              {c.getValue()}
            </a>
          ) : (
            c.getValue()
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
          return prs.map((pr) => (
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
          ));
        },
      }),
    ],
    [jiraBaseUrl],
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
            <tr key={row.id}>
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
