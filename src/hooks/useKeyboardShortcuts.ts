import { useEffect } from "react";

const tabShortcuts: Record<string, string> = {
  1: "summary",
  2: "focus",
  4: "board",
  5: "notes",
  6: "jira",
  7: "mentions",
  3: "prs",
  8: "reviews",
  9: "org-prs",
  p: "pomodoro",
  l: "claude",
  ",": "settings",
};

const shortcutHints: Record<string, string> = Object.fromEntries(
  Object.entries(tabShortcuts).map(([key, tab]) => [tab, key.toUpperCase()]),
);

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

export function getShortcutTitle(tabKey: string, label: string): string {
  const hint = shortcutHints[tabKey];
  if (!hint) return label;
  return `${label} (${isMac ? "⌘" : "Ctrl+"}${hint})`;
}

export function useKeyboardShortcuts(setActiveTab: (tab: string) => void, onNewNote: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();

      // Cmd+Shift+N → new note (action)
      if (e.shiftKey && key === "n") {
        e.preventDefault();
        onNewNote();
        return;
      }

      // Cmd+<key> (no shift) → tab navigation
      if (e.shiftKey) return;
      const tab = tabShortcuts[key];
      if (tab) {
        e.preventDefault();
        setActiveTab(tab);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setActiveTab, onNewNote]);
}
