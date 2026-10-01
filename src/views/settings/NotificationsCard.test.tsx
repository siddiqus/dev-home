import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NotificationsCard } from "./NotificationsCard";

describe("NotificationsCard", () => {
  let requestPermissionSpy: Mock<() => Promise<NotificationPermission>>;

  beforeEach(() => {
    requestPermissionSpy = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error clean up test double
    delete global.Notification;
  });

  it("shows 'Enable notifications' button when permission is 'default'", () => {
    class MockNotification {
      static permission = "default";
      static requestPermission = requestPermissionSpy;
    }
    // @ts-expect-error assigning test double
    global.Notification = MockNotification;

    render(<NotificationsCard />);
    expect(screen.getByRole("button", { name: /enable notifications/i })).toBeInTheDocument();
  });

  it("calls Notification.requestPermission when 'Enable notifications' is clicked", async () => {
    requestPermissionSpy.mockResolvedValue("granted");
    class MockNotification {
      static permission = "default";
      static requestPermission = requestPermissionSpy;
    }
    // @ts-expect-error assigning test double
    global.Notification = MockNotification;

    render(<NotificationsCard />);

    const button = screen.getByRole("button", { name: /enable notifications/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(requestPermissionSpy).toHaveBeenCalled();
    });
  });

  it("shows success toast and 'Notifications enabled' text when permission is granted", async () => {
    requestPermissionSpy.mockResolvedValue("granted");
    class MockNotification {
      static permission = "default";
      static requestPermission = requestPermissionSpy;
    }
    // @ts-expect-error assigning test double
    global.Notification = MockNotification;

    render(<NotificationsCard />);

    const button = screen.getByRole("button", { name: /enable notifications/i });
    fireEvent.click(button);

    // After permission is granted, should show success toast
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/notifications enabled/i);
    });

    // Should also show "Notifications enabled" in the alert (role="alert")
    expect(screen.getByRole("alert")).toHaveTextContent(/notifications enabled/i);
  });

  it("shows 'Notifications enabled' when permission is already 'granted'", () => {
    class MockNotification {
      static permission = "granted";
      static requestPermission = requestPermissionSpy;
    }
    // @ts-expect-error assigning test double
    global.Notification = MockNotification;

    render(<NotificationsCard />);
    expect(screen.getByText(/notifications enabled/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable notifications/i })).not.toBeInTheDocument();
  });

  it("shows explanation text when permission is 'denied' (no button)", () => {
    class MockNotification {
      static permission = "denied";
      static requestPermission = requestPermissionSpy;
    }
    // @ts-expect-error assigning test double
    global.Notification = MockNotification;

    render(<NotificationsCard />);
    expect(screen.getByText(/notifications are blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/browser.*site settings/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable notifications/i })).not.toBeInTheDocument();
  });

  it("shows 'not supported' message when Notification is undefined", () => {
    // @ts-expect-error intentionally undefined
    global.Notification = undefined;

    render(<NotificationsCard />);
    expect(screen.getByText(/notifications are not supported/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable notifications/i })).not.toBeInTheDocument();
  });

  it("shows help text about reminders and Pomodoro requiring Dev Home to be open", () => {
    class MockNotification {
      static permission = "default";
      static requestPermission = requestPermissionSpy;
    }
    // @ts-expect-error assigning test double
    global.Notification = MockNotification;

    render(<NotificationsCard />);
    expect(
      screen.getByText(/reminders and pomodoro alerts only fire while dev home is open/i),
    ).toBeInTheDocument();
  });

  it("shows denied state when user denies the permission request (no toast)", async () => {
    requestPermissionSpy.mockResolvedValue("denied");
    class MockNotification {
      static permission = "default";
      static requestPermission = requestPermissionSpy;
    }
    // @ts-expect-error assigning test double
    global.Notification = MockNotification;

    render(<NotificationsCard />);

    const button = screen.getByRole("button", { name: /enable notifications/i });
    fireEvent.click(button);

    // After permission is denied, should show denied alert (not success toast)
    await waitFor(() => {
      expect(screen.getByText(/notifications are blocked/i)).toBeInTheDocument();
    });

    // Should NOT show the success toast
    expect(screen.queryByRole("status")).toHaveTextContent("");
  });
});
