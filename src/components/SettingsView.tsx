import React from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import Alert from "react-bootstrap/Alert";
import { IconArrowLeft } from "@tabler/icons-react";

interface SettingsViewProps {
  backendOnline: boolean;
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
  onBack: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  backendOnline,
  configured,
  jiraBaseUrl,
  githubUsername,
  onBack,
}) => {
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
      <p
        className="text-secondary-custom"
        style={{ fontSize: "0.8125rem", marginBottom: 24 }}
      >
        Connection status for your JIRA and GitHub integrations.
      </p>

      {/* Backend Server Status */}
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex align-items-center gap-2 mb-3">
            <h6 className="mb-0">Backend Server</h6>
            <span
              className={`status-dot ${backendOnline ? "online" : "offline"}`}
            />
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
              The backend server is running but not configured. Add your JIRA
              and GitHub credentials to the <code>server/.env</code> file, then
              restart the server.
            </Alert>
          )}

          {backendOnline && configured && (
            <ListGroup variant="flush">
              <ListGroup.Item className="px-0 d-flex justify-content-between">
                <span
                  className="text-secondary-custom"
                  style={{ fontSize: "0.8125rem", fontWeight: 500 }}
                >
                  JIRA Base URL
                </span>
                <span style={{ fontSize: "0.8125rem" }}>{jiraBaseUrl}</span>
              </ListGroup.Item>
              <ListGroup.Item
                className="px-0 d-flex justify-content-between"
                style={{ borderBottom: "none" }}
              >
                <span
                  className="text-secondary-custom"
                  style={{ fontSize: "0.8125rem", fontWeight: 500 }}
                >
                  GitHub Username
                </span>
                <span style={{ fontSize: "0.8125rem" }}>{githubUsername}</span>
              </ListGroup.Item>
            </ListGroup>
          )}
        </Card.Body>
      </Card>

      {/* Configuration Instructions */}
      <Card>
        <Card.Body>
          <h6 style={{ marginBottom: 12 }}>Configuration</h6>
          <p
            className="text-secondary-custom"
            style={{ fontSize: "0.8125rem", marginBottom: 12 }}
          >
            Credentials are managed via environment variables in the backend
            server. To update your configuration, edit the{" "}
            <code>server/.env</code> file with the following variables:
          </p>
          <div className="code-block">
            {`JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=your-jira-api-token
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_USERNAME=your-github-username`}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};
