import React from "react";
import { IconCircleCheck, IconCircleX, IconClock, IconCircleMinus } from "@tabler/icons-react";

export const STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; title: string }
> = {
  SUCCESS: { icon: IconCircleCheck, color: "#3fb950", title: "Passed" },
  FAILURE: { icon: IconCircleX, color: "#f85149", title: "Failed" },
  ERROR: { icon: IconCircleX, color: "#f85149", title: "Errored" },
  PENDING: { icon: IconClock, color: "#d29922", title: "Pending" },
  EXPECTED: { icon: IconClock, color: "#d29922", title: "Expected" },
  IN_PROGRESS: { icon: IconClock, color: "#d29922", title: "In progress" },
  QUEUED: { icon: IconClock, color: "#d29922", title: "Queued" },
  NEUTRAL: { icon: IconCircleMinus, color: "#8b949e", title: "Neutral" },
  SKIPPED: { icon: IconCircleMinus, color: "#8b949e", title: "Skipped" },
  CANCELLED: { icon: IconCircleMinus, color: "#8b949e", title: "Cancelled" },
  STALE: { icon: IconCircleMinus, color: "#8b949e", title: "Stale" },
  ACTION_REQUIRED: { icon: IconClock, color: "#d29922", title: "Action required" },
  STARTUP_FAILURE: { icon: IconCircleX, color: "#f85149", title: "Startup failure" },
  TIMED_OUT: { icon: IconCircleX, color: "#f85149", title: "Timed out" },
};

export const ChecksStatusIcon: React.FC<{ status: string | null }> = ({ status }) => {
  if (!status) return null;
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  const Icon = config.icon;
  return <Icon size={14} stroke={1.8} color={config.color} title={config.title} />;
};
