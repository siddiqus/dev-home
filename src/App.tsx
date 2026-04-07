import { useState } from "react";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { IconCode, IconRefresh, IconSettings, IconSun, IconMoon } from "@tabler/icons-react";
import { useConfig } from "./hooks/useConfig";
import { useDashboard } from "./hooks/useDashboard";
import { SummaryView } from "./components/SummaryView";
import { JiraTasks } from "./components/JiraTasks";
import { MentionsView } from "./components/MentionsView";
import { OpenPRs } from "./components/OpenPRs";
import { ReviewRequests } from "./components/ReviewRequests";
import { SettingsView } from "./components/SettingsView";

export default function App() {
  const [activeTab, setActiveTab] = useState("summary");
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
  useState(() => {
    document.documentElement.setAttribute("data-theme", theme);
  });
  const {
    configured,
    loading: configLoading,
    backendOnline,
    jiraBaseUrl,
    githubUsername,
    saveSettings,
    refreshConfig,
  } = useConfig();
  const {
    jiraIssues,
    jiraComments,
    githubMentions,
    openPRs,
    reviewRequests,
    loading,
    error,
    refresh,
  } = useDashboard(configured);

  // If config is not yet loaded, show settings first
  const effectiveTab = !configured && !configLoading ? "settings" : activeTab;

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
            Dev Home
          </Navbar.Brand>
          <div className="d-flex align-items-center gap-2 justify-content-end">
            {loading && <Spinner animation="border" size="sm" variant="secondary" />}
            <Button variant="outline-secondary" size="sm" onClick={refresh} disabled={loading}>
              <IconRefresh size={14} />
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={() => setActiveTab("settings")}>
              <IconSettings size={14} />
            </Button>
          </div>
        </Container>
      </Navbar>

      <Container
        fluid
        className="px-3 pt-2 mb-4"
        style={{ height: "calc(100vh - 38px)", overflow: "auto" }}
      >
        {/* Error alert */}
        {error && (
          <Alert variant="danger" className="py-2 small" dismissible>
            {error}
          </Alert>
        )}

        {/* Show settings or dashboard */}
        {effectiveTab === "settings" ? (
          <SettingsView
            backendOnline={backendOnline}
            configured={configured}
            jiraBaseUrl={jiraBaseUrl}
            githubUsername={githubUsername}
            onBack={() => setActiveTab("summary")}
            saveSettings={saveSettings}
            refreshConfig={refreshConfig}
          />
        ) : (
          <>
            {/* Tab navigation -- pill/segmented style */}
            <Nav variant="tabs" className="mb-3 dev-tabs">
              {[
                { key: "summary", label: "Summary" },
                { key: "jira", label: "JIRA Tasks", count: jiraIssues.length },
                {
                  key: "mentions",
                  label: "Mentions",
                  count: jiraComments.length + githubMentions.length,
                },
                {
                  key: "prs",
                  label: "Pull Requests",
                  count: openPRs.length,
                },
                {
                  key: "reviews",
                  label: "Reviews Requested",
                  count: reviewRequests.length,
                },
              ].map((tab) => (
                <Nav.Item key={tab.key}>
                  <Nav.Link active={effectiveTab === tab.key} onClick={() => setActiveTab(tab.key)}>
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <Badge bg="secondary" pill className="ms-2">
                        {tab.count}
                      </Badge>
                    )}
                  </Nav.Link>
                </Nav.Item>
              ))}
            </Nav>

            {/* Tab content */}
            <div className="tab-content-area mb-4" key={effectiveTab}>
              {effectiveTab === "summary" && (
                <SummaryView
                  jiraIssues={jiraIssues}
                  jiraComments={jiraComments}
                  githubMentions={githubMentions}
                  openPRs={openPRs}
                  reviewRequests={reviewRequests}
                  loading={loading}
                  jiraBaseUrl={jiraBaseUrl}
                  onNavigate={setActiveTab}
                />
              )}
              {effectiveTab === "jira" && (
                <JiraTasks issues={jiraIssues} loading={loading} baseUrl={jiraBaseUrl} />
              )}
              {effectiveTab === "mentions" && (
                <MentionsView
                  jiraComments={jiraComments}
                  githubMentions={githubMentions}
                  loading={loading}
                  jiraBaseUrl={jiraBaseUrl}
                />
              )}
              {effectiveTab === "prs" && <OpenPRs prs={openPRs} loading={loading} jiraIssues={jiraIssues} />}
              {effectiveTab === "reviews" && (
                <ReviewRequests reviews={reviewRequests} loading={loading} jiraIssues={jiraIssues} />
              )}
            </div>
          </>
        )}
      </Container>
    </>
  );
}
