import React, { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { JiraIssue } from "../types";
import { fetchIssueDetail } from "../services/jira";
import { JiraIssueDrawer } from "../components/JiraIssueDrawer";

/** Opens the shared Jira issue drawer for a ticket key. */
export type OpenJiraIssue = (key: string) => void;

const JiraDrawerContext = createContext<OpenJiraIssue | null>(null);

/**
 * Renders a single app-level Jira drawer and exposes `openIssue(key)` so ticket
 * links anywhere (PR titles, Jira group headers) can show the issue in place
 * instead of navigating away to Jira.
 */
export function JiraDrawerProvider({
  baseUrl,
  children,
}: {
  baseUrl?: string;
  children: ReactNode;
}) {
  const [issue, setIssue] = useState<JiraIssue | null>(null);
  // Key being fetched; the drawer opens on it right away with a spinner.
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  // The last open that failed: the drawer stays on it with the reason, not closing on its own.
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  // Only the latest click wins if several fetches overlap.
  const requestId = useRef(0);

  const openIssue = useCallback<OpenJiraIssue>((key) => {
    const id = ++requestId.current;
    setIssue(null);
    setReloading(false);
    setError(null);
    setLoadingKey(key);
    fetchIssueDetail(key)
      .then((fetched) => {
        if (id !== requestId.current) return;
        if (fetched) setIssue(fetched);
        else setError({ key, message: `${key} wasn't found in Jira.` });
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        setIssue(null);
        setError({ key, message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        if (id === requestId.current) setLoadingKey(null);
      });
  }, []);

  // Refetch in place: the drawer stays open on the cached issue until fresh data lands.
  // After a failed open, Reload tries that open again.
  const reload = useCallback(() => {
    if (!issue) {
      if (error) openIssue(error.key);
      return;
    }
    const id = ++requestId.current;
    setReloading(true);
    fetchIssueDetail(issue.key, { force: true })
      .then((fetched) => {
        if (id === requestId.current && fetched) setIssue(fetched);
      })
      .catch(() => {})
      .finally(() => {
        if (id === requestId.current) setReloading(false);
      });
  }, [issue, error, openIssue]);

  const hide = useCallback(() => {
    requestId.current++;
    setIssue(null);
    setLoadingKey(null);
    setReloading(false);
    setError(null);
  }, []);

  return (
    <JiraDrawerContext.Provider value={openIssue}>
      {children}
      <JiraIssueDrawer
        issue={issue}
        show={!!issue}
        onHide={hide}
        baseUrl={baseUrl}
        onReload={reload}
        reloading={reloading}
        loadingKey={loadingKey}
        error={error}
      />
    </JiraDrawerContext.Provider>
  );
}

/** `openIssue` when inside a JiraDrawerProvider, else null (callers fall back to a Jira link). */
export function useOptionalJiraDrawer(): OpenJiraIssue | null {
  return useContext(JiraDrawerContext);
}

/**
 * Click handler for a ticket link: a plain left click opens the drawer, while
 * modified/middle clicks keep the native "open Jira in a new tab" behaviour.
 */
export function ticketClickHandler(openIssue: OpenJiraIssue | null, ticket: string) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    if (!openIssue || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // Pointer clicks (detail > 0) blur so the drawer doesn't hand focus back on
    // close and leave a ring; keyboard activation keeps focus for a11y.
    if (e.detail > 0) e.currentTarget.blur();
    openIssue(ticket);
  };
}
