import { useEffect, useState } from "react";
import type { JiraIssue } from "../types";
import { fetchIssueDescription } from "../services/jira";

/**
 * Description for an open issue drawer/modal. List endpoints omit the (heavy)
 * description, so it's lazy-loaded on first open and cached session-wide by
 * fetchIssueDescription. Issues that already carry one are used as-is.
 */
export function useIssueDescription(
  issue: JiraIssue | null,
  enabled = true,
): { description: string; loading: boolean } {
  const key = enabled && issue && !issue.description ? issue.key : null;
  const [loaded, setLoaded] = useState<{ key: string; text: string } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetchIssueDescription(key)
      .catch(() => "")
      .then((text) => {
        if (!cancelled) setLoaded({ key, text });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!issue) return { description: "", loading: false };
  if (issue.description) return { description: issue.description, loading: false };
  // Loading is derived from whether the result matches the current key, so a
  // cancelled request can never leave a stuck spinner.
  const ready = loaded?.key === issue.key;
  return { description: ready ? loaded.text : "", loading: !!key && !ready };
}
