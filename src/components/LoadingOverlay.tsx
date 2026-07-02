import React from "react";
import Spinner from "react-bootstrap/Spinner";

interface LoadingOverlayProps {
  /** When true, the overlay covers the viewport with a centered spinner. */
  show: boolean;
  /** Optional label shown under the spinner. */
  label?: string;
}

/**
 * A fixed, full-viewport overlay with a centered spinner. Used to signal that a
 * background fetch is in flight (e.g. loading a Jira issue or PR before its
 * modal/drawer can open), so a click gives immediate feedback.
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ show, label }) => {
  if (!show) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "rgba(0, 0, 0, 0.35)",
      }}
    >
      <Spinner animation="border" variant="light" />
      {label && <span style={{ color: "#fff", fontSize: "0.8125rem" }}>{label}</span>}
    </div>
  );
};
