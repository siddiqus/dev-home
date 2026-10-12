import React, { useState, useEffect } from "react";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { IconArrowLeft } from "@tabler/icons-react";
import { AppSettings, loadSettings } from "../../services/config";
import { StatusRow } from "./StatusRow";
import { ThemePicker } from "./ThemePicker";
import type { ThemePreference } from "../../hooks/useTheme";
import { MenuItemsToggle } from "./MenuItemsToggle";
import { WeekendDays } from "./WeekendDays";
import { DataBackup } from "./DataBackup";
import { TokenPermissionsInfo } from "./TokenPermissionsInfo";
import "./settings.css";
import { Toast } from "../../components/Toast";

interface SettingsViewProps {
  backendOnline: boolean;
  configured: boolean;
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

/** One settings topic: title and blurb on the left, its controls on the right. */
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-intro">
        <h6>{title}</h6>
        <p>{description}</p>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <Form.Group className="settings-field" controlId={htmlFor}>
      <Form.Label className="settings-label">{label}</Form.Label>
      {children}
    </Form.Group>
  );
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  backendOnline,
  configured,
  onBack,
  saveSettings,
  theme,
  onSelectTheme,
}) => {
  const [formState, setFormState] = useState<AppSettings>(EMPTY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  return (
    <div className="settings-page">
      {/* Header — sticky so Save stays reachable while scrolling */}
      <div className="settings-header d-flex align-items-center justify-content-between">
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
          <h5 className="mb-0">Settings</h5>
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

      <StatusRow backendOnline={backendOnline} configured={configured} />

      {/* Error alert (kept inline so it's actionable) */}
      {errorMessage && (
        <Alert variant="danger" className="py-2" dismissible onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      <SettingsSection
        title="GitHub"
        description="Your PRs, reviews and comments. Credentials are stored only in this browser."
      >
        <Field label="Username" htmlFor="settings-github-username">
          <Form.Control
            type="text"
            placeholder="your-github-username"
            value={formState.githubUsername}
            onChange={handleChange("githubUsername")}
            size="sm"
          />
        </Field>
        <Field label="Token" htmlFor="settings-github-token">
          <Form.Control
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={formState.githubToken}
            onChange={handleChange("githubToken")}
            size="sm"
          />
          <TokenPermissionsInfo provider="github" defaultOpen={!configured} />
        </Field>
        <Field label="Org (optional)" htmlFor="settings-github-org">
          <Form.Control
            type="text"
            placeholder="your-github-org"
            value={formState.githubOrg}
            onChange={handleChange("githubOrg")}
            size="sm"
          />
          <Form.Text className="settings-hint">
            Used to browse all open PRs across the org.
          </Form.Text>
        </Field>
      </SettingsSection>

      <SettingsSection
        title="Jira"
        description="Your issues, sprints and mentions. Requests pass through the Jira proxy, which never stores them."
      >
        <Field label="Email" htmlFor="settings-jira-email">
          <Form.Control
            type="email"
            placeholder="you@company.com"
            value={formState.jiraEmail}
            onChange={handleChange("jiraEmail")}
            size="sm"
          />
        </Field>
        <Field label="API token" htmlFor="settings-jira-token">
          <Form.Control
            type="password"
            placeholder="your-jira-api-token"
            value={formState.jiraApiToken}
            onChange={handleChange("jiraApiToken")}
            size="sm"
          />
          <TokenPermissionsInfo provider="jira" defaultOpen={!configured} />
        </Field>
        <Field label="Base URL" htmlFor="settings-jira-url">
          <Form.Control
            type="text"
            placeholder="https://your-org.atlassian.net"
            value={formState.jiraBaseUrl}
            onChange={handleChange("jiraBaseUrl")}
            size="sm"
          />
          {jiraUrlWarning && (
            <Form.Text className="settings-hint text-warning">{jiraUrlWarning}</Form.Text>
          )}
        </Field>
      </SettingsSection>

      <SettingsSection title="Theme" description="System follows your OS light/dark setting.">
        <ThemePicker theme={theme} onSelectTheme={onSelectTheme} />
      </SettingsSection>

      <SettingsSection
        title="Sidebar"
        description="Choose which items appear in the sidebar. Summary is always shown."
      >
        <MenuItemsToggle formState={formState} setFormState={setFormState} />
      </SettingsSection>

      <SettingsSection
        title="Weekend"
        description={'Days off. Workday\'s "Done since last workday" skips these.'}
      >
        <WeekendDays formState={formState} setFormState={setFormState} />
      </SettingsSection>

      <SettingsSection
        title="Data"
        description="Export or import notes, Kanban items, filters, focus state and teams. Tokens are never included."
      >
        <DataBackup />
      </SettingsSection>

      {/* Saved confirmation — fixed at the bottom so it doesn't shift the layout */}
      <Toast message={successMessage ?? ""} visible={!!successMessage} />
    </div>
  );
};
