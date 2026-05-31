import React from "react";

interface TicketGroupHeaderProps {
  groupKey: string;
  count: number;
  title?: string;
  collapsed: boolean;
  onToggle: () => void;
  colSpan: number;
}

export const TicketGroupHeader: React.FC<TicketGroupHeaderProps> = ({
  groupKey,
  count,
  title,
  collapsed,
  onToggle,
  colSpan,
}) => (
  <tr className="ticket-group-header" onClick={onToggle}>
    <td colSpan={colSpan}>
      <span className="ticket-group-chevron">{collapsed ? "▶" : "▼"}</span>
      <span className="ticket-group-label">{groupKey}</span>
      <span className="ticket-group-count">({count})</span>
      {title && <span className="ticket-group-title">{title}</span>}
    </td>
  </tr>
);
