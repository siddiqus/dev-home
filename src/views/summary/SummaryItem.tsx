import React from "react";
import { Badge, BadgeVariant } from "../../components/primitives/Badge";
import { ChecksStatusIcon } from "../../components/ChecksStatusIcon";
import { formatRelativeTime } from "../../utils/time";

export interface SummaryItemProps {
  url: string;
  title: string;
  subtitle: string;
  time: string;
  badge?: string;
  badgeVariant?: BadgeVariant;
  checksStatus?: string | null;
  onClick?: () => void;
}

export const SummaryItem: React.FC<SummaryItemProps> = ({
  url,
  title,
  subtitle,
  time,
  badge,
  badgeVariant,
  checksStatus,
  onClick,
}) => {
  return (
    <div className="summary-item d-flex align-items-center gap-3 px-3 py-2" onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-truncate-custom d-block"
          style={{ fontWeight: 500, fontSize: "0.8125rem" }}
          onClick={(e) => e.stopPropagation()}
        >
          {title}
        </a>
        <div className="text-secondary-custom" style={{ fontSize: "0.75rem", marginTop: 1 }}>
          {subtitle}
        </div>
      </div>
      <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
        {badge && <Badge variant={badgeVariant || "neutral"}>{badge}</Badge>}
        <ChecksStatusIcon status={checksStatus ?? null} />
        <span
          className="text-secondary-custom"
          style={{ fontSize: "0.6875rem", whiteSpace: "nowrap" }}
        >
          {formatRelativeTime(time)}
        </span>
      </div>
    </div>
  );
};
