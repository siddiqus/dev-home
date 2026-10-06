import React, { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { JiraIssue } from "../types";
import { fetchIssuesByKeys } from "../services/jira";
import { JiraIssueDrawer } from "../components/JiraIssueDrawer";
import { LoadingOverlay } from "../components/LoadingOverlay";

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
  const [loading, setLoading] = useState(false);
  // Only the latest click wins if several fetches overlap.
  const requestId = useRef(0);

  const openIssue = useCallback<OpenJiraIssue>((key) => {
    const id = ++requestId.current;
    setIssue(null);
    setLoading(true);
    fetchIssuesByKeys([key])
      .then((issues) => {
        if (id === requestId.current && issues[0]) setIssue(issues[0]);
      })
      .catch(() => {
        if (id === requestId.current) setIssue(null);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, []);

  const hide = useCallback(() => setIssue(null), []);

  return (
    <JiraDrawerContext.Provider value={openIssue}>
      {children}
      <LoadingOverlay show={loading} label="Loading…" />
      <JiraIssueDrawer issue={issue} show={!!issue} onHide={hide} baseUrl={baseUrl} />
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
    openIssue(ticket);
  };
}
