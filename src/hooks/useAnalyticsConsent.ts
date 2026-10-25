import { useSyncExternalStore } from "react";
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
  type AnalyticsConsent,
} from "../lib/analytics";

/** The stored analytics choice, shared live between the consent card and Settings. */
export function useAnalyticsConsent(): [
  AnalyticsConsent | null,
  (consent: AnalyticsConsent) => void,
] {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent);
  return [consent, setAnalyticsConsent];
}
