import React from "react";
import Form from "react-bootstrap/Form";
import { AppSettings } from "../../services/config";
import { TOGGLEABLE_GROUPS } from "../../config/navTabs";
import "./MenuItemsToggle.css";

interface MenuItemsToggleProps {
  formState: AppSettings;
  setFormState: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const MenuItemsToggle: React.FC<MenuItemsToggleProps> = ({ formState, setFormState }) => {
  const hiddenTabs = formState.hiddenTabs ?? [];

  const toggleTab = (key: string, enabled: boolean) => {
    setFormState((prev) => {
      const current = prev.hiddenTabs ?? [];
      const next = enabled ? current.filter((k) => k !== key) : [...current, key];
      return { ...prev, hiddenTabs: next };
    });
  };

  return (
    <div className="menu-toggle-list">
      {TOGGLEABLE_GROUPS.map((group) => (
        <div key={group.key} className="menu-toggle-group">
          {/* Unlabeled group keeps an empty label so rows line up across columns */}
          <div className="menu-toggle-group-label" aria-hidden={!group.label}>
            {group.label ?? "\u00a0"}
          </div>
          {group.tabs.map((tab) => (
            <label key={tab.key} className="menu-toggle-row" htmlFor={`menu-toggle-${tab.key}`}>
              <span>{tab.label}</span>
              <Form.Check
                type="switch"
                id={`menu-toggle-${tab.key}`}
                checked={!hiddenTabs.includes(tab.key)}
                onChange={(e) => toggleTab(tab.key, e.target.checked)}
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
};
