import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import {
  IconCode,
  IconRefresh,
  IconSettings,
  IconLayoutDashboard,
  IconColumns3,
  IconNotes,
  IconSubtask,
  IconSearch,
  IconAt,
  IconGitPullRequest,
  IconEye,
  IconBuilding,
  IconClock,
  IconTarget,
  IconUsersGroup,
  IconChartBar,
  IconSun,
  IconMoon,
  IconFilePlus,
  type Icon,
} from "@tabler/icons-react";
import { useConfig } from "./hooks/useConfig";
import { useTheme } from "./hooks/useTheme";
import { useDashboard } from "./hooks/useDashboard";
import { useNotes } from "./hooks/useNotes";
import { useReminderScheduler } from "./hooks/useReminderScheduler";
import { useFocus } from "./hooks/useFocus";
import { AppProviders } from "./context/AppProviders";
import { FocusView } from "./components/FocusView";
import { SummaryView } from "./views/summary/SummaryView";
import { JiraTasks } from "./components/JiraTasks";
import { JiraIssueSearch } from "./components/JiraIssueSearch";
import { JiraMentionsView } from "./views/mentions/JiraMentionsView";
import { GitHubMentionsView } from "./views/mentions/GitHubMentionsView";
import { PRsView } from "./views/prs/PRsView";
import { ReviewsView } from "./views/reviews/ReviewsView";
import { PersonalNotes } from "./views/notes/PersonalNotes";
import { NoteEditorModal } from "./views/notes/NoteEditorModal";
import { SettingsView } from "./views/settings/SettingsView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateToast } from "./components/UpdateToast";
import { useKanban } from "./hooks/useKanban";
import { KanbanBoard } from "./views/kanban/KanbanBoard";
import { OrgPRsView } from "./views/orgPRs/OrgPRsView";
import { TeamsView } from "./views/teams/TeamsView";
import { TeamDashboardView } from "./views/teams/TeamDashboardView";
import { usePomodoro } from "./hooks/usePomodoro";
import { PomodoroView } from "./views/pomodoro/PomodoroView";
import { PomodoroBadge } from "./views/pomodoro/PomodoroBadge";
import type { FocusableItem } from "./types";
import { getReferenceUrl, getNoteDisplayTitle } from "./utils/text";
import { NAV_GROUPS, isTabVisible } from "./config/navTabs";
import { sourcesFor, isRemoteSource, PAGE_REFRESH, type DataSource } from "./config/tabData";
import { useKeyboardShortcuts, getShortcutTitle, isMac } from "./hooks/useKeyboardShortcuts";
import { jiraBrowseUrl } from "./utils/tickets";
import { prNoteKey } from "./utils/prNotes";

// Compact "time since last refresh" label for the sidebar refresh button.
function formatAgo(ts: number, now: number): string {
  const mins = Math.floor(Math.max(0, now - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return "1 hr ago";
  if (hrs < 24) return `${hrs} hrs ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("dev-home-active-tab") || "summary";
  });
  const prevTabRef = useRef(activeTab !== "settings" ? activeTab : "summary");
  useEffect(() => {
    localStorage.setItem("dev-home-active-tab", activeTab);
    if (activeTab !== "settings") {
      prevTabRef.current = activeTab;
    }
  }, [activeTab]);
  // Team id to pre-select when navigating into the team dashboard from a team row.
  const [dashboardTeamId, setDashboardTeamId] = useState<number | null>(null);
  const openTeamDashboard = (teamId: number) => {
    setDashboardTeamId(teamId);
    setActiveTab("team-dashboard");
  };
  // useTheme() applies the stored/OS theme and keeps it live. The topbar exposes a
  // quick light/dark toggle; Settings' ThemePicker drives the full choice (incl. "system").
  const {
    preference: themePreference,
    setPreference: setThemePreference,
    resolvedTheme,
    toggleTheme,
  } = useTheme();
  const {
    configured,
    loading: configLoading,
    backendOnline,
    backendVersion,
    jiraBaseUrl,
    githubUsername,
    githubOrg,
    hiddenTabs,
    saveSettings,
  } = useConfig();

  // If config isn't loaded yet, show settings first. If the active tab is
  // unknown (e.g. a stale saved key), hidden, or missing its prerequisites,
  // fall back to summary.
  const effectiveTab =
    !configured && !configLoading
      ? "settings"
      : isTabVisible(activeTab, { hiddenTabs, githubOrg })
        ? activeTab
        : "summary";

  // Data sources the current tab needs (src/config/tabData.ts). Drives lazy
  // loading, per-tab hook gating, sidebar badges, and the scoped Refresh button.
  const boardEnabled = !hiddenTabs.includes("board");
  const activeSources = useMemo(
    () => new Set(sourcesFor(effectiveTab, { boardEnabled })),
    [effectiveTab, boardEnabled],
  );

  const {
    jiraIssues,
    assignedJiraIssues,
    jiraComments,
    githubMentions,
    openPRs,
    reviewRequests,
    reviewingPRs,
    loadedSources,
    loading,
    jiraIssuesLoading,
    jiraCommentsLoading,
    githubMentionsLoading,
    openPRsLoading,
    reviewRequestsLoading,
    error,
    ensure,
    refresh,
    refreshKey,
  } = useDashboard(configured);
  const notesApi = useNotes(configured);
  const {
    notes,
    unresolvedNotes,
    loading: notesLoading,
    loaded: notesLoaded,
    addNote,
    editNote,
    resolveNote,
    unresolveNote,
    pinNote,
    unpinNote,
    removeNote,
    refresh: refreshNotes,
  } = notesApi;
  // App-level so reminders fire regardless of the active tab. dueReminderCount
  // drives the Notes sidebar badge and updates ~every 15s as reminders come due.
  const { dueCount: dueReminderCount } = useReminderScheduler(notes, notesLoaded);
  const kanbanNotes = useMemo(
    () =>
      unresolvedNotes.filter((n) => {
        const firstLine = (n.content || "").split("\n")[0].trimStart();
        return /^#[Tt]odo\b/.test(firstLine);
      }),
    [unresolvedNotes],
  );
  const {
    columnTiles,
    loading: kanbanLoading,
    doneItemIds,
    moveItem: kanbanMoveItem,
    refresh: refreshKanban,
  } = useKanban({
    active: configured && activeSources.has("kanban"),
    openPRs,
    reviewRequests,
    notes: kanbanNotes,
    prsLoaded: loadedSources.has("openPRs"),
    reviewsLoaded: loadedSources.has("reviewRequests"),
    notesLoaded,
    jiraBaseUrl,
    onResolveNote: resolveNote,
    onUnresolveNote: unresolveNote,
  });
  const {
    groups: focusGroups,
    loading: focusLoading,
    offline: focusOffline,
    pin: pinFocusItem,
    snooze: snoozeFocusItem,
    dismiss: dismissFocusItem,
  } = useFocus({
    active: configured && activeSources.has("focusState"),
    openPRs,
    reviewRequests,
    jiraIssues: assignedJiraIssues,
    jiraComments,
    githubMentions,
    notes: unresolvedNotes,
    jiraBaseUrl,
  });

  // Lazily load the remote sources the active tab needs. Idempotent: sources
  // already loaded (or in flight) are skipped. Local sources (notes/kanban/
  // focusState) are gated via the hooks above.
  useEffect(() => {
    if (!configured) return;
    ensure(sourcesFor(effectiveTab, { boardEnabled }));
  }, [configured, effectiveTab, boardEnabled, ensure]);

  // Refresh only the currently viewed tab's data (plus its local sources), and
  // bump refreshKey so self-fetching views (PRs, Org PRs) reload too.
  const handleRefresh = useCallback(() => {
    const sources = sourcesFor(effectiveTab, { boardEnabled });
    refresh(sources);
    if (sources.includes("notes")) refreshNotes();
    if (sources.includes("kanban")) refreshKanban();
  }, [effectiveTab, boardEnabled, refresh, refreshNotes, refreshKanban]);

  // Top-bar refresh for pages whose data can be fetched on its own: refetches
  // only that page's primary source(s), skipping enrichment deps (e.g. Jira for
  // My PRs). refresh() also bumps refreshKey, so PRsView's recently-merged list
  // reloads too.
  const sourceLoading: Partial<Record<DataSource, boolean>> = {
    openPRs: openPRsLoading,
    reviewRequests: reviewRequestsLoading,
    githubMentions: githubMentionsLoading,
    jiraIssues: jiraIssuesLoading,
    jiraComments: jiraCommentsLoading,
    notes: notesLoading,
  };
  const pageRefresh = PAGE_REFRESH[effectiveTab];
  const pageRefreshing = pageRefresh?.sources.some((s) => sourceLoading[s]) ?? false;
  const handlePageRefresh = useCallback(() => {
    if (!pageRefresh) return;
    const remote = pageRefresh.sources.filter(isRemoteSource);
    if (remote.length > 0) refresh(remote);
    if (pageRefresh.sources.includes("notes")) refreshNotes();
  }, [pageRefresh, refresh, refreshNotes]);

  // Track when the last refresh finished, and re-render every 30s so the
  // "(x mins ago)" label next to the Refresh button stays current.
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const anyLoading = loading || notesLoading || kanbanLoading;
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !anyLoading) {
      const now = Date.now();
      setLastRefreshed(now);
      setNowTs(now);
    }
    wasLoadingRef.current = anyLoading;
  }, [anyLoading]);
  useEffect(() => {
    if (lastRefreshed == null) return;
    const id = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(id);
  }, [lastRefreshed]);

  // Build focusable items for the Pomodoro picker from every loaded source.
  const focusableItems = useMemo<FocusableItem[]>(() => {
    const items: FocusableItem[] = [];
    const seen = new Set<string>();
    const push = (item: FocusableItem) => {
      const key = `${item.group}:${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    };

    for (const pr of openPRs) {
      push({
        id: prNoteKey(pr),
        group: "prs",
        title: `#${pr.number} ${pr.title}`,
        sourceBadge: "PR",
        sourceBadgeVariant: "success",
        url: pr.html_url,
      });
    }

    for (const r of reviewRequests) {
      push({
        id: prNoteKey(r),
        group: "reviews",
        title: `#${r.number} ${r.title}`,
        sourceBadge: "Review",
        sourceBadgeVariant: "warning",
        url: r.html_url,
      });
    }

    for (const issue of assignedJiraIssues) {
      push({
        id: issue.key,
        group: "jira",
        title: `${issue.key} ${issue.summary || ""}`.trim(),
        sourceBadge: "JIRA",
        sourceBadgeVariant: "info",
        url: jiraBrowseUrl(jiraBaseUrl, issue.key) ?? "",
      });
    }

    for (const m of githubMentions) {
      push({
        id: String(m.id),
        group: "mentions",
        title: m.context_title || m.body.slice(0, 80),
        sourceBadge: "Mention",
        sourceBadgeVariant: "purple",
        url: m.html_url,
      });
    }
    for (const c of jiraComments) {
      push({
        id: c.id,
        group: "mentions",
        title: `${c.issueKey} ${c.issueSummary}`,
        sourceBadge: "Mention",
        sourceBadgeVariant: "purple",
        url: jiraBrowseUrl(jiraBaseUrl, c.issueKey) ?? "",
      });
    }

    for (const n of unresolvedNotes) {
      if (n.type === "free_text") continue;
      push({
        id: String(n.id),
        group: "notes",
        title: getNoteDisplayTitle(n),
        sourceBadge: n.type === "jira_ticket" ? "JIRA" : n.type === "github_pr" ? "PR" : "Link",
        sourceBadgeVariant:
          n.type === "jira_ticket" ? "info" : n.type === "github_pr" ? "success" : "neutral",
        url: getReferenceUrl(n, jiraBaseUrl) || "",
      });
    }

    return items;
  }, [
    openPRs,
    reviewRequests,
    assignedJiraIssues,
    githubMentions,
    jiraComments,
    unresolvedNotes,
    jiraBaseUrl,
  ]);

  const pomodoro = usePomodoro({ focusableItems });

  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [openNote, setOpenNote] = useState<import("./types").Note | null>(null);

  // ⌘⇧N opens a blank editor, but never clobbers one that's already open.
  const showNoteEditorRef = useRef(showNoteEditor);
  showNoteEditorRef.current = showNoteEditor;
  const handleNewNote = useCallback(() => {
    if (showNoteEditorRef.current) return;
    setOpenNote(null);
    setShowNoteEditor(true);
  }, []);
  useKeyboardShortcuts(setActiveTab, handleNewNote);

  return (
    <AppProviders notesApi={notesApi} jiraBaseUrl={jiraBaseUrl}>
      {/* Thin top bar with app name and refresh */}
      <Navbar className="top-bar" variant="dark">
        <Container
          fluid
          className="px-3"
          style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}
        >
          <div />
          <Navbar.Brand
            className="d-flex align-items-center gap-2 mx-auto mb-0"
            style={{ fontSize: "0.8125rem", fontWeight: 600 }}
          >
            <IconCode size={16} />
            Dev Home
          </Navbar.Brand>
          <div className="d-flex align-items-center gap-2 justify-content-end">
            {pomodoro.phase !== "idle" && (
              <PomodoroBadge
                phase={pomodoro.phase}
                remainingMs={pomodoro.remainingMs}
                taskTitle={pomodoro.selectedTaskSnapshot?.title ?? null}
                onClick={() => setActiveTab("pomodoro")}
              />
            )}
            {pageRefresh ? (
              <button
                type="button"
                className="top-bar-icon-btn"
                onClick={handlePageRefresh}
                disabled={pageRefreshing}
                title={pageRefresh.label}
                aria-label={pageRefresh.label}
              >
                <IconRefresh
                  size={16}
                  className={
                    pageRefreshing ? "sidebar-refresh-icon spinning" : "sidebar-refresh-icon"
                  }
                />
              </button>
            ) : (
              loading && <Spinner animation="border" size="sm" variant="secondary" />
            )}
            {/* Quick actions -- kept rightmost so the transient badge/spinner don't shift them */}
            <button
              type="button"
              className="top-bar-icon-btn"
              onClick={handleNewNote}
              title={`New note (${isMac ? "⌘⇧" : "Ctrl+Shift+"}N)`}
              aria-label="New note"
            >
              <IconFilePlus size={16} />
            </button>
            <button
              type="button"
              className="top-bar-icon-btn"
              onClick={toggleTheme}
              title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {resolvedTheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
            <button
              type="button"
              className={`top-bar-icon-btn${effectiveTab === "settings" ? " active" : ""}`}
              onClick={() => setActiveTab("settings")}
              title={getShortcutTitle("settings", "Settings")}
              aria-label="Settings"
            >
              <IconSettings size={16} />
            </button>
          </div>
        </Container>
      </Navbar>

      <ErrorBoundary>
        <div className="app-body">
          {/* Sidebar navigation */}
          <nav className="sidebar">
            {(() => {
              // Runtime per-tab metadata (icons + live counts) keyed by tab key.
              const tabMeta: Record<string, { icon: Icon }> = {
                summary: { icon: IconLayoutDashboard },
                focus: { icon: IconTarget },
                board: { icon: IconColumns3 },
                notes: { icon: IconNotes },
                jira: { icon: IconSubtask },
                "jira-search": { icon: IconSearch },
                "jira-mentions": { icon: IconAt },
                prs: { icon: IconGitPullRequest },
                reviews: { icon: IconEye },
                "github-mentions": { icon: IconAt },
                "org-prs": { icon: IconBuilding },
                teams: { icon: IconUsersGroup },
                "team-dashboard": { icon: IconChartBar },
                pomodoro: { icon: IconClock },
              };

              return NAV_GROUPS.map((group) => {
                const visibleTabs = group.tabs.filter((t) =>
                  isTabVisible(t.key, { hiddenTabs, githubOrg }),
                );
                if (visibleTabs.length === 0) return null;

                return (
                  <div className="sidebar-group" key={group.key}>
                    {group.label && (
                      <>
                        <div className="sidebar-group-divider" />
                        <div className="sidebar-group-label">{group.label}</div>
                      </>
                    )}
                    {visibleTabs.map((tab) => {
                      const meta = tabMeta[tab.key];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={tab.key}
                          className={`sidebar-tab${effectiveTab === tab.key ? " active" : ""}`}
                          onClick={() => setActiveTab(tab.key)}
                          title={getShortcutTitle(tab.key, tab.label)}
                        >
                          <Icon size={18} />
                          <span className="sidebar-tab-label">{tab.label}</span>
                          {tab.key === "notes" && dueReminderCount > 0 && (
                            <span
                              title={`${dueReminderCount} reminder${dueReminderCount === 1 ? "" : "s"} due`}
                              style={{
                                marginLeft: "auto",
                                background: "var(--bs-danger, #dc3545)",
                                color: "#fff",
                                borderRadius: "10px",
                                padding: "0 6px",
                                fontSize: "0.6875rem",
                                fontWeight: 600,
                                lineHeight: "1.4",
                              }}
                            >
                              {dueReminderCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              });
            })()}

            {/* Footer actions -- equally spaced icon-only buttons pinned to bottom */}
            <div className="sidebar-footer">
              <button
                type="button"
                className="sidebar-footer-btn"
                onClick={handleRefresh}
                disabled={loading}
                title="Refresh"
              >
                <IconRefresh
                  size={18}
                  className={
                    loading || notesLoading || kanbanLoading
                      ? "sidebar-refresh-icon spinning"
                      : "sidebar-refresh-icon"
                  }
                />
                <span className="sidebar-footer-label">Refresh</span>
                {lastRefreshed != null && (
                  <span
                    className="sidebar-refresh-ago"
                    title={`Last refreshed at ${new Date(lastRefreshed).toLocaleTimeString()}`}
                  >
                    ({formatAgo(lastRefreshed, nowTs)})
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`sidebar-footer-btn${effectiveTab === "settings" ? " active" : ""}`}
                onClick={() => setActiveTab("settings")}
                title="Settings"
              >
                <IconSettings size={18} />
                <span className="sidebar-footer-label">Settings</span>
              </button>
            </div>
          </nav>

          {/* Main content panel */}
          <main className="main-content">
            {/* Error alert */}
            {error && (
              <Alert variant="danger" className="small" dismissible>
                <Alert.Heading className="h6 mb-1" style={{ fontSize: "0.8125rem" }}>
                  Some data failed to load
                </Alert.Heading>
                <ul className="mb-0 ps-3">
                  {error.split("; ").map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {/* Show settings or dashboard. Per-view boundary isolates a view crash
                to the content area (sidebar stays usable) and resets on tab switch. */}
            <ErrorBoundary resetKey={effectiveTab}>
              {effectiveTab === "settings" ? (
                <SettingsView
                  backendOnline={backendOnline}
                  backendVersion={backendVersion}
                  configured={configured}
                  jiraBaseUrl={jiraBaseUrl}
                  githubUsername={githubUsername}
                  onBack={() => setActiveTab(prevTabRef.current)}
                  saveSettings={saveSettings}
                  theme={themePreference}
                  onSelectTheme={setThemePreference}
                />
              ) : (
                <div className="tab-content-area" key={effectiveTab}>
                  {effectiveTab === "summary" && (
                    <SummaryView
                      jiraIssues={assignedJiraIssues}
                      jiraComments={jiraComments}
                      githubMentions={githubMentions}
                      openPRs={openPRs}
                      reviewRequests={reviewRequests}
                      loading={loading}
                      jiraIssuesLoading={jiraIssuesLoading}
                      jiraCommentsLoading={jiraCommentsLoading}
                      githubMentionsLoading={githubMentionsLoading}
                      openPRsLoading={openPRsLoading}
                      reviewRequestsLoading={reviewRequestsLoading}
                      notesLoading={notesLoading}
                      jiraBaseUrl={jiraBaseUrl}
                      onNavigate={setActiveTab}
                      notes={unresolvedNotes}
                      onResolveNote={resolveNote}
                      onAddNote={() => setShowNoteEditor(true)}
                      onOpenNote={(note) => {
                        setOpenNote(note);
                        setShowNoteEditor(true);
                      }}
                      doneItemIds={doneItemIds}
                    />
                  )}
                  {effectiveTab === "focus" && (
                    <FocusView
                      groups={focusGroups}
                      loading={focusLoading}
                      offline={focusOffline}
                      onPin={pinFocusItem}
                      onSnooze={snoozeFocusItem}
                      onDismiss={dismissFocusItem}
                    />
                  )}
                  {effectiveTab === "board" && (
                    <KanbanBoard
                      columnTiles={columnTiles}
                      loading={kanbanLoading}
                      jiraBaseUrl={jiraBaseUrl}
                      onMoveItem={kanbanMoveItem}
                    />
                  )}
                  {effectiveTab === "jira" && (
                    <JiraTasks
                      issues={assignedJiraIssues}
                      loading={jiraIssuesLoading}
                      baseUrl={jiraBaseUrl}
                    />
                  )}
                  {effectiveTab === "jira-search" && <JiraIssueSearch baseUrl={jiraBaseUrl} />}
                  {effectiveTab === "jira-mentions" && (
                    <JiraMentionsView
                      jiraComments={jiraComments}
                      loading={jiraCommentsLoading}
                      jiraBaseUrl={jiraBaseUrl}
                    />
                  )}
                  {effectiveTab === "github-mentions" && (
                    <GitHubMentionsView
                      githubMentions={githubMentions}
                      loading={githubMentionsLoading}
                    />
                  )}
                  {effectiveTab === "prs" && (
                    <PRsView
                      openPRs={openPRs}
                      loading={openPRsLoading}
                      jiraIssues={jiraIssues}
                      jiraBaseUrl={jiraBaseUrl}
                      configured={configured}
                      refreshKey={refreshKey}
                    />
                  )}
                  {effectiveTab === "reviews" && (
                    <ReviewsView
                      reviewRequests={reviewRequests}
                      reviewingPRs={reviewingPRs}
                      loading={reviewRequestsLoading}
                      jiraIssues={jiraIssues}
                      jiraBaseUrl={jiraBaseUrl}
                    />
                  )}
                  {effectiveTab === "org-prs" && (
                    <OrgPRsView
                      configured={configured}
                      jiraBaseUrl={jiraBaseUrl}
                      jiraIssues={jiraIssues}
                      refreshKey={refreshKey}
                    />
                  )}
                  {effectiveTab === "teams" && (
                    <TeamsView configured={configured} onOpenDashboard={openTeamDashboard} />
                  )}
                  {effectiveTab === "team-dashboard" && (
                    <TeamDashboardView
                      configured={configured}
                      jiraBaseUrl={jiraBaseUrl}
                      initialTeamId={dashboardTeamId}
                      jiraIssues={jiraIssues}
                    />
                  )}
                  {effectiveTab === "notes" && (
                    <PersonalNotes
                      notes={notes}
                      loading={notesLoading}
                      onResolve={resolveNote}
                      onDelete={removeNote}
                      onPin={pinNote}
                      onUnpin={unpinNote}
                      onOpenNote={(note) => {
                        setOpenNote(note);
                        setShowNoteEditor(true);
                      }}
                      onAdd={() => setShowNoteEditor(true)}
                      jiraBaseUrl={jiraBaseUrl}
                    />
                  )}
                  {effectiveTab === "pomodoro" && (
                    <PomodoroView focusableItems={focusableItems} {...pomodoro} />
                  )}
                </div>
              )}
            </ErrorBoundary>
          </main>
        </div>
      </ErrorBoundary>

      <NoteEditorModal
        show={showNoteEditor}
        onHide={() => {
          setShowNoteEditor(false);
          setOpenNote(null);
        }}
        onSave={addNote}
        note={openNote}
        onEdit={editNote}
        jiraBaseUrl={jiraBaseUrl}
      />

      {/* Service worker is registered in production builds only. */}
      {import.meta.env.PROD && <UpdateToast />}
    </AppProviders>
  );
}
