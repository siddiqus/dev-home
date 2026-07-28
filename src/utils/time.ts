/**
 * Formats a date string into a human-readable relative time.
 *
 * Examples: "just now", "3m ago", "2h ago", "5d ago", "2w ago", "3mo ago", "1y ago"
 */
export function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) {
    return "just now";
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  if (days < 7) {
    return `${days}d ago`;
  }

  if (weeks < 5) {
    return `${weeks}w ago`;
  }

  if (months < 12) {
    return `${months}mo ago`;
  }

  return `${years}y ago`;
}

/**
 * Formats a date string as an absolute short date, e.g. "Jul 2, 2026".
 * Returns "" for empty/invalid input so callers can skip rendering.
 */
export function formatShortDate(dateString?: string | null): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Describes a reminder time for a chip/badge.
 *
 * - overdue (remind_at <= now): label like "Overdue 5m ago" (reuses formatRelativeTime)
 * - upcoming: label like "Jul 30, 9:00 AM" (local short date + local time). The year is
 *   included only when the reminder falls outside the current calendar year.
 *
 * Robust to invalid input: returns a muted fallback with overdue=false.
 */
export function describeReminder(
  remindAt: string,
  now: number = Date.now(),
): { label: string; overdue: boolean } {
  const then = new Date(remindAt).getTime();

  if (Number.isNaN(then)) {
    return { label: "No reminder", overdue: false };
  }

  const overdue = then <= now;

  if (overdue) {
    return { label: `Overdue ${formatRelativeTime(remindAt)}`, overdue: true };
  }

  const d = new Date(then);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return { label: `${datePart}, ${timePart}`, overdue: false };
}
