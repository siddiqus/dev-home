import { useEffect, useState } from "react";
import { formatRelativeTime, parseTimestamp } from "../utils/time";
import "./LastUpdated.css";

interface Props {
  /** When the data on screen was fetched (ISO string); nothing shows without one. */
  at: string | undefined;
  /** A refresh is in flight: say so instead of quoting the old time. */
  updating?: boolean;
}

/**
 * "Last updated 5m ago", for beside a Refresh button. It runs its own 30s
 * timer so the label stays current without re-rendering the page around it.
 */
export function LastUpdated({ at, updating = false }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!at || updating) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [at, updating]);

  if (updating) return <span className="last-updated">Updating…</span>;
  if (!at) return null;
  return (
    <span className="last-updated" title={`Last updated ${parseTimestamp(at).toLocaleString()}`}>
      Last updated {formatRelativeTime(at)}
    </span>
  );
}
