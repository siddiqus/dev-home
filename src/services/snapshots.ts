import { readJson, writeJson } from "../lib/localStore";
import type { SnapshotRow } from "../../shared/burnup";

type SnapshotStore = Record<string, Record<string, { doneCount: number; totalCount: number }>>;

export const SNAPSHOTS_KEY = "sprint_snapshots";

/** Upsert today's sprint completion. One entry per sprint per day. */
export function recordSnapshot(s: {
  sprintId: number;
  date: string;
  doneCount: number;
  totalCount: number;
}): void {
  const store = readJson<SnapshotStore>(SNAPSHOTS_KEY, {});
  store[s.sprintId] = {
    ...store[s.sprintId],
    [s.date]: { doneCount: s.doneCount, totalCount: s.totalCount },
  };
  writeJson(SNAPSHOTS_KEY, store);
}

export function getSnapshotRows(sprintId: number): SnapshotRow[] {
  const bySprint = readJson<SnapshotStore>(SNAPSHOTS_KEY, {})[sprintId] ?? {};
  return Object.entries(bySprint)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
