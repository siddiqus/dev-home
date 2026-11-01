import type { CSSProperties } from "react";

/** A stalled ticket's last-update color: the theme's warning, then danger past four days. */
export function staleTone(days: number): string {
  return days > 4 ? "var(--color-status-danger)" : "var(--color-status-warning)";
}

/** Shading for every stalled chip (epic cards and Work Spread): one light red, whatever the count. */
export const STALLED_CHIP_STYLE: CSSProperties = {
  background: "rgba(220,53,69,.08)",
  color: "#dc3545",
  border: "1px solid rgba(220,53,69,.25)",
};
