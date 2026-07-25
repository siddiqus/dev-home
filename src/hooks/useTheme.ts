import { useCallback, useEffect, useState } from "react";

/** User's chosen appearance. "system" tracks the OS light/dark setting live. */
export type ThemePreference = "light" | "dark" | "system";
/** The concrete theme actually applied to the DOM. */
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "dev-home-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Map a preference to the concrete theme, consulting the OS only for "system". */
export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}

function osPrefersDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

/** Read the stored preference, defaulting to "system" so first run follows the OS. */
function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

/**
 * Owns the theme preference: persists it, resolves it to a concrete theme, and
 * keeps `<html data-theme>` in sync — including live updates when the OS flips
 * appearance while in "system" mode (macOS/Windows day-night schedules). The
 * initial paint is handled by an inline script in index.html to avoid a flash;
 * this hook keeps React state authoritative from mount onward.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(preference, osPrefersDark()),
  );

  useEffect(() => {
    const apply = () => {
      const next = resolveTheme(preference, osPrefersDark());
      setResolvedTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };
    apply();

    // Only "system" needs to react to OS changes; explicit picks are fixed.
    if (preference !== "system") return;
    const mq = window.matchMedia(DARK_QUERY);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [preference]);

  const setPreference = useCallback((pref: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, pref);
    setPreferenceState(pref);
  }, []);

  // Topbar quick action: flip to the explicit opposite of what's showing.
  const toggleTheme = useCallback(() => {
    setPreference(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setPreference]);

  return { preference, resolvedTheme, setPreference, toggleTheme };
}
