import { analyticsAvailable } from "../lib/analytics";
import { useAnalyticsConsent } from "../hooks/useAnalyticsConsent";
import "./AnalyticsConsent.css";

/**
 * Asks once whether Clarity may record usage. Fixed in the corner so it never reflows the
 * page, and off-centre so it doesn't sit on the bottom toasts. Settings can change the
 * answer later.
 */
export function AnalyticsConsent() {
  const [consent, setConsent] = useAnalyticsConsent();
  if (!analyticsAvailable() || consent !== null) return null;

  return (
    <div className="analytics-consent" role="dialog" aria-label="Usage analytics">
      <p>
        Allow Microsoft Clarity to record how you use Dev Home? Anything you type is masked.{" "}
        <a
          href="https://www.microsoft.com/privacy/privacystatement"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy statement
        </a>
      </p>
      <div className="analytics-consent-actions">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setConsent("denied")}
        >
          Decline
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => setConsent("granted")}
        >
          Allow
        </button>
      </div>
    </div>
  );
}
