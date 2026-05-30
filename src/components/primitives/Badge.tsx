import React from "react";
import "./Badge.css";

export type BadgeVariant = "info" | "success" | "warning" | "danger" | "purple" | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ variant = "neutral", className = "", children }) => (
  <span className={`badge badge-status badge-status--${variant} ${className}`.trim()}>
    {children}
  </span>
);
