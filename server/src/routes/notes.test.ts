/**
 * Unit tests for the notes route validation helpers.
 */
import { describe, it, expect } from "vitest";
import { isValidRemindAt } from "./notes";

describe("isValidRemindAt", () => {
  it("returns true for a valid ISO date string", () => {
    expect(isValidRemindAt("2026-07-28T10:00:00Z")).toBe(true);
  });

  it("returns true for null", () => {
    expect(isValidRemindAt(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isValidRemindAt(undefined)).toBe(true);
  });

  it("allows past dates (overdue reminders)", () => {
    expect(isValidRemindAt("2000-01-01T00:00:00Z")).toBe(true);
  });

  it("returns false for a non-date string", () => {
    expect(isValidRemindAt("garbage")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isValidRemindAt("")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isValidRemindAt(1234567890)).toBe(false);
  });

  it("returns false for an object", () => {
    expect(isValidRemindAt({})).toBe(false);
  });
});
