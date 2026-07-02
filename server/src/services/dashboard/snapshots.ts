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
  _db: Database.Database,
  _sprintId: number,
  _doneCount: number,
  _totalCount: number,
  _today: string,
): void {
  // TODO(BE-snapshot): INSERT OR REPLACE INTO sprint_snapshots (...).
}

/** Compute the straight ideal line (0 → totalCount) across the point dates. */
export function buildIdealLine(rows: SnapshotRow[]): BurnupPoint[] {
  // TODO(BE-snapshot): map rows to points with an interpolated ideal.
  return rows.map((r) => ({
    date: r.date,
    doneCount: r.doneCount,
    totalCount: r.totalCount,
    ideal: 0,
  }));
}

export function getBurnup(_db: Database.Database, sprint: SprintInfo | null): Burnup {
  // TODO(BE-snapshot): SELECT rows for sprint.id ordered by date; buildIdealLine.
  void sprint;
  return { trackingSince: null, points: [] };
}
