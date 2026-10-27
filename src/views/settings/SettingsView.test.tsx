import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsView } from "./SettingsView";

const original = window.matchMedia;

function setPhone(phone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: phone,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderSettings() {
  render(
    <SettingsView
      backendOnline
      configured
      onBack={() => {}}
      saveSettings={async () => {}}
      theme="system"
      onSelectTheme={() => {}}
    />,
  );
}

afterEach(() => {
  window.matchMedia = original;
});

describe("SettingsView", () => {
  it("offers the sidebar item toggles on a desktop", () => {
    setPhone(false);
    renderSettings();
    expect(screen.getByRole("heading", { name: "Sidebar" })).toBeInTheDocument();
  });

  it("leaves them out on a phone, which has no sidebar, but keeps the theme", () => {
    setPhone(true);
    renderSettings();
    expect(screen.queryByRole("heading", { name: "Sidebar" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Theme" })).toBeInTheDocument();
  });
});
