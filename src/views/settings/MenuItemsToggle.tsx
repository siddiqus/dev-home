import React from "react";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import { AppSettings } from "../../services/config";
import { TOGGLEABLE_TABS } from "../../config/navTabs";
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
    <Card className="mb-3">
      <Card.Body>
        <h6 style={{ marginBottom: 4 }}>Sidebar Menu Items</h6>
        <p className="text-secondary-custom" style={{ fontSize: "0.75rem", marginBottom: 12 }}>
          Choose which items appear in the sidebar. Summary is always shown.
        </p>
        <div className="menu-toggle-list">
          {TOGGLEABLE_TABS.map((tab) => (
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
      </Card.Body>
    </Card>
  );
};
