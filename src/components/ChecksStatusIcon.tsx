import React from "react";
import { IconCircleCheck, IconCircleX, IconClock } from "@tabler/icons-react";

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; title: string }> = {
  SUCCESS: { icon: IconCircleCheck, color: "#3fb950", title: "Checks passed" },
  FAILURE: { icon: IconCircleX, color: "#f85149", title: "Checks failed" },
  ERROR: { icon: IconCircleX, color: "#f85149", title: "Checks errored" },
  PENDING: { icon: IconClock, color: "#d29922", title: "Checks pending" },
  EXPECTED: { icon: IconClock, color: "#d29922", title: "Checks expected" },
};

export const ChecksStatusIcon: React.FC<{ status: string | null }> = ({ status }) => {
  if (!status) return null;
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  const Icon = config.icon;
  return <Icon size={14} stroke={1.8} color={config.color} title={config.title} />;
};
