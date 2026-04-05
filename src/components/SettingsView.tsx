import React, { useState, useEffect } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { IconArrowLeft } from "@tabler/icons-react";
import { AppSettings, loadSettingsFromStore } from "../services/config";

interface SettingsViewProps {
  backendOnline: boolean;
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
  onBack: () => void;
  saveSettings: (settings: AppSettings) => Promise<void>;
  refreshConfig: () => void;
}

const EMPTY_SETTINGS: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  githubToken: "",
  githubUsername: "",
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  backendOnline,
  configured,
  jiraBaseUrl,
  githubUsername,
  onBack,
  saveSettings,
  refreshConfig: _refreshConfig,
}) => {
  const [formState, setFormState] = useState<AppSettings>(EMPTY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const stored = await loadSettingsFromStore();
        if (stored) {
          setFormState(stored);
        }
      } catch (err) {
        console.error("Failed to load settings from store:", err);
      }
    }
    loadSettings();
  }, []);

  const handleChange = (field: keyof AppSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, [field]: e.target.value }));
  };

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
    <div style={{ maxWidth: 640, margin: "0 auto", paddingTop: 16 }}>
      {/* Back button */}
      <Button
        variant="outline-secondary"
        size="sm"
        className="mb-3 d-flex align-items-center gap-2"
        onClick={onBack}
      >
        <IconArrowLeft size={14} />
        Back
      </Button>

      <h5 style={{ marginBottom: 4 }}>Settings</h5>
      <p className="text-secondary-custom" style={{ fontSize: "0.8125rem", marginBottom: 24 }}>
        Configure your JIRA and GitHub integrations.
      </p>

      {/* Backend Server Status */}
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex align-items-center gap-2 mb-3">
            <h6 className="mb-0">Backend Server</h6>
            <span className={`status-dot ${backendOnline ? "online" : "offline"}`} />
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 500,
                color: backendOnline ? "#3fb950" : "#f85149",
              }}
            >
              {backendOnline ? "Online" : "Offline"}
            </span>
          </div>

          {!backendOnline && (
            <Alert variant="danger" className="py-2 mb-0">
              The backend server is not reachable. Start it by running:{" "}
              <code>cd server && yarn dev</code>
            </Alert>
          )}

          {backendOnline && !configured && (
            <Alert variant="warning" className="py-2 mb-0">
              The backend server is running but not configured. Fill in your credentials below and
              save to configure the server.
            </Alert>
          )}

          {backendOnline && configured && (
            <Alert variant="success" className="py-2 mb-0">
              Connected. JIRA: <strong>{jiraBaseUrl}</strong> | GitHub:{" "}
              <strong>{githubUsername}</strong>
            </Alert>
          )}
        </Card.Body>
      </Card>

      {/* Success / Error alerts */}
      {successMessage && (
        <Alert
          variant="success"
          className="py-2"
          dismissible
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}
      {errorMessage && (
        <Alert variant="danger" className="py-2" dismissible onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* JIRA Configuration */}
      <Card className="mb-3">
        <Card.Body>
          <h6 style={{ marginBottom: 12 }}>JIRA Configuration</h6>

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

      {/* GitHub Configuration */}
      <Card className="mb-3">
        <Card.Body>
          <h6 style={{ marginBottom: 12 }}>GitHub Configuration</h6>

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

          <Form.Group className="mb-0">
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
        </Card.Body>
      </Card>

      {/* Save button */}
      <div className="d-flex justify-content-end mb-4">
        <Button variant="primary" onClick={handleSave} disabled={saving}>
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
    </div>
  );
};
