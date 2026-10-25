import React from "react";
import Form from "react-bootstrap/Form";
import { useAnalyticsConsent } from "../../hooks/useAnalyticsConsent";

/** Clarity opt-in switch. Applies immediately, outside the Save flow, like the theme. */
export const UsageAnalytics: React.FC = () => {
  const [consent, setConsent] = useAnalyticsConsent();
  return (
    <Form.Check
      type="switch"
      id="usage-analytics"
      label="Share usage analytics"
      checked={consent === "granted"}
      onChange={(e) => setConsent(e.target.checked ? "granted" : "denied")}
    />
  );
};
