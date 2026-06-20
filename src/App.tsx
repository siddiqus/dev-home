import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import {
  IconCode,
  IconRefresh,
  IconSettings,
  IconPlus,
  IconLayoutDashboard,
  IconColumns3,
  IconNotes,
  IconSubtask,
  IconAt,
  IconGitPullRequest,
  IconEye,
  IconBuilding,
  IconClock,
  IconTarget,
  IconSparkles,
  type Icon,
} from "@tabler/icons-react";
import { useConfig } from "./hooks/useConfig";
import { useDashboard } from "./hooks/useDashboard";
import { useNotes } from "./hooks/useNotes";
import { useFocus } from "./hooks/useFocus";
import { FocusView } from "./components/FocusView";
import { SummaryView } from "./views/summary/SummaryView";
import { JiraTasksView } from "./views/jira/JiraTasksView";
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
  const {
    jiraIssues,
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
  } = useNotes(configured);
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
    active: configured,
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
    active: configured,
    openPRs,
    reviewRequests,
    jiraIssues,
    jiraComments,
    githubMentions,
    notes: unresolvedNotes,
    jiraBaseUrl,
  });
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

  const [claudeEnabled, setClaudeEnabled] = useState(false);
  const [hiddenTabs, setHiddenTabs] = useState<string[]>([]);
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      setClaudeEnabled(!!s?.claudeEnabled);
      setHiddenTabs(s?.hiddenTabs ?? []);
    });
  }, [configured]);

  const claudeSessions = useClaudeSessions(claudeEnabled);

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
    const sessionId = await claudeSessions.create({
      prNumber: pr.number,
      repoFullName: pr.repo_full_name,
      prTitle: pr.title,
      action,
      customPrompt,
      headBranch: pr.headBranch,
      baseBranch: pr.baseBranch,
    });
    if (sessionId) setActiveTab("claude");
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

  // If config is not yet loaded, show settings first
  // If the active tab has been hidden via settings, fall back to summary
  const effectiveTab =
    !configured && !configLoading
      ? "settings"
      : activeTab !== "settings" && hiddenTabs.includes(activeTab)
        ? "summary"
        : activeTab;

  return (
    <>
      <FindInPage />
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
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowNoteEditor(true)}
              title="Add a note"
            >
              <IconPlus size={14} />
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                refresh();
                refreshNotes();
                refreshKanban();
              }}
              disabled={loading}
            >
              <IconRefresh size={14} />
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={() => setActiveTab("settings")}>
              <IconSettings size={14} />
            </Button>
          </div>
        </Container>
      </Navbar>

      <ErrorBoundary>
        <div className="app-body">
          {/* Sidebar navigation */}
          <nav className="sidebar">
            {(() => {
              // Runtime per-tab metadata (icons + live counts) keyed by tab key.
              const tabMeta: Record<string, { icon: Icon; count?: number }> = {
                summary: { icon: IconLayoutDashboard, count: undefined },
                focus: { icon: IconTarget, count: undefined },
                board: { icon: IconColumns3, count: undefined },
                notes: { icon: IconNotes, count: unresolvedNotes.length },
                jira: { icon: IconSubtask, count: jiraIssues.length },
                "jira-mentions": { icon: IconAt, count: jiraComments.length },
                prs: { icon: IconGitPullRequest, count: openPRs.length },
                reviews: { icon: IconEye, count: reviewRequests.length },
                "github-mentions": { icon: IconAt, count: githubMentions.length },
                "org-prs": { icon: IconBuilding, count: undefined },
                pomodoro: { icon: IconClock, count: undefined },
                claude: { icon: IconSparkles, count: claudeSessions.activeCount || undefined },
              };

              // Tabs whose visibility depends on runtime config.
              const isTabVisible = (key: string): boolean => {
                if (hiddenTabs.includes(key)) return false;
                if (key === "org-prs") return !!githubOrg;
                if (key === "claude") return claudeEnabled;
                return true;
              };

              return NAV_GROUPS.map((group) => {
                const visibleTabs = group.tabs.filter((t) => isTabVisible(t.key));
                if (visibleTabs.length === 0) return null;

                return (
                  <div className="sidebar-group" key={group.key}>
                    <div className="sidebar-group-divider" />
                    <div className="sidebar-group-label">{group.label}</div>
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
                          {meta.count !== undefined && meta.count > 0 && (
                            <Badge bg="secondary" pill className="sidebar-badge">
                              {meta.count}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              });
            })()}
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

            {/* Show settings or dashboard */}
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
                  <JiraTasksView issues={jiraIssues} loading={loading} baseUrl={jiraBaseUrl} />
                )}
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
    </>
  );
}
