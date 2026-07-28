import { useEffect, useRef, useState } from "react";
import type { Note } from "../types";
import { getNoteDisplayTitle } from "../utils/text";

const TICK_MS = 15_000;

/** Stable dedup key for a reminder firing: id + the exact scheduled time. */
function reminderKey(note: Note): string {
  return `${note.id}:${note.remind_at}`;
}

/**
 * Pure selection of due reminders.
 *
 * A note is "due" when it has a `remind_at`, is unresolved, and its scheduled
 * time is at or before `now`. `dueIds` is every due note (for in-app
 * surfacing); `toNotify` is the subset whose dedup key has not already been
 * recorded in `notified` (so each firing notifies at most once).
 */
export function selectDueReminders(
  notes: Note[],
  now: number,
  notified: Set<string>,
): { dueIds: Set<number>; toNotify: Note[] } {
  const dueIds = new Set<number>();
  const toNotify: Note[] = [];

  for (const note of notes) {
    if (note.remind_at === null) continue;
    if (note.resolved !== 0) continue;
    if (new Date(note.remind_at).getTime() > now) continue;

    dueIds.add(note.id);
    if (!notified.has(reminderKey(note))) {
      toNotify.push(note);
    }
  }

  return { dueIds, toNotify };
}

function fireNotification(note: Note): void {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(getNoteDisplayTitle(note), { body: "Reminder" });
    }
  } catch {
    /* swallow notification errors (permission/quota/etc.) */
  }
}

/**
 * Client-side reminder scheduler. While the app is open, fires exactly one
 * desktop notification when a reminder's time arrives. Reminders that were
 * already overdue at launch are NOT desktop-notified (they're pre-seeded into
 * the notified set) but still count toward `dueCount` for in-app surfacing.
 */
export function useReminderScheduler(notes: Note[]): { dueCount: number } {
  const [dueCount, setDueCount] = useState(0);

  // Latest notes, read inside the interval tick so we never recreate the
  // interval (or re-seed) when the notes array changes identity.
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const notifiedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  // Mount-only: request permission and pre-seed the notified set with every
  // reminder that is already due, so launch-time overdue reminders don't fire.
  if (!seededRef.current) {
    seededRef.current = true;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    const { toNotify } = selectDueReminders(notes, Date.now(), notifiedRef.current);
    for (const note of toNotify) {
      notifiedRef.current.add(reminderKey(note));
    }
  }

  // Stable interval created once. The tick reads the latest notes via the ref.
  useEffect(() => {
    const tick = () => {
      const result = selectDueReminders(notesRef.current, Date.now(), notifiedRef.current);
      for (const note of result.toNotify) {
        fireNotification(note);
        notifiedRef.current.add(reminderKey(note));
      }
      setDueCount(result.dueIds.size);
    };

    tick(); // run once immediately after mount/seed
    const intervalId = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  // When the notes array changes (new/edited/resolved reminders), run one
  // immediate pass so changes are picked up before the next interval tick.
  // This does NOT re-seed the notified set — seeding is mount-only above.
  useEffect(() => {
    const result = selectDueReminders(notes, Date.now(), notifiedRef.current);
    for (const note of result.toNotify) {
      fireNotification(note);
      notifiedRef.current.add(reminderKey(note));
    }
    setDueCount(result.dueIds.size);
  }, [notes]);

  return { dueCount };
}
