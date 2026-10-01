import React from "react";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import { StatusDot } from "../../components/primitives/StatusDot";

interface BackendStatusCardProps {
  backendOnline: boolean;
  backendVersion: string;
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
}

export const BackendStatusCard: React.FC<BackendStatusCardProps> = ({
  backendOnline,
  backendVersion,
  configured,
  jiraBaseUrl,
  githubUsername,
}) => {
  return (
    <Card className="mb-3">
      <Card.Body>
        <div className="d-flex align-items-center gap-2 mb-3">
          <h6 className="mb-0">Jira proxy</h6>
          <StatusDot variant={backendOnline ? "online" : "offline"} />
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 500,
              color: backendOnline ? "#3fb950" : "#f85149",
            }}
          >
            {backendOnline ? "Online" : "Offline"}
          </span>
          {backendVersion && (
            <span
              style={{
                fontSize: "0.7rem",
                color: "#8b949e",
                marginLeft: "auto",
              }}
            >
              Version {backendVersion}
            </span>
          )}
        </div>

        {!backendOnline && (
          <Alert variant="danger" className="py-2 mb-0">
            The Jira proxy is not reachable, so Jira data cannot load. GitHub data is unaffected.
          </Alert>
        )}

        {backendOnline && !configured && (
          <Alert variant="warning" className="py-2 mb-0">
            Not configured yet. Fill in your credentials below and save. They stay in this browser.
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
  );
};
