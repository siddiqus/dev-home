import React from "react";

interface StatusBadgeProps {
  statusName: string;
  colorName: string;
}

function getBadgeClass(colorName: string): string {
  const normalized = colorName.toLowerCase();

  switch (normalized) {
    case "blue-gray":
    case "new":
    case "blue":
    case "indigo":
      return "badge-status-blue";
    case "yellow":
      return "badge-status-yellow";
    case "green":
    case "done":
      return "badge-status-green";
    case "red":
      return "badge-status-red";
    default:
      return "badge-status-neutral";
  }
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  statusName,
  colorName,
}) => {
  const badgeClass = getBadgeClass(colorName);

  return <span className={`badge ${badgeClass}`}>{statusName}</span>;
};
