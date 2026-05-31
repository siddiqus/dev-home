import React from "react";
import { StatusDot, type StatusDotVariant } from "../../components/primitives/StatusDot";
import type { PomodoroPhase } from "../../types";
import "./pomodoro.css";

interface PomodoroBadgeProps {
  phase: PomodoroPhase;
  remainingMs: number;
  taskTitle: string | null;
  onClick: () => void;
}

function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function phaseVariant(phase: PomodoroPhase): StatusDotVariant {
  switch (phase) {
    case "work":
      return "warning";
    case "shortBreak":
    case "longBreak":
      return "success";
    case "idle":
      return "neutral";
  }
}

function phaseLabel(phase: PomodoroPhase): string {
  switch (phase) {
    case "work":
      return "Work";
    case "shortBreak":
      return "Short break";
    case "longBreak":
      return "Long break";
    case "idle":
      return "Idle";
  }
}

export const PomodoroBadge: React.FC<PomodoroBadgeProps> = ({
  phase,
  remainingMs,
  taskTitle,
  onClick,
}) => {
  const tooltip = taskTitle
    ? `${phaseLabel(phase)} · ${taskTitle}`
    : `${phaseLabel(phase)} · ${formatMmSs(remainingMs)} remaining`;
  return (
    <button
      type="button"
      className="pomodoro-badge"
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
    >
      <StatusDot variant={phaseVariant(phase)} />
      <span>{formatMmSs(remainingMs)}</span>
    </button>
  );
};
