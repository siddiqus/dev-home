import { useEffect, useRef } from "react";

export const SEEN_DWELL_MS = 1500;

/**
 * Marks a card as seen after a dwell period (1.5s visible).
 * Pauses when the document is hidden, restarts when visible.
 * Calls onSeen once per card visit: when the id goes null (PR modal open,
 * Standup) and comes back to the same card, the dwell doesn't fire again, so a
 * PR marked unread (`u`) during the visit stays unread. Moving to a different
 * card starts a new visit.
 */
export function useSeenTimer(cardId: string | null, onSeen: () => void): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenRef = useRef(false);
  /** The card the dwell last fired for; survives null gaps. */
  const firedForRef = useRef<string | null>(null);

  useEffect(() => {
    // Clear any existing timer when cardId changes or becomes null
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!cardId) {
      return;
    }

    // Same card after a null gap: this visit was already marked seen.
    if (firedForRef.current === cardId) {
      return;
    }
    firedForRef.current = null;
    seenRef.current = false;

    const startTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      if (document.visibilityState === "visible" && !seenRef.current) {
        timerRef.current = setTimeout(() => {
          if (!seenRef.current) {
            seenRef.current = true;
            firedForRef.current = cardId;
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
