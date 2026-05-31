import React from "react";
import "./SectionHeader.css";

interface SectionHeaderProps {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  children,
  action,
  className = "",
}) => (
  <div className={`section-header ${className}`.trim()}>
    <span className="section-header-title">{children}</span>
    {action && <span className="section-header-action">{action}</span>}
  </div>
);
