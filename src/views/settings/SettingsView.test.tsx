import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function renderSettings(saveSettings = async () => {}) {
  render(
    <SettingsView
      backendOnline
      configured
      onBack={() => {}}
      saveSettings={saveSettings}
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

  it("saves on ⌘↵", async () => {
    setPhone(false);
    const saveSettings = vi.fn(async () => {});
    renderSettings(saveSettings);
    fireEvent.keyDown(document.body, { key: "Enter", metaKey: true });
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
  });

  it("leaves them out on a phone, which has no sidebar, but keeps the theme", () => {
    setPhone(true);
    renderSettings();
    expect(screen.queryByRole("heading", { name: "Sidebar" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Theme" })).toBeInTheDocument();
  });
});
