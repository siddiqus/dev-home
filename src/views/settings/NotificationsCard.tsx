import React, { useState, useEffect } from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import { IconBell } from "@tabler/icons-react";

export const NotificationsCard: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Read permission on mount and whenever it might have changed
  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const handleEnableNotifications = async () => {
    if (typeof Notification === "undefined") return;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        setSuccessMessage("Notifications enabled.");
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      console.error("Failed to request notification permission:", err);
    }
  };

  return (
    <>
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex align-items-center gap-2 mb-2">
            <IconBell size={16} />
            <h6 className="mb-0">Notifications</h6>
          </div>
          <p className="text-secondary-custom" style={{ fontSize: "0.75rem", marginBottom: 12 }}>
            Reminders and Pomodoro alerts only fire while Dev Home is open in a tab or installed
            window.
          </p>

          {permission === "unsupported" && (
            <Alert variant="secondary" className="py-2 mb-0">
              Notifications are not supported in this browser.
            </Alert>
          )}

          {permission === "denied" && (
            <Alert variant="warning" className="py-2 mb-0">
              Notifications are blocked. To enable them, update your browser's site settings.
            </Alert>
          )}

          {permission === "granted" && (
            <Alert variant="success" className="py-2 mb-0">
              Notifications enabled.
            </Alert>
          )}

          {permission === "default" && (
            <Button variant="outline-primary" size="sm" onClick={handleEnableNotifications}>
              Enable notifications
            </Button>
          )}
        </Card.Body>
      </Card>

      {/* Success toast — fixed at the bottom like other settings cards */}
      <div className={`settings-saved-toast ${successMessage ? "is-visible" : ""}`} role="status">
        {successMessage}
      </div>
    </>
  );
};
