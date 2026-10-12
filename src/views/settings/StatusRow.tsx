import React from "react";
import { StatusDot } from "../../components/primitives/StatusDot";
import { NotificationsStatus } from "./NotificationsStatus";

interface StatusRowProps {
  backendOnline: boolean;
  configured: boolean;
}

/** One quiet line at the top of Settings: proxy, notifications, setup state. */
export const StatusRow: React.FC<StatusRowProps> = ({ backendOnline, configured }) => (
  <div className="settings-status">
    <span
      className="settings-status-item"
      title={backendOnline ? undefined : "Jira data can't load. GitHub is unaffected."}
    >
      <StatusDot
        variant={backendOnline ? "online" : "offline"}
        label={backendOnline ? "Jira proxy online" : "Jira proxy offline"}
      />
    </span>
    <NotificationsStatus />
    {!configured && (
      <span className="settings-status-item">
        <StatusDot variant="warning" label="Not set up yet: add your GitHub and Jira details" />
      </span>
    )}
  </div>
);
