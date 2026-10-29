import { describe, it, expect } from "vitest";
import { waitedFor } from "./reviewQueueModel";

describe("waitedFor", () => {
  const now = new Date("2026-10-30T12:00:00Z").getTime();

  it("uses minutes, then hours, then days", () => {
    expect(waitedFor("2026-10-30T11:15:00Z", now)).toBe("45m");
    expect(waitedFor("2026-10-30T07:00:00Z", now)).toBe("5h");
    expect(waitedFor("2026-10-27T11:00:00Z", now)).toBe("3d");
  });

  it("shows a dash without a usable timestamp", () => {
    expect(waitedFor(null, now)).toBe("—");
    expect(waitedFor("not a date", now)).toBe("—");
  });
});
