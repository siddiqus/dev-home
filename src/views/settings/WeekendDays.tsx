import React from "react";
import { AppSettings, getWeekendDays } from "../../services/config";

// Listed Monday-first; values are JS getDay() numbers.
const DAYS: { value: number; short: string; label: string }[] = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
];

interface WeekendDaysProps {
  formState: AppSettings;
  setFormState: React.Dispatch<React.SetStateAction<AppSettings>>;
}

/** Which days are off, as a row of toggle chips; drives "since last workday" on Workday. */
export const WeekendDays: React.FC<WeekendDaysProps> = ({ formState, setFormState }) => {
  const weekend = getWeekendDays(formState);

  const toggle = (day: number) => {
    setFormState((prev) => {
      const current = getWeekendDays(prev);
      const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
      return { ...prev, weekendDays: [...new Set(next)].sort((a, b) => a - b) };
    });
  };

  return (
    <div className="weekend-days" role="group" aria-label="Weekend days">
      {DAYS.map((d) => {
        const off = weekend.includes(d.value);
        return (
          <button
            key={d.value}
            type="button"
            className={`weekend-day${off ? " weekend-day--off" : ""}`}
            aria-pressed={off}
            aria-label={d.label}
            title={d.label}
            onClick={() => toggle(d.value)}
          >
            {d.short}
          </button>
        );
      })}
    </div>
  );
};
