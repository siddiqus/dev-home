import { DB_PREFIX } from "./localStore";
import { SETTINGS_KEY } from "../services/config";

const EXPORTABLE_SETTINGS = [
  "jiraBaseUrl",
  "jiraEmail",
  "githubUsername",
  "githubOrg",
  "hiddenTabs",
] as const;

type ExportableSetting = (typeof EXPORTABLE_SETTINGS)[number];

export interface Backup {
  app: "dev-home";
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
  settings: Partial<Record<ExportableSetting, unknown>>;
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function dataKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(DB_PREFIX)) keys.push(k);
  }
  return keys;
}

/** Snapshot of all local data plus non-secret settings. Tokens are never exported. */
export function createBackup(now: Date = new Date()): Backup {
  const data: Record<string, unknown> = {};
  for (const key of dataKeys()) {
    try {
      data[key.slice(DB_PREFIX.length)] = JSON.parse(localStorage.getItem(key)!);
    } catch {
      // Skip corrupt entries rather than failing the whole export.
    }
  }
  const all = readSettings();
  const settings: Backup["settings"] = {};
  for (const k of EXPORTABLE_SETTINGS) {
    if (all[k] !== undefined) settings[k] = all[k];
  }
  return { app: "dev-home", version: 1, exportedAt: now.toISOString(), data, settings };
}

function isBackup(input: unknown): input is Backup {
  const b = input as Backup;
  return (
    !!b && b.app === "dev-home" && b.version === 1 && typeof b.data === "object" && b.data !== null
  );
}

/** Replace all local data with the backup's; merge settings, keeping existing tokens. */
export function restoreBackup(input: unknown): void {
  if (!isBackup(input)) throw new Error("Not a Dev Home backup file");

  // Snapshot current state for rollback
  const snapshot = new Map<string, string>();
  const oldKeys = dataKeys();
  for (const key of oldKeys) {
    const value = localStorage.getItem(key);
    if (value !== null) snapshot.set(key, value);
  }
  const oldSettings = localStorage.getItem(SETTINGS_KEY);
  if (oldSettings !== null) snapshot.set(SETTINGS_KEY, oldSettings);

  try {
    // Clear old data
    for (const key of oldKeys) localStorage.removeItem(key);

    // Write new data
    for (const [name, value] of Object.entries(input.data)) {
      localStorage.setItem(DB_PREFIX + name, JSON.stringify(value));
    }

    // Merge settings
    const merged = { ...readSettings() };
    for (const k of EXPORTABLE_SETTINGS) {
      if (input.settings?.[k] !== undefined) merged[k] = input.settings[k];
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch (err) {
    // Rollback: restore snapshot and remove any newly added keys
    const newKeys = dataKeys();
    for (const key of newKeys) {
      if (!snapshot.has(key)) localStorage.removeItem(key);
    }
    for (const [key, value] of snapshot.entries()) {
      localStorage.setItem(key, value);
    }
    throw err;
  }
}
