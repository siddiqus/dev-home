import React from "react";
import Card from "react-bootstrap/Card";
import { IconSun, IconMoon, IconDeviceDesktop } from "@tabler/icons-react";
import type { ThemePreference } from "../../hooks/useTheme";

interface ThemePickerProps {
  theme: ThemePreference;
  onSelectTheme: (theme: ThemePreference) => void;
}

const MODES: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <IconSun size={14} /> },
  { value: "dark", label: "Dark", icon: <IconMoon size={14} /> },
  { value: "system", label: "System", icon: <IconDeviceDesktop size={14} /> },
];

export const ThemePicker: React.FC<ThemePickerProps> = ({ theme, onSelectTheme }) => {
  return (
    <Card className="mb-3">
      <Card.Body>
        <h6 style={{ marginBottom: 12 }}>Appearance</h6>
        <div className="d-flex gap-3">
          {MODES.map((mode) => {
            const isSelected = theme === mode.value;
            return (
              <button
                key={mode.value}
                className={`theme-option${isSelected ? " theme-option-selected" : ""}`}
                onClick={() => {
                  if (!isSelected) onSelectTheme(mode.value);
                }}
                type="button"
              >
                <div className="theme-option-preview" data-preview={mode.value}>
                  <div className="theme-preview-bar" />
                  <div className="theme-preview-body">
                    <div className="theme-preview-line" />
                    <div className="theme-preview-line short" />
                  </div>
                </div>
                <div className="theme-option-label">
                  {mode.icon}
                  <span>{mode.label}</span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="theme-picker-hint">System follows your OS light/dark setting.</p>
      </Card.Body>
    </Card>
  );
};
