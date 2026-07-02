/**
 * Burn-up history via daily snapshots. There is no changelog/persistence to
 * reconstruct history, so we snapshot {sprintId, date, doneCount, totalCount}
 * once per dashboard load; history accrues from the first load.
 *
 * `recordSnapshot`/`getBurnup` do I/O (SQLite). `buildIdealLine` is pure.
 *
 * STUB: implement upsert-per-day + read + ideal line with TDD.
 * NOTE: the `sprint_snapshots` table is created by a db.ts migration (BE-snapshot).
 */
import type Database from "better-sqlite3";
import type { Burnup, BurnupPoint, SprintInfo } from "./types";

export interface SnapshotRow {
  date: string;
  doneCount: number;
  totalCount: number;
}

/**
 * Insert (or replace) today's snapshot for a sprint. One row per sprint per day.
 * @param today ISO date (YYYY-MM-DD) — passed in for determinism/testability.
 */
export function recordSnapshot(
  db: Database.Database,
  sprintId: number,
  doneCount: number,
  totalCount: number,
  today: string,
): void {
  db.prepare(
    `INSERT INTO sprint_snapshots (sprint_id, snapshot_date, done_count, total_count)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(sprint_id, snapshot_date)
     DO UPDATE SET done_count = excluded.done_count, total_count = excluded.total_count`
  ).run(sprintId, today, doneCount, totalCount);
}

/** Compute the straight ideal line (0 → totalCount) across the point dates. */
export function buildIdealLine(rows: SnapshotRow[]): BurnupPoint[] {
  if (rows.length === 0) {
    return [];
  }

  const finalTotalCount = rows[rows.length - 1].totalCount;

  return rows.map((r, i) => {
    let ideal: number;
    if (rows.length === 1) {
      ideal = finalTotalCount;
    } else {
      ideal = Math.round((finalTotalCount * i) / (rows.length - 1));
    }
    return {
      date: r.date,
      doneCount: r.doneCount,
      totalCount: r.totalCount,
      ideal,
    };
  });
}

export function getBurnup(db: Database.Database, sprint: SprintInfo | null): Burnup {
  if (!sprint) {
    return { trackingSince: null, points: [] };
  }

  const rows = db
    .prepare(
      `SELECT snapshot_date as date, done_count as doneCount, total_count as totalCount
       FROM sprint_snapshots
       WHERE sprint_id = ?
       ORDER BY snapshot_date`
    )
    .all(sprint.id) as SnapshotRow[];

  if (rows.length === 0) {
    return { trackingSince: null, points: [] };
  }

  const points = buildIdealLine(rows);
  const trackingSince = rows[0].date;

  return { trackingSince, points };
}
