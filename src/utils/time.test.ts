import { describe, it, expect } from "vitest";
import { describeReminder } from "./time";

describe("describeReminder", () => {
  const now = new Date("2026-07-28T12:00:00Z").getTime();

  it("marks a past reminder as overdue with a relative label", () => {
    const remindAt = new Date("2026-07-28T11:55:00Z").toISOString();
    const result = describeReminder(remindAt, now);
    expect(result.overdue).toBe(true);
    // Label reuses formatRelativeTime (real clock), so assert the "Overdue" prefix
    // plus a relative phrase rather than a specific minute count.
    expect(result.label).toMatch(/^Overdue /);
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
