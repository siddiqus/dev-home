export interface SnapshotRow {
  date: string;
  doneCount: number;
  totalCount: number;
}

export interface BurnupPoint extends SnapshotRow {
  ideal: number;
}

export interface Burnup {
  trackingSince: string | null;
  points: BurnupPoint[];
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

export function buildBurnup(rows: SnapshotRow[]): Burnup {
  if (rows.length === 0) return { trackingSince: null, points: [] };
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return { trackingSince: sorted[0].date, points: buildIdealLine(sorted) };
}
