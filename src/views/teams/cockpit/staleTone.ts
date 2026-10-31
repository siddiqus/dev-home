import type { CSSProperties } from "react";

export function staleTone(days: number): string {
  return days > 4 ? "#dc3545" : "#e0a458";
}

/** Shading for every stalled chip (epic cards and Work Spread): one light red, whatever the count. */
export const STALLED_CHIP_STYLE: CSSProperties = {
  background: "rgba(220,53,69,.08)",
  color: "#dc3545",
  border: "1px solid rgba(220,53,69,.25)",
};
