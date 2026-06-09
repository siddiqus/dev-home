import React from "react";
import "./Badge.css";

export type BadgeVariant = "info" | "success" | "warning" | "danger" | "purple" | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  className = "",
  children,
  size = "md",
}) => {
  let fontSize = "12px";
  if (size === "sm") fontSize = "10px";
  else if (size === "lg") fontSize = "14px";

  return (
    <span
      style={{
        fontSize,
      }}
      className={`badge badge-status badge-status--${variant} ${className}`.trim()}
    >
      {children}
    </span>
  );
};
