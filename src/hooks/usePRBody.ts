import { useCallback, useEffect, useState } from "react";
import type { GitHubPR } from "../types";
import { fetchPRBody, refreshPRBodyImages } from "../services/github";

export interface PRBodyState {
  body: string;
  loading: boolean;
  /**
   * For a description image that failed to load: its signed URL may have
   * expired, so refetch the body if it's old enough for that.
   */
  onImageError: () => void;
}

/**
 * Description for an open PR modal. List queries omit the (heavy) body, so it's
 * lazy-loaded on first open and cached session-wide by fetchPRBody. PRs that
 * already carry one (single-PR fetches) are used as-is.
 */
export function usePRBody(pr: GitHubPR | null | undefined): PRBodyState {
  const key = pr ? `${pr.repo_full_name}#${pr.number}@${pr.updated_at}` : null;
  const fetchKey = pr && pr.body === undefined ? key : null;
  const [loaded, setLoaded] = useState<{ key: string; text: string } | null>(null);
  // Refetched for fresh image URLs; wins over both the loaded and the PR's own body.
  const [refreshed, setRefreshed] = useState<{ key: string; text: string } | null>(null);

  useEffect(() => {
    if (!fetchKey || !pr) return;
    let cancelled = false;
    fetchPRBody(pr)
      .catch(() => "")
      .then((text) => {
        if (!cancelled) setLoaded({ key: fetchKey, text });
      });
    return () => {
      cancelled = true;
    };
    // `fetchKey` captures everything about `pr` that the fetch depends on.
  }, [fetchKey]);

  const onImageError = useCallback(() => {
    if (!pr || !key) return;
    refreshPRBodyImages(pr)?.then(
      (text) => setRefreshed((r) => (r?.key === key && r.text === text ? r : { key, text })),
      () => {},
    );
  }, [pr, key]);

  if (!pr) return { body: "", loading: false, onImageError };
  if (refreshed?.key === key) return { body: refreshed.text, loading: false, onImageError };
  if (pr.body !== undefined) return { body: pr.body, loading: false, onImageError };
  // Loading is derived from whether the result matches the current key, so a
  // cancelled request can never leave a stuck spinner.
  const ready = loaded?.key === key;
  return { body: ready ? loaded.text : "", loading: !ready, onImageError };
}
