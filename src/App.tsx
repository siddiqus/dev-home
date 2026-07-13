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
  IconSparkles,
  IconUsersGroup,
  IconChartBar,
  IconSun,
  IconMoon,
  type Icon,
} from "@tabler/icons-react";
import { useConfig } from "./hooks/useConfig";
import { useDashboard } from "./hooks/useDashboard";
import { useNotes } from "./hooks/useNotes";
import { useFocus } from "./hooks/useFocus";
import { FocusView } from "./components/FocusView";
import { SummaryView } from "./views/summary/SummaryView";
import { JiraTasks } from "./components/JiraTasks";
import { JiraIssueSearch } from "./components/JiraIssueSearch";
import { JiraMentionsView } from "./views/mentions/JiraMentionsView";
import { GitHubMentionsView } from "./views/mentions/GitHubMentionsView";
import { PRTable } from "./components/PRTable";
import { PRsView } from "./views/prs/PRsView";
import { PersonalNotes } from "./views/notes/PersonalNotes";
import { NoteEditorModal } from "./views/notes/NoteEditorModal";
import { SettingsView } from "./views/settings/SettingsView";
import packageJson from "../package.json";
import { UpdateBanner } from "./components/UpdateBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { useKanban } from "./hooks/useKanban";
import { KanbanBoard } from "./views/kanban/KanbanBoard";
import { OrgPRsView } from "./views/orgPRs/OrgPRsView";
import { TeamsView } from "./views/teams/TeamsView";
import { TeamDashboardView } from "./views/teams/TeamDashboardView";
import { FindInPage } from "./components/FindInPage";
import { usePomodoro } from "./hooks/usePomodoro";
import { PomodoroView } from "./views/pomodoro/PomodoroView";
import { PomodoroBadge } from "./views/pomodoro/PomodoroBadge";
import { useClaudeSessions } from "./hooks/useClaudeSessions";
import { ClaudeSessionsView } from "./views/claude/ClaudeSessionsView";
import type { FocusableItem } from "./types";
import type { ClaudeAction } from "./types/claude";
import type { AppSettings } from "./services/config";
import { getReferenceUrl, getNoteDisplayTitle } from "./utils/text";
import { NAV_GROUPS } from "./config/navTabs";
import { sourcesFor } from "./config/tabData";
import { useKeyboardShortcuts, getShortcutTitle } from "./hooks/useKeyboardShortcuts";

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
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("dev-home-theme") as "dark" | "light") || "light";
  });

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("dev-home-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // Set theme on mount
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const {
    configured,
    loading: configLoading,
    backendOnline,
    backendVersion,
    jiraBaseUrl,
    githubUsername,
    githubOrg,
    saveSettings,
  } = useConfig();

  const [claudeEnabled, setClaudeEnabled] = useState(false);
  const [hiddenTabs, setHiddenTabs] = useState<string[]>([]);
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      setClaudeEnabled(!!s?.claudeEnabled);
      setHiddenTabs(s?.hiddenTabs ?? []);
    });
  }, [configured]);

  // If config isn't loaded yet, show settings first. If the active tab has been
  // hidden via settings, fall back to summary.
  const effectiveTab =
    !configured && !configLoading
      ? "settings"
      : activeTab !== "settings" && hiddenTabs.includes(activeTab)
        ? "summary"
        : activeTab;

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
  const {
    notes,
    unresolvedNotes,
    loading: notesLoading,
    addNote,
    editNote,
    resolveNote,
    unresolveNote,
    pinNote,
    unpinNote,
    removeNote,
    refresh: refreshNotes,
  } = useNotes(configured && activeSources.has("notes"));
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
    jiraIssues,
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

  const { updateInfo, dismiss: dismissUpdate } = useUpdateCheck();

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
        id: `${pr.repo_full_name}#${pr.number}`,
        group: "prs",
        title: `#${pr.number} ${pr.title}`,
        sourceBadge: "PR",
        sourceBadgeVariant: "success",
        url: pr.html_url,
      });
    }

    for (const r of reviewRequests) {
      push({
        id: `${r.repo_full_name}#${r.number}`,
        group: "reviews",
        title: `#${r.number} ${r.title}`,
        sourceBadge: "Review",
        sourceBadgeVariant: "warning",
        url: r.html_url,
      });
    }

    const jiraBase = jiraBaseUrl?.replace(/\/+$/, "") || "";
    for (const issue of jiraIssues) {
      push({
        id: issue.key,
        group: "jira",
        title: `${issue.key} ${issue.fields?.summary || issue.summary || ""}`.trim(),
        sourceBadge: "JIRA",
        sourceBadgeVariant: "info",
        url: jiraBase ? `${jiraBase}/browse/${issue.key}` : "",
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
        url: jiraBase ? `${jiraBase}/browse/${c.issueKey}` : "",
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
    jiraIssues,
    githubMentions,
    jiraComments,
    unresolvedNotes,
    jiraBaseUrl,
  ]);

  const pomodoro = usePomodoro({ focusableItems });

  const claudeSessions = useClaudeSessions(claudeEnabled);
  const [claudeError, setClaudeError] = useState<string | null>(null);

  useEffect(() => {
    if (!claudeError) return;
    const timer = setTimeout(() => setClaudeError(null), 5000);
    return () => clearTimeout(timer);
  }, [claudeError]);

  const handleClaudeAction = async (
    pr: {
      number: number;
      repo_full_name: string;
      title: string;
      headBranch: string;
      baseBranch: string;
    },
    action: ClaudeAction,
    customPrompt?: string,
  ) => {
    const result = await claudeSessions.create({
      prNumber: pr.number,
      repoFullName: pr.repo_full_name,
      prTitle: pr.title,
      action,
      customPrompt,
      headBranch: pr.headBranch,
      baseBranch: pr.baseBranch,
    });
    if ("sessionId" in result) {
      setActiveTab("claude");
    } else {
      setClaudeError(result.error);
    }
  };

  const [viewClaudeSessionId, setViewClaudeSessionId] = useState<string | null>(null);

  const handleViewClaudeSession = (sessionId: string) => {
    setViewClaudeSessionId(sessionId);
    setActiveTab("claude");
  };

  const handleSaveSettingsWrapped = async (settings: AppSettings) => {
    setClaudeEnabled(settings.claudeEnabled);
    setHiddenTabs(settings.hiddenTabs ?? []);
    await saveSettings(settings);
  };

  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [openNote, setOpenNote] = useState<import("./types").Note | null>(null);

  const handleNewNote = useCallback(() => {
    setOpenNote(null);
    setShowNoteEditor(true);
  }, []);
  useKeyboardShortcuts(setActiveTab, handleNewNote);

  return (
    <>
      {/* Thin top bar -- draggable for Electron, with app name and refresh */}
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
            Dev Home ({packageJson.version})
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
            {loading && <Spinner animation="border" size="sm" variant="secondary" />}
            <button
              type="button"
              className="top-bar-icon-btn"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
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
                claude: { icon: IconSparkles },
              };

              // Tabs whose visibility depends on runtime config.
              const isTabVisible = (key: string): boolean => {
                if (hiddenTabs.includes(key)) return false;
                if (key === "org-prs") return !!githubOrg;
                if (key === "teams" || key === "team-dashboard") return !!githubOrg;
                if (key === "claude") return claudeEnabled;
                return true;
              };

              return NAV_GROUPS.map((group) => {
                const visibleTabs = group.tabs.filter((t) => isTabVisible(t.key));
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
            {/* Update banner */}
            {updateInfo && (
              <UpdateBanner
                latestVersion={updateInfo.latestVersion}
                currentVersion={updateInfo.currentVersion}
                downloadUrl={updateInfo.downloadUrl}
                onDismiss={dismissUpdate}
              />
            )}

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
                  saveSettings={handleSaveSettingsWrapped}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                />
              ) : (
                <div className="tab-content-area" key={effectiveTab}>
                  {effectiveTab === "summary" && (
                    <SummaryView
                      jiraIssues={jiraIssues}
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
                      claudeEnabled={claudeEnabled}
                      claudeSessions={claudeSessions.sessions}
                      onClaudeAction={handleClaudeAction}
                      onViewClaudeSession={handleViewClaudeSession}
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
                      claudeEnabled={claudeEnabled}
                      claudeSessions={claudeSessions.sessions}
                      onClaudeAction={handleClaudeAction}
                      onViewClaudeSession={handleViewClaudeSession}
                    />
                  )}
                  {effectiveTab === "jira" && (
                    <JiraTasks
                      issues={assignedJiraIssues}
                      loading={loading}
                      baseUrl={jiraBaseUrl}
                    />
                  )}
                  {effectiveTab === "jira-search" && <JiraIssueSearch baseUrl={jiraBaseUrl} />}
                  {effectiveTab === "jira-mentions" && (
                    <JiraMentionsView
                      jiraComments={jiraComments}
                      loading={loading}
                      jiraBaseUrl={jiraBaseUrl}
                    />
                  )}
                  {effectiveTab === "github-mentions" && (
                    <GitHubMentionsView githubMentions={githubMentions} loading={loading} />
                  )}
                  {effectiveTab === "prs" && (
                    <PRsView
                      openPRs={openPRs}
                      loading={loading}
                      jiraIssues={jiraIssues}
                      jiraBaseUrl={jiraBaseUrl}
                      configured={configured}
                      refreshKey={refreshKey}
                      claudeEnabled={claudeEnabled}
                      claudeSessions={claudeSessions.sessions}
                      onClaudeAction={handleClaudeAction}
                      onViewClaudeSession={handleViewClaudeSession}
                    />
                  )}
                  {effectiveTab === "reviews" && (
                    <PRTable
                      prs={reviewRequests}
                      loading={loading}
                      jiraIssues={jiraIssues}
                      variant="review-requests"
                      jiraBaseUrl={jiraBaseUrl}
                      claudeEnabled={claudeEnabled}
                      claudeSessions={claudeSessions.sessions}
                      onClaudeAction={handleClaudeAction}
                      onViewClaudeSession={handleViewClaudeSession}
                    />
                  )}
                  {effectiveTab === "org-prs" && (
                    <OrgPRsView
                      configured={configured}
                      jiraBaseUrl={jiraBaseUrl}
                      jiraIssues={jiraIssues}
                      refreshKey={refreshKey}
                      claudeEnabled={claudeEnabled}
                      claudeSessions={claudeSessions.sessions}
                      onClaudeAction={handleClaudeAction}
                      onViewClaudeSession={handleViewClaudeSession}
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
                  {effectiveTab === "claude" && claudeEnabled && (
                    <ClaudeSessionsView
                      sessions={claudeSessions.sessions}
                      loading={claudeSessions.loading}
                      onCancel={claudeSessions.cancel}
                      onDelete={claudeSessions.remove}
                      initialSessionId={viewClaudeSessionId}
                    />
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

      {claudeError && (
        <div className="claude-error-toast">
          <IconSparkles size={14} />
          <span>{claudeError}</span>
          <button onClick={() => setClaudeError(null)}>&times;</button>
        </div>
      )}

      {/* Rendered last so its own input isn't the first find-in-page match (see FindInPage) */}
      <FindInPage />
    </>
  );
}
