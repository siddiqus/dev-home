import { describe, it, expect } from "vitest";
import {
  describeReminder,
  inHoursIso,
  tomorrow9amIso,
  isoToDatetimeLocal,
  datetimeLocalToIso,
  parseTimestamp,
} from "./time";

describe("parseTimestamp", () => {
  it("treats a marker-less SQLite datetime as UTC (not local)", () => {
    // SQLite `datetime('now')` output. Must resolve to the same instant as the
    // explicit-UTC form regardless of the viewer's timezone — this is the fix
    // for "just now" rendering as "6h ago" in GMT+6.
    expect(parseTimestamp("2026-07-31 18:24:00").getTime()).toBe(
      new Date("2026-07-31T18:24:00Z").getTime(),
    );
  });

  it("leaves an already-zoned ISO string (Z) untouched", () => {
    expect(parseTimestamp("2026-07-01T00:00:00Z").getTime()).toBe(
      new Date("2026-07-01T00:00:00Z").getTime(),
    );
  });

  it("respects an explicit numeric offset", () => {
    expect(parseTimestamp("2026-07-01T06:00:00+06:00").getTime()).toBe(
      new Date("2026-07-01T00:00:00Z").getTime(),
    );
  });

  it("handles a T-separated datetime with no zone marker as UTC", () => {
    expect(parseTimestamp("2026-07-31T18:24:00").getTime()).toBe(
      new Date("2026-07-31T18:24:00Z").getTime(),
    );
  });

  it("returns an invalid Date for empty input", () => {
    expect(Number.isNaN(parseTimestamp("").getTime())).toBe(true);
  });
});

describe("describeReminder", () => {
  const now = new Date("2026-07-28T12:00:00Z").getTime();

  it("marks a past reminder as overdue with a relative label", () => {
    const remindAt = new Date("2026-07-28T11:55:00Z").toISOString();
    const result = describeReminder(remindAt, now);
    expect(result.overdue).toBe(true);
    // Label is a bare relative phrase from formatRelativeTime (real clock); the
    // overdue state is conveyed by the `overdue` flag / chip styling, not a prefix.
    expect(result.label.toLowerCase()).toMatch(/ago|just now/);
  });

  it("marks a reminder exactly at now as overdue", () => {
    const remindAt = new Date(now).toISOString();
    const result = describeReminder(remindAt, now);
    expect(result.overdue).toBe(true);
  });

  it("marks a clearly-future reminder as not overdue and includes a time", () => {
    const remindAt = new Date("2026-07-30T09:00:00Z").toISOString();
    const result = describeReminder(remindAt, now);
    expect(result.overdue).toBe(false);
    // Should include a time component (contains a colon and am/pm marker)
    expect(result.label).toMatch(/\d/);
    expect(result.label.toLowerCase()).toMatch(/am|pm|:/);
  });

  it("returns a sensible fallback for invalid input", () => {
    const result = describeReminder("not-a-date", now);
    expect(result.overdue).toBe(false);
    expect(typeof result.label).toBe("string");
    expect(result.label.length).toBeGreaterThan(0);
  });
});

describe("inHoursIso", () => {
  const now = new Date("2026-07-28T12:00:00Z").getTime();

  it("returns now + N hours as an ISO-8601 UTC string", () => {
    expect(inHoursIso(1, now)).toBe("2026-07-28T13:00:00.000Z");
    expect(inHoursIso(3, now)).toBe("2026-07-28T15:00:00.000Z");
  });

  it("rolls over across day/month boundaries", () => {
    const late = new Date("2026-07-31T23:00:00Z").getTime();
    expect(inHoursIso(3, late)).toBe("2026-08-01T02:00:00.000Z");
  });
});

describe("isoToDatetimeLocal / datetimeLocalToIso", () => {
  it("returns empty string for null/invalid ISO input", () => {
    expect(isoToDatetimeLocal(null)).toBe("");
    expect(isoToDatetimeLocal("not-a-date")).toBe("");
  });

  it("returns null for empty/invalid datetime-local input", () => {
    expect(datetimeLocalToIso("")).toBeNull();
    expect(datetimeLocalToIso("not-a-date")).toBeNull();
  });

  it("produces a minute-precision, T-separated local value", () => {
    // Local wall-clock, so assert shape rather than an exact (TZ-dependent) value.
    expect(isoToDatetimeLocal("2026-07-28T13:00:00.000Z")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it("round-trips an ISO time with zero seconds back to itself", () => {
    const iso = "2026-07-28T13:00:00.000Z";
    expect(datetimeLocalToIso(isoToDatetimeLocal(iso))).toBe(iso);
  });
});

describe("tomorrow9amIso", () => {
  it("returns tomorrow at 09:00 local time", () => {
    const now = new Date("2026-07-28T12:00:00Z").getTime();
    const result = new Date(tomorrow9amIso(now));

    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);

    // Exactly one calendar day after `now`, in local time.
    const expected = new Date(now);
    expected.setDate(expected.getDate() + 1);
    expect(result.getFullYear()).toBe(expected.getFullYear());
    expect(result.getMonth()).toBe(expected.getMonth());
    expect(result.getDate()).toBe(expected.getDate());
  });
});
