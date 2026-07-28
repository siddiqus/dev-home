import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Note } from "../types";
import { selectDueReminders, useReminderScheduler } from "./useReminderScheduler";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    type: "free_text",
    title: "A reminder",
    content: "body",
    reference_id: null,
    resolved: 0,
    pinned: 0,
    remind_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = 1_000_000_000_000; // fixed reference "now" in ms

describe("selectDueReminders", () => {
  it("excludes notes with remind_at === null", () => {
    const notes = [makeNote({ id: 1, remind_at: null })];
    const { dueIds, toNotify } = selectDueReminders(notes, NOW, new Set());
    expect(dueIds.size).toBe(0);
    expect(toNotify).toHaveLength(0);
  });

  it("excludes resolved notes (resolved === 1) even if past-due", () => {
    const past = new Date(NOW - 60_000).toISOString();
    const notes = [makeNote({ id: 1, remind_at: past, resolved: 1 })];
    const { dueIds, toNotify } = selectDueReminders(notes, NOW, new Set());
    expect(dueIds.size).toBe(0);
    expect(toNotify).toHaveLength(0);
  });

  it("excludes notes whose remind_at is in the future", () => {
    const future = new Date(NOW + 60_000).toISOString();
    const notes = [makeNote({ id: 1, remind_at: future })];
    const { dueIds, toNotify } = selectDueReminders(notes, NOW, new Set());
    expect(dueIds.size).toBe(0);
    expect(toNotify).toHaveLength(0);
  });

  it("includes notes whose remind_at is in the past", () => {
    const past = new Date(NOW - 60_000).toISOString();
    const notes = [makeNote({ id: 7, remind_at: past })];
    const { dueIds, toNotify } = selectDueReminders(notes, NOW, new Set());
    expect(dueIds.has(7)).toBe(true);
    expect(dueIds.size).toBe(1);
    expect(toNotify).toHaveLength(1);
    expect(toNotify[0].id).toBe(7);
  });

  it("includes notes whose remind_at is exactly equal to now (<= boundary)", () => {
    const exact = new Date(NOW).toISOString();
    const notes = [makeNote({ id: 3, remind_at: exact })];
    const { dueIds, toNotify } = selectDueReminders(notes, NOW, new Set());
    expect(dueIds.has(3)).toBe(true);
    expect(toNotify.map((n) => n.id)).toEqual([3]);
  });

  it("dueIds contains ALL due notes while a mix is present", () => {
    const past = new Date(NOW - 1000).toISOString();
    const future = new Date(NOW + 1000).toISOString();
    const notes = [
      makeNote({ id: 1, remind_at: past }),
      makeNote({ id: 2, remind_at: future }),
      makeNote({ id: 3, remind_at: past, resolved: 1 }),
      makeNote({ id: 4, remind_at: null }),
      makeNote({ id: 5, remind_at: past }),
    ];
    const { dueIds } = selectDueReminders(notes, NOW, new Set());
    expect([...dueIds].sort((a, b) => a - b)).toEqual([1, 5]);
  });

  it("toNotify excludes notes whose dedup key is already in `notified`", () => {
    const past = new Date(NOW - 1000).toISOString();
    const notes = [makeNote({ id: 1, remind_at: past }), makeNote({ id: 2, remind_at: past })];
    const notified = new Set<string>([`1:${past}`]);
    const { dueIds, toNotify } = selectDueReminders(notes, NOW, notified);
    // both are still "due"
    expect([...dueIds].sort((a, b) => a - b)).toEqual([1, 2]);
    // only #2 should notify (its key is not in `notified`)
    expect(toNotify.map((n) => n.id)).toEqual([2]);
  });

  it("re-arms when remind_at changes: a new key becomes notifiable again", () => {
    const first = new Date(NOW - 5000).toISOString();
    const second = new Date(NOW - 1000).toISOString();
    const notified = new Set<string>([`1:${first}`]);

    // With the original key present, the original note does not notify.
    const originalNote = makeNote({ id: 1, remind_at: first });
    expect(selectDueReminders([originalNote], NOW, notified).toNotify).toHaveLength(0);

    // After rescheduling (new remind_at), the dedup key differs → notifiable again.
    const rescheduled = makeNote({ id: 1, remind_at: second });
    const { dueIds, toNotify } = selectDueReminders([rescheduled], NOW, notified);
    expect(dueIds.has(1)).toBe(true);
    expect(toNotify.map((n) => n.id)).toEqual([1]);
  });
});

describe("useReminderScheduler", () => {
  let notifySpy: Mock<(title: string, options?: { body?: string }) => void>;
  let requestPermissionSpy: Mock<() => Promise<string>>;

  beforeEach(() => {
    vi.useFakeTimers();
    notifySpy = vi.fn();
    requestPermissionSpy = vi.fn(() => Promise.resolve("granted"));
    // Minimal Notification mock: permission granted, records constructions.
    class MockNotification {
      static permission = "granted";
      static requestPermission = requestPermissionSpy;
      constructor(title: string, options?: { body?: string }) {
        notifySpy(title, options);
      }
    }
    // @ts-expect-error assigning test double onto global
    global.Notification = MockNotification;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // @ts-expect-error clean up test double
    delete global.Notification;
  });

  it("does NOT desktop-notify reminders overdue at launch, but counts them in dueCount", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const notes = [makeNote({ id: 1, remind_at: past })];

    const { result } = renderHook(() => useReminderScheduler(notes));

    // Overdue-at-launch: surfaced in-app (dueCount) but no desktop notification.
    expect(result.current.dueCount).toBe(1);
    expect(notifySpy).not.toHaveBeenCalled();

    // Even after a tick, the seeded key suppresses the notification.
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(notifySpy).not.toHaveBeenCalled();
    expect(result.current.dueCount).toBe(1);
  });

  it("fires exactly one desktop notification for a reminder that becomes due after a tick", () => {
    // Due 10s in the future — not due at mount.
    const soon = new Date(Date.now() + 10_000).toISOString();
    const notes = [makeNote({ id: 42, title: "Ping me", remind_at: soon })];

    const { result } = renderHook(() => useReminderScheduler(notes));
    expect(result.current.dueCount).toBe(0);
    expect(notifySpy).not.toHaveBeenCalled();

    // Advance past the reminder time and through a tick (15s interval).
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith("Ping me", { body: "Reminder" });
    expect(result.current.dueCount).toBe(1);

    // A subsequent tick must not re-fire (deduped).
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(notifySpy).toHaveBeenCalledTimes(1);
  });

  it("requests notification permission on mount when permission is 'default'", () => {
    // @ts-expect-error override the static for this case
    global.Notification.permission = "default";
    const notes = [makeNote({ id: 1, remind_at: null })];
    renderHook(() => useReminderScheduler(notes));
    expect(requestPermissionSpy).toHaveBeenCalled();
  });

  it("clears the interval on unmount (no further notifications)", () => {
    const soon = new Date(Date.now() + 10_000).toISOString();
    const notes = [makeNote({ id: 5, remind_at: soon })];
    const { unmount } = renderHook(() => useReminderScheduler(notes));

    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
