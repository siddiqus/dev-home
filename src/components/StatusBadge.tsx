import React from "react";
import { Badge, BadgeVariant } from "./primitives/Badge";

interface StatusBadgeProps {
  statusName: string;
  colorName: string;
}

function getBadgeVariant(colorName: string): BadgeVariant {
  const normalized = colorName.toLowerCase();

  switch (normalized) {
    case "blue-gray":
    case "new":
    case "blue":
    case "indigo":
      return "info";
    case "yellow":
      return "warning";
    case "green":
    case "done":
      return "success";
    case "red":
      return "danger";
    default:
      return "neutral";
  }
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ statusName, colorName }) => {
  const variant = getBadgeVariant(colorName);

  return <Badge variant={variant}>{statusName}</Badge>;
};
