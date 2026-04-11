import { useState, useEffect, useCallback, useRef } from "react";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_KEY = "dev-home-update-check";
const GITHUB_RELEASES_URL = "https://api.github.com/repos/siddiqus/dev-home/releases/latest";

interface UpdateCheckCache {
  latestVersion: string;
  timestamp: number;
}

export interface UpdateInfo {
  latestVersion: string;
  downloadUrl: string;
  currentVersion: string;
}

function loadCache(): UpdateCheckCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UpdateCheckCache;
  } catch {
    return null;
  }
}

function saveCache(latestVersion: string): void {
  const entry: UpdateCheckCache = { latestVersion, timestamp: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
}

function isCacheFresh(cache: UpdateCheckCache): boolean {
  return Date.now() - cache.timestamp < UPDATE_CHECK_INTERVAL_MS;
}

function buildDownloadUrl(version: string): string {
  return `https://github.com/siddiqus/dev-home/releases/download/v${version}/Dev-Home-${version}-arm64.dmg`;
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentVersion = __APP_VERSION__;

  const checkForUpdate = useCallback(async () => {
    const cached = loadCache();
    if (cached && isCacheFresh(cached)) {
      if (isNewerVersion(cached.latestVersion, currentVersion)) {
        setUpdateInfo({
          latestVersion: cached.latestVersion,
          downloadUrl: buildDownloadUrl(cached.latestVersion),
          currentVersion,
        });
      }
      return;
    }

    try {
      const response = await fetch(GITHUB_RELEASES_URL);
      if (!response.ok) return;

      const data = await response.json();
      const tagName: string = data.tag_name;
      const latestVersion = tagName.replace(/^v/, "");

      saveCache(latestVersion);

      if (isNewerVersion(latestVersion, currentVersion)) {
        setUpdateInfo({
          latestVersion,
          downloadUrl: buildDownloadUrl(latestVersion),
          currentVersion,
        });
      } else {
        setUpdateInfo(null);
      }
    } catch {
      // Silently fail -- update check is non-critical
    }
  }, [currentVersion]);

  useEffect(() => {
    checkForUpdate();
    intervalRef.current = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkForUpdate]);

  const dismiss = useCallback(() => setDismissed(true), []);

  return { updateInfo: dismissed ? null : updateInfo, dismiss };
}
