import { beforeEach, describe, expect, it } from "vitest";
import { getSnapshotRows, recordSnapshot } from "./snapshots";

describe("sprint snapshots", () => {
  beforeEach(() => localStorage.clear());

  it("upserts one row per sprint per day, sorted by date", () => {
    recordSnapshot({ sprintId: 7, date: "2026-09-02", doneCount: 1, totalCount: 5 });
    recordSnapshot({ sprintId: 7, date: "2026-09-01", doneCount: 0, totalCount: 5 });
    recordSnapshot({ sprintId: 7, date: "2026-09-02", doneCount: 3, totalCount: 6 });
    recordSnapshot({ sprintId: 8, date: "2026-09-02", doneCount: 9, totalCount: 9 });
    expect(getSnapshotRows(7)).toEqual([
      { date: "2026-09-01", doneCount: 0, totalCount: 5 },
      { date: "2026-09-02", doneCount: 3, totalCount: 6 },
    ]);
  });
});
