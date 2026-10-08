import { useEffect, useState } from "react";
import type { GitHubPR } from "../types";
import { fetchPRBody } from "../services/github";

/**
 * Description for an open PR modal. List queries omit the (heavy) body, so it's
 * lazy-loaded on first open and cached session-wide by fetchPRBody. PRs that
 * already carry one (single-PR fetches) are used as-is.
 */
export function usePRBody(pr: GitHubPR | null | undefined): { body: string; loading: boolean } {
  const needsFetch = !!pr && pr.body === undefined;
  const key = needsFetch ? `${pr.repo_full_name}#${pr.number}@${pr.updated_at}` : null;
  const [loaded, setLoaded] = useState<{ key: string; text: string } | null>(null);

  useEffect(() => {
    if (!key || !pr) return;
    let cancelled = false;
    fetchPRBody(pr)
      .catch(() => "")
      .then((text) => {
        if (!cancelled) setLoaded({ key, text });
      });
    return () => {
      cancelled = true;
    };
    // `key` captures everything about `pr` that the fetch depends on.
  }, [key]);

  if (!pr) return { body: "", loading: false };
  if (pr.body !== undefined) return { body: pr.body, loading: false };
  // Loading is derived from whether the result matches the current key, so a
  // cancelled request can never leave a stuck spinner.
  const ready = loaded?.key === key;
  return { body: ready ? loaded.text : "", loading: !ready };
}
