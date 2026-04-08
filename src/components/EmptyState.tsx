import React from "react";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div style={{ fontWeight: 600, fontSize: "1rem", color: "#8b949e" }}>{title}</div>
      <div
        style={{
          fontSize: "0.8125rem",
          color: "#484f58",
          maxWidth: 320,
          textAlign: "center",
        }}
      >
        {description}
      </div>
      {action}
    </div>
  );
};
