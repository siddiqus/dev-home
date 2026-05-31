import React from "react";
import "./StatusDot.css";

export type StatusDotVariant =
  | "online"
  | "offline"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "purple"
  | "neutral";

interface StatusDotProps {
  variant: StatusDotVariant;
  label?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({ variant, label }) => (
  <span className="status-dot-wrapper">
    <span className={`status-dot status-dot--${variant}`} />
    {label && <span className="status-dot-label">{label}</span>}
  </span>
);
