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
