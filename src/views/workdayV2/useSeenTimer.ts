import { useEffect, useRef } from "react";

export const SEEN_DWELL_MS = 1500;

/**
 * Marks a card as seen after a dwell period (1.5s visible).
 * Pauses when the document is hidden, restarts when visible.
 * Calls onSeen once per card display.
 */
export function useSeenTimer(cardId: string | null, onSeen: () => void): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenRef = useRef(false);

  useEffect(() => {
    // Clear any existing timer when cardId changes or becomes null
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Reset seen flag for new card
    seenRef.current = false;

    if (!cardId) {
      return;
    }

    const startTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      if (document.visibilityState === "visible" && !seenRef.current) {
        timerRef.current = setTimeout(() => {
          if (!seenRef.current) {
            seenRef.current = true;
            onSeen();
          }
        }, SEEN_DWELL_MS);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Restart timer when becoming visible
        startTimer();
      } else {
        // Pause timer when becoming hidden
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    // Start timer if visible
    startTimer();

    // Listen for visibility changes
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cardId, onSeen]);
}
