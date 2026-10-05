import React, { useState, useEffect } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { IconArrowLeft } from "@tabler/icons-react";
import { AppSettings, loadSettings } from "../../services/config";
import { BackendStatusCard } from "./BackendStatusCard";
import { NotificationsCard } from "./NotificationsCard";
import { ThemePicker } from "./ThemePicker";
import type { ThemePreference } from "../../hooks/useTheme";
import { MenuItemsToggle } from "./MenuItemsToggle";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { DataBackupCard } from "./DataBackupCard";
import "./settings.css";
import { Toast } from "../../components/Toast";

interface SettingsViewProps {
  backendOnline: boolean;
  backendVersion: string;
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
  onBack: () => void;
  saveSettings: (settings: AppSettings) => Promise<void>;
  theme: ThemePreference;
  onSelectTheme: (theme: ThemePreference) => void;
}

const EMPTY_SETTINGS: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  githubToken: "",
  githubUsername: "",
  githubOrg: "",
  hiddenTabs: [],
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  backendOnline,
  backendVersion,
  configured,
  jiraBaseUrl,
  githubUsername,
  onBack,
  saveSettings,
  theme,
  onSelectTheme,
}) => {
  const [formState, setFormState] = useState<AppSettings>(EMPTY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState<string>("integrations");

  useEffect(() => {
    const stored = loadSettings();
    setFormState({ ...stored, hiddenTabs: stored.hiddenTabs ?? [] });
  }, []);

  const handleChange = (field: keyof AppSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const jiraUrlWarning = React.useMemo(() => {
    const url = formState.jiraBaseUrl.trim();
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return "URL must use https";
      if (!parsed.hostname.toLowerCase().endsWith(".atlassian.net")) {
        return "URL should be https://<site>.atlassian.net (server may allow other hosts via JIRA_ALLOWED_HOSTS)";
      }
      return null;
    } catch {
      return "Invalid URL format";
    }
  }, [formState.jiraBaseUrl]);

  const handleSave = async () => {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await saveSettings(formState);
      setSuccessMessage("Settings saved successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const labelStyle: React.CSSProperties = { fontSize: "0.8125rem" };

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-3">
          <Button
            variant="outline-secondary"
            size="sm"
            className="d-flex align-items-center gap-2"
            onClick={onBack}
          >
            <IconArrowLeft size={14} />
            Back
          </Button>
          <div>
            <h5 className="mb-0">Settings</h5>
            <p className="text-secondary-custom mb-0" style={{ fontSize: "0.8125rem" }}>
              Configure your integrations and appearance.
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Saving...
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>

      <BackendStatusCard
        backendOnline={backendOnline}
        backendVersion={backendVersion}
        configured={configured}
        jiraBaseUrl={jiraBaseUrl}
        githubUsername={githubUsername}
      />

      <NotificationsCard />

      {/* Error alert (kept inline so it's actionable) */}
      {errorMessage && (
        <Alert variant="danger" className="py-2" dismissible onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      <SegmentedTabs
        tabs={[
          { key: "integrations", label: "Integrations" },
          { key: "appearance", label: "Appearance" },
        ]}
        activeKey={activeSettingsTab}
        onChange={setActiveSettingsTab}
      />

      {/* GitHub + JIRA Configuration */}
      {activeSettingsTab === "integrations" && (
        <Row>
          <Col lg={6}>
            <Card className="mb-3">
              <Card.Body>
                <h6 style={{ marginBottom: 12 }}>GitHub</h6>
                <Form.Group className="mb-3">
                  <Form.Label className="text-secondary-custom" style={labelStyle}>
                    GitHub Token
                  </Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={formState.githubToken}
                    onChange={handleChange("githubToken")}
                    size="sm"
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="text-secondary-custom" style={labelStyle}>
                    GitHub Username
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="your-github-username"
                    value={formState.githubUsername}
                    onChange={handleChange("githubUsername")}
                    size="sm"
                  />
                </Form.Group>

                <Form.Group className="mb-0">
                  <Form.Label className="text-secondary-custom" style={labelStyle}>
                    GitHub Org
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="your-github-org"
                    value={formState.githubOrg}
                    onChange={handleChange("githubOrg")}
                    size="sm"
                  />
                  <Form.Text className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>
                    Optional. Used to browse all open PRs across the org.
                  </Form.Text>
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>

          <Col lg={6}>
            <Card className="mb-3">
              <Card.Body>
                <h6 style={{ marginBottom: 12 }}>JIRA</h6>
                <Form.Group className="mb-3">
                  <Form.Label className="text-secondary-custom" style={labelStyle}>
                    JIRA Base URL
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="https://your-org.atlassian.net"
                    value={formState.jiraBaseUrl}
                    onChange={handleChange("jiraBaseUrl")}
                    size="sm"
                  />
                  {jiraUrlWarning && (
                    <Form.Text className="text-warning" style={{ fontSize: "0.75rem" }}>
                      {jiraUrlWarning}
                    </Form.Text>
                  )}
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="text-secondary-custom" style={labelStyle}>
                    JIRA Email
                  </Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="you@company.com"
                    value={formState.jiraEmail}
                    onChange={handleChange("jiraEmail")}
                    size="sm"
                  />
                </Form.Group>

                <Form.Group className="mb-0">
                  <Form.Label className="text-secondary-custom" style={labelStyle}>
                    JIRA API Token
                  </Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="your-jira-api-token"
                    value={formState.jiraApiToken}
                    onChange={handleChange("jiraApiToken")}
                    size="sm"
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {activeSettingsTab === "integrations" && (
        <Alert variant="info" className="py-2 mb-3" style={{ fontSize: "0.8125rem" }}>
          Stored only in this browser and sent with each request. The server never saves them.
        </Alert>
      )}

      {/* Appearance */}
      {activeSettingsTab === "appearance" && (
        <>
          <ThemePicker theme={theme} onSelectTheme={onSelectTheme} />
          <MenuItemsToggle formState={formState} setFormState={setFormState} />
        </>
      )}

      <DataBackupCard />

      {/* Saved confirmation — fixed at the bottom so it doesn't shift the layout */}
      <Toast message={successMessage ?? ""} visible={!!successMessage} />
    </div>
  );
};
