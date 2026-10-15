import { parseTimestamp } from "../../utils/time";

/** "Done since" lookback options on the Workday page. */
export type Lookback = "workday" | "3d" | "7d";
export const LOOKBACKS = ["workday", "3d", "7d"] as const satisfies readonly Lookback[];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const pad = (n: number) => String(n).padStart(2, "0");

/** Local midnight `days` days before `d`'s date. */
function midnightDaysAgo(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - days);
}

/**
 * Local midnight of the most recent day before `now` that isn't a weekend
 * day. Falls back to yesterday when every day is marked as weekend.
 */
export function lastWorkdayStart(now: Date, weekendDays: number[]): Date {
  for (let back = 1; back <= 7; back++) {
    const day = midnightDaysAgo(now, back);
    if (!weekendDays.includes(day.getDay())) return day;
  }
  return midnightDaysAgo(now, 1);
}

/** Start of the "Done since" window for a lookback option. */
export function sinceFor(lookback: Lookback, now: Date, weekendDays: number[]): Date {
  if (lookback === "3d") return midnightDaysAgo(now, 3);
  if (lookback === "7d") return midnightDaysAgo(now, 7);
  return lastWorkdayStart(now, weekendDays);
}

/** Local YYYY-MM-DD. */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** reference_id of the standup note for `now`'s local day. */
export function standupRef(now: Date): string {
  return `standup:${localDate(now)}`;
}

/** e.g. "Thu 8 Oct". */
export function formatSinceLabel(d: Date): string {
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/** Title of the standup note for `now`'s local day, e.g. "Standup · Sun 11 Oct". */
export function standupTitle(now: Date): string {
  return `Standup · ${formatSinceLabel(now)}`;
}

/** JQL date literal "yyyy-MM-dd HH:mm" in local time. */
export function formatJqlDate(d: Date): string {
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Compact age of `iso` relative to `now`: "now", "20m", "5h", "3d", "2w". */
export function compactAge(iso: string, now: Date): string {
  const mins = Math.floor((now.getTime() - parseTimestamp(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 14 ? `${days}d` : `${Math.floor(days / 7)}w`;
}

/** How stale `iso` is: "warm" after a day, "hot" after three, null when fresher. */
export function ageHeat(iso: string, now: Date): "warm" | "hot" | null {
  const days = (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  return days >= 3 ? "hot" : days >= 1 ? "warm" : null;
}
