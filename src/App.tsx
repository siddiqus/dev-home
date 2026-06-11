import { useState, useEffect, useMemo, useRef } from "react";
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
  IconChevronsLeft,
  IconChevronsRight,
  IconClock,
  IconTarget,
  IconSparkles,
} from "@tabler/icons-react";
import { useConfig } from "./hooks/useConfig";
import { useDashboard } from "./hooks/useDashboard";
import { useNotes } from "./hooks/useNotes";
import { useFocus } from "./hooks/useFocus";
import { FocusView } from "./components/FocusView";
import { SummaryView } from "./views/summary/SummaryView";
import { JiraTasksView } from "./views/jira/JiraTasksView";
import { MentionsView } from "./components/MentionsView";
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("dev-home-sidebar-collapsed") === "true";
  });

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("dev-home-sidebar-collapsed", String(next));
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
    removeNote,
    refresh: refreshNotes,
  } = useNotes(configured);
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
    notes: unresolvedNotes,
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
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      setClaudeEnabled(!!s?.claudeEnabled);
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
    await saveSettings(settings);
  };

  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [openNote, setOpenNote] = useState<import("./types").Note | null>(null);

  // Cmd+Shift+N to open a new note
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOpenNote(null);
        setShowNoteEditor(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // If config is not yet loaded, show settings first
  const effectiveTab = !configured && !configLoading ? "settings" : activeTab;

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
          <nav className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
            {[
              { key: "summary", label: "Summary", icon: IconLayoutDashboard, count: undefined },
              { key: "focus", label: "Focus", icon: IconTarget, count: undefined },
              { key: "board", label: "Board", icon: IconColumns3, count: undefined },
              {
                key: "notes",
                label: "Notes",
                icon: IconNotes,
                count: unresolvedNotes.length,
              },
              { key: "jira", label: "JIRA Tasks", icon: IconSubtask, count: jiraIssues.length },
              {
                key: "mentions",
                label: "Mentions",
                icon: IconAt,
                count: jiraComments.length + githubMentions.length,
              },
              {
                key: "prs",
                label: "Pull Requests",
                icon: IconGitPullRequest,
                count: openPRs.length,
              },
              {
                key: "reviews",
                label: "Reviews",
                icon: IconEye,
                count: reviewRequests.length,
              },
              ...(githubOrg
                ? [
                    {
                      key: "org-prs",
                      label: "Org PRs",
                      icon: IconBuilding,
                      count: undefined,
                    },
                  ]
                : []),
              { key: "pomodoro", label: "Pomodoro", icon: IconClock, count: undefined },
              ...(claudeEnabled
                ? [
                    {
                      key: "claude",
                      label: "Claude",
                      icon: IconSparkles,
                      count: claudeSessions.activeCount || undefined,
                    },
                  ]
                : []),
            ].map((tab) => (
              <button
                key={tab.key}
                className={`sidebar-tab${effectiveTab === tab.key ? " active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
                title={tab.label}
              >
                <tab.icon size={18} />
                <span className="sidebar-tab-label">{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <Badge bg="secondary" pill className="sidebar-badge">
                    {tab.count}
                  </Badge>
                )}
              </button>
            ))}
            <button
              className="sidebar-toggle"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <IconChevronsRight size={16} /> : <IconChevronsLeft size={16} />}
            </button>
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
                  <JiraTasksView issues={jiraIssues} loading={loading} baseUrl={jiraBaseUrl} />
                )}
                {effectiveTab === "mentions" && (
                  <MentionsView
                    jiraComments={jiraComments}
                    githubMentions={githubMentions}
                    loading={loading}
                    jiraBaseUrl={jiraBaseUrl}
                  />
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
                  />
                )}
                {effectiveTab === "notes" && (
                  <PersonalNotes
                    notes={notes}
                    loading={notesLoading}
                    onResolve={resolveNote}
                    onDelete={removeNote}
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
