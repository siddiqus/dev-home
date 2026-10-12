import React, { useEffect, useState } from "react";
import { StatusDot } from "../../components/primitives/StatusDot";
import { Toast, useToast } from "../../components/Toast";

const HELP =
  "Reminders and Pomodoro alerts only fire while Dev Home is open in a tab or installed window.";

/** Browser notification permission as one status-row item, with Enable when it can be asked. */
export const NotificationsStatus: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [isRequesting, setIsRequesting] = useState(false);
  const toast = useToast(3000);

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    setIsRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") toast.show("Notifications enabled.");
    } catch (err) {
      console.error("Failed to request notification permission:", err);
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <>
      <span className="settings-status-item" title={HELP}>
        {permission === "granted" && <StatusDot variant="online" label="Notifications enabled" />}
        {permission === "default" && (
          <>
            <StatusDot variant="neutral" label="Notifications off" />
            <button
              type="button"
              className="settings-link-btn"
              onClick={enable}
              disabled={isRequesting}
            >
              {isRequesting ? "Requesting..." : "Enable notifications"}
            </button>
          </>
        )}
        {permission === "denied" && (
          <StatusDot
            variant="warning"
            label="Notifications are blocked: allow them in your browser's site settings"
          />
        )}
        {permission === "unsupported" && (
          <StatusDot variant="neutral" label="Notifications are not supported in this browser" />
        )}
      </span>
      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
};
