import React from "react";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import { StatusDot } from "../../components/primitives/StatusDot";

interface BackendStatusCardProps {
  backendOnline: boolean;
  configured: boolean;
  jiraBaseUrl: string;
  githubUsername: string;
}

export const BackendStatusCard: React.FC<BackendStatusCardProps> = ({
  backendOnline,
  configured,
  jiraBaseUrl,
  githubUsername,
}) => {
  return (
    <Card className="mb-3">
      <Card.Body>
        <div className="d-flex align-items-center gap-2 mb-3">
          <h6 className="mb-0">Backend Server</h6>
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
  );
};
