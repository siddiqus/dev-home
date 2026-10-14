import type { MouseEvent } from "react";

/**
 * Pointer clicks drop focus so no ring lingers after a modal closes (spec §5.14,
 * same fix as v1). Keyboard "clicks" (Enter/Space on a button) have `detail` 0
 * and keep focus where it is.
 */
export function blurOnPointer(e: MouseEvent): void {
  if (e.detail > 0 && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
