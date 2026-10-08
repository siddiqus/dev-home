import React from "react";
import { StatusDot, type StatusDotVariant } from "../../components/primitives/StatusDot";
import type { PomodoroPhase } from "../../types";
import { formatMmSs, phaseLabel } from "./format";
import "./pomodoro.css";

interface PomodoroBadgeProps {
  phase: PomodoroPhase;
  remainingMs: number;
  taskTitle: string | null;
  onClick: () => void;
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

export const PomodoroBadge: React.FC<PomodoroBadgeProps> = ({
  phase,
  remainingMs,
  taskTitle,
  onClick,
}) => {
  const tooltip = taskTitle
    ? `${phaseLabel(phase, "Idle")} · ${taskTitle}`
    : `${phaseLabel(phase, "Idle")} · ${formatMmSs(remainingMs)} remaining`;
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
