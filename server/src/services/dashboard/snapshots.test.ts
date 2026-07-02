import { describe, it, expect } from "vitest";
import { buildIdealLine } from "./snapshots";
import type { SnapshotRow } from "./snapshots";

describe("buildIdealLine", () => {
  it("single row: ideal equals totalCount", () => {
    const rows: SnapshotRow[] = [
      { date: "2026-07-01", doneCount: 5, totalCount: 20 },
    ];
    const points = buildIdealLine(rows);
    expect(points).toHaveLength(1);
    expect(points[0]).toEqual({
      date: "2026-07-01",
      doneCount: 5,
      totalCount: 20,
      ideal: 20,
    });
  });

  it("two rows: ideal goes from 0 to totalCount", () => {
    const rows: SnapshotRow[] = [
      { date: "2026-07-01", doneCount: 0, totalCount: 30 },
      { date: "2026-07-02", doneCount: 10, totalCount: 30 },
    ];
    const points = buildIdealLine(rows);
    expect(points).toHaveLength(2);
    expect(points[0].ideal).toBe(0);
    expect(points[1].ideal).toBe(30);
  });

  it("multi-row: ideal is a straight line from 0 to final totalCount", () => {
    const rows: SnapshotRow[] = [
      { date: "2026-07-01", doneCount: 0, totalCount: 30 },
      { date: "2026-07-02", doneCount: 5, totalCount: 30 },
      { date: "2026-07-03", doneCount: 10, totalCount: 30 },
      { date: "2026-07-04", doneCount: 20, totalCount: 32 },
      { date: "2026-07-05", doneCount: 28, totalCount: 32 },
    ];
    const points = buildIdealLine(rows);
    expect(points).toHaveLength(5);

    // ideal at index i = round(32 * i / (5-1)) = 32 * i / 4
    expect(points[0].ideal).toBe(0);   // 0
    expect(points[1].ideal).toBe(8);   // 32 / 4 = 8
    expect(points[2].ideal).toBe(16);  // 32 * 2 / 4 = 16
    expect(points[3].ideal).toBe(24);  // 32 * 3 / 4 = 24
    expect(points[4].ideal).toBe(32);  // 32 * 4 / 4 = 32
  });

  it("ideal endpoints: starts at 0, ends at final totalCount", () => {
    const rows: SnapshotRow[] = [
      { date: "2026-07-01", doneCount: 0, totalCount: 15 },
      { date: "2026-07-02", doneCount: 3, totalCount: 15 },
      { date: "2026-07-03", doneCount: 8, totalCount: 18 },
      { date: "2026-07-04", doneCount: 12, totalCount: 18 },
    ];
    const points = buildIdealLine(rows);
    expect(points).toHaveLength(4);
    expect(points[0].ideal).toBe(0);
    expect(points[3].ideal).toBe(18); // final totalCount
  });

  it("preserves all row data in points", () => {
    const rows: SnapshotRow[] = [
      { date: "2026-07-01", doneCount: 2, totalCount: 10 },
      { date: "2026-07-02", doneCount: 5, totalCount: 10 },
    ];
    const points = buildIdealLine(rows);
    expect(points[0]).toMatchObject({
      date: "2026-07-01",
      doneCount: 2,
      totalCount: 10,
    });
    expect(points[1]).toMatchObject({
      date: "2026-07-02",
      doneCount: 5,
      totalCount: 10,
    });
  });
});
