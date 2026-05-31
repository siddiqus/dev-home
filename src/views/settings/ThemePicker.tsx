import React from "react";
import Card from "react-bootstrap/Card";
import { IconSun, IconMoon } from "@tabler/icons-react";

interface ThemePickerProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

const MODES = ["light", "dark"] as const;

export const ThemePicker: React.FC<ThemePickerProps> = ({ theme, onToggleTheme }) => {
  return (
    <Card className="mb-3">
      <Card.Body>
        <h6 style={{ marginBottom: 12 }}>Appearance</h6>
        <div className="d-flex gap-3">
          {MODES.map((mode) => {
            const isSelected = theme === mode;
            return (
              <button
                key={mode}
                className={`theme-option${isSelected ? " theme-option-selected" : ""}`}
                onClick={() => {
                  if (!isSelected) onToggleTheme();
                }}
                type="button"
              >
                <div className="theme-option-preview" data-preview={mode}>
                  <div className="theme-preview-bar" />
                  <div className="theme-preview-body">
                    <div className="theme-preview-line" />
                    <div className="theme-preview-line short" />
                  </div>
                </div>
                <div className="theme-option-label">
                  {mode === "light" ? <IconSun size={14} /> : <IconMoon size={14} />}
                  <span>{mode === "light" ? "Light" : "Dark"}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card.Body>
    </Card>
  );
};
