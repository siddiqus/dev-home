import type { PomodoroPhase } from "../../types";

/** Remaining time as zero-padded "mm:ss", rounding partial seconds up. */
export function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Human label for a phase; callers pick the idle wording ("Ready" vs "Idle"). */
export function phaseLabel(phase: PomodoroPhase, idleLabel: string): string {
  switch (phase) {
    case "work":
      return "Work";
    case "shortBreak":
      return "Short break";
    case "longBreak":
      return "Long break";
    case "idle":
      return idleLabel;
  }
}
