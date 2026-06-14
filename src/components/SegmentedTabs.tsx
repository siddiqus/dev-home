import React from "react";
import "./SegmentedTabs.css";

export interface SegmentedTab {
  key: string;
  label: React.ReactNode;
}

interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * Segmented-control style tab bar matching the look used across the app
 * (PRs, Org PRs). Use for in-view tab switching.
 */
export const SegmentedTabs: React.FC<SegmentedTabsProps> = ({
  tabs,
  activeKey,
  onChange,
  className,
}) => {
  return (
    <div className={`segmented-tab-bar${className ? ` ${className}` : ""}`}>
      <div className="segmented-tab-group">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`segmented-tab${activeKey === tab.key ? " active" : ""}`}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};
