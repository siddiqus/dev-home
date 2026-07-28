import React, { useRef } from "react";
import Button from "react-bootstrap/Button";
import { IconBell, IconX, IconCalendar } from "@tabler/icons-react";
import {
  describeReminder,
  inHoursIso,
  tomorrow9amIso,
  isoToDatetimeLocal,
  datetimeLocalToIso,
} from "../utils/time";

interface ReminderControlProps {
  /** Current reminder time as ISO-8601 UTC, or null when unset. */
  value: string | null;
  /** Called with the new ISO time, or null when cleared. */
  onChange: (iso: string | null) => void;
}

/**
 * Icon-only reminder picker. A bell sits on the left; while unset it's followed
 * by preset buttons (In 1h / In 3h / Tomorrow 9am). Once a time is picked the
 * presets collapse to a chip showing the chosen time with a clear (✕) button.
 *
 * A calendar icon opens the native date/time picker for choosing an exact time;
 * it lives behind an otherwise-hidden <input type="datetime-local"> so the row
 * stays icon-only (no always-visible text field).
 */
export const ReminderControl: React.FC<ReminderControlProps> = ({ value, onChange }) => {
  const reminder = value ? describeReminder(value) : null;
  const pickerRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    // showPicker() (Chromium/Electron) opens the native calendar anchored to the
    // input. Fall back to focus() where it isn't available.
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  // Hidden native picker, kept inline so the popup anchors next to the icon.
  const hiddenPicker = (
    <input
      ref={pickerRef}
      type="datetime-local"
      aria-label="Pick a reminder date and time"
      value={value ? isoToDatetimeLocal(value) : ""}
      onChange={(e) => onChange(datetimeLocalToIso(e.target.value))}
      style={{
        width: 0,
        padding: 0,
        margin: 0,
        border: "none",
        opacity: 0,
        pointerEvents: "none",
      }}
      tabIndex={-1}
    />
  );

  const calendarButton = (
    <Button
      variant="outline-secondary"
      size="sm"
      title="Pick a specific date & time"
      onClick={openPicker}
    >
      <IconCalendar size={14} stroke={1.8} />
    </Button>
  );

  return (
    <div
      className="d-flex align-items-center gap-2"
      style={{ fontSize: "0.8125rem", flexWrap: "wrap" }}
    >
      <span className="d-flex align-items-center text-secondary-custom" title="Reminder">
        <IconBell size={14} stroke={1.8} />
      </span>

      {value ? (
        <>
          <span
            className={`d-flex align-items-center ${
              reminder?.overdue ? "text-danger" : "text-secondary-custom"
            }`}
            style={{ whiteSpace: "nowrap", fontWeight: reminder?.overdue ? 600 : 400 }}
          >
            {reminder?.label}
          </span>
          {calendarButton}
          {hiddenPicker}
          <Button
            variant="outline-secondary"
            size="sm"
            title="Clear reminder"
            onClick={() => onChange(null)}
          >
            <IconX size={14} stroke={1.8} />
          </Button>
        </>
      ) : (
        <>
          {calendarButton}
          <Button variant="outline-secondary" size="sm" onClick={() => onChange(inHoursIso(3))}>
            In 3h
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={() => onChange(tomorrow9amIso())}>
            Tomorrow 9am
          </Button>
          {hiddenPicker}
        </>
      )}
    </div>
  );
};
