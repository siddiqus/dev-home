import { loadSettings, isConfigured, type AppSettings } from "../../services/config";
import { ApiError } from "./errors";

/** Current settings, or a 401 ApiError when credentials are incomplete. */
export function requireSettings(): AppSettings {
  const settings = loadSettings();
  if (!isConfigured(settings)) {
    throw new ApiError(401, "Missing credentials: configure Dev Home in Settings");
  }
  return settings;
}

/** btoa() only accepts Latin-1; encode as UTF-8 first. */
export function base64Utf8(value: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
