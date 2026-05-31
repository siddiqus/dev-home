import React from "react";
import { Button, ButtonGroup } from "react-bootstrap";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconRotateClockwise,
  IconPlayerTrackNextFilled,
  IconX,
} from "@tabler/icons-react";
import type {
  KanbanTile,
  PomodoroPhase,
  PomodoroWorkMinutes,
  PomodoroTaskSnapshot,
} from "../../types";
import { Badge } from "../../components/primitives/Badge";
import { TaskPicker } from "./TaskPicker";
import "./pomodoro.css";

interface PomodoroViewProps {
  columnTiles: KanbanTile[];
  phase: PomodoroPhase;
  workMinutes: PomodoroWorkMinutes;
  cycleCount: number;
  remainingMs: number;
  isRunning: boolean;
  selectedTaskSnapshot: PomodoroTaskSnapshot | null;
  selectedTaskOnBoard: boolean;
  workMinutesOptions: PomodoroWorkMinutes[];
  cyclesBeforeLongBreak: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  setWorkMinutes: (m: PomodoroWorkMinutes) => void;
  selectTask: (tile: KanbanTile | null) => void;
}

function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
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
      return "Ready";
  }
}

export const PomodoroView: React.FC<PomodoroViewProps> = ({
  columnTiles,
  phase,
  workMinutes,
  cycleCount,
  remainingMs,
  isRunning,
  selectedTaskSnapshot,
  selectedTaskOnBoard,
  workMinutesOptions,
  cyclesBeforeLongBreak,
  start,
  pause,
  reset,
  skip,
  setWorkMinutes,
  selectTask,
}) => {
  const displayMs = phase === "idle" && remainingMs === 0 ? workMinutes * 60_000 : remainingMs;

  const handleReset = () => {
    if (isRunning) {
      const ok = window.confirm("Reset the running timer?");
      if (!ok) return;
    }
    reset();
  };

  return (
    <div className="pomodoro-view">
      {/* Active task */}
      <div className="pomodoro-task-row">
        {selectedTaskSnapshot && (
          <div
            className={
              "pomodoro-active-task" + (selectedTaskOnBoard ? "" : " pomodoro-active-task--missing")
            }
          >
            <Badge variant={selectedTaskSnapshot.sourceBadgeVariant}>
              {selectedTaskSnapshot.sourceBadge}
            </Badge>
            <span>{selectedTaskSnapshot.title}</span>
            {!selectedTaskOnBoard && <span>(no longer on board)</span>}
            <button
              type="button"
              className="pomodoro-active-task-clear"
              onClick={() => selectTask(null)}
              title="Clear selected task"
              aria-label="Clear selected task"
            >
              <IconX size={14} />
            </button>
          </div>
        )}
        <TaskPicker
          columnTiles={columnTiles}
          selectedItemId={selectedTaskSnapshot?.itemId ?? null}
          onSelect={selectTask}
        />
      </div>

      {/* Timer display */}
      <div className="pomodoro-timer-display">{formatMmSs(displayMs)}</div>
      <div className="pomodoro-phase-label">{phaseLabel(phase)}</div>
      <div className="pomodoro-cycle-indicator">
        Cycle {Math.min(cycleCount + (phase === "work" ? 1 : 0), cyclesBeforeLongBreak)} of{" "}
        {cyclesBeforeLongBreak}
      </div>

      {/* Duration presets */}
      <ButtonGroup className="pomodoro-presets" aria-label="Work duration">
        {workMinutesOptions.map((m) => (
          <Button
            key={m}
            variant={m === workMinutes ? "secondary" : "outline-secondary"}
            size="sm"
            className="pomodoro-preset-btn"
            disabled={isRunning}
            onClick={() => setWorkMinutes(m)}
          >
            {m}m
          </Button>
        ))}
      </ButtonGroup>

      {/* Controls */}
      <div className="pomodoro-controls">
        {isRunning ? (
          <Button variant="primary" size="sm" onClick={pause}>
            <IconPlayerPauseFilled size={14} /> Pause
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={start}>
            <IconPlayerPlayFilled size={14} /> Start
          </Button>
        )}
        <Button variant="outline-secondary" size="sm" onClick={handleReset}>
          <IconRotateClockwise size={14} /> Reset
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={skip} disabled={phase === "idle"}>
          <IconPlayerTrackNextFilled size={14} /> Skip
        </Button>
      </div>
    </div>
  );
};
