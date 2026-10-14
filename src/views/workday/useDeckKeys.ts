import { useEffect, useRef } from "react";
import { isTypingTarget } from "../../utils/dom";

export interface DeckKeyHandlers {
  next(): void;
  prev(): void;
  down(): void;
  up(): void;
  toggleCurrent(): void;
  open(): void;
  openExternal(): void;
  note(): void;
  close(): void;
  unread(): void;
  nextUpdated(): void;
  toggleOnlyCurrent(): void;
  refresh(): void;
  palette(): void;
  focusMode(): void;
  standupMode(): void;
  help(): void;
}

const SEQUENCE_TIMEOUT_MS = 1000;

/** Links and buttons keep their native Enter/Space, wherever they sit (rows included). */
const isInteractiveControl = (target: EventTarget | null): boolean =>
  target instanceof Element && target.matches('button, a[href], [role="button"], summary');

/**
 * Focus-mode keyboard map with guards.
 * Ignores keys while typing in input/textarea/contenteditable,
 * and while blocked (modal/drawer/note editor/palette open),
 * except ⌘K/Ctrl+K which always works. `isBlocked` is checked on every key,
 * for state only the DOM knows (an open drawer or modal): a blocked key is
 * left alone entirely, so arrows and Space still scroll the drawer.
 */
export function useDeckKeys(
  h: DeckKeyHandlers,
  opts: { enabled: boolean; blocked: boolean; isBlocked?: () => boolean },
): void {
  const { enabled, blocked, isBlocked } = opts;
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingForCRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K always works, even when blocked or typing
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        h.palette();
        return;
      }

      // Ignore if typing target or blocked (after checking for ⌘K above)
      if (isTypingTarget(e.target) || blocked || isBlocked?.()) return;

      const key = e.key;
      const lowerKey = key.toLowerCase();

      // Never handle ⌘+digit
      if ((e.metaKey || e.ctrlKey) && /^[0-9]$/.test(key)) {
        return;
      }

      // Navigation keys (allow repeat)
      if (key === "ArrowRight") {
        e.preventDefault();
        h.next();
        return;
      }
      if (key === "ArrowLeft") {
        e.preventDefault();
        h.prev();
        return;
      }
      if (key === "ArrowDown") {
        e.preventDefault();
        h.down();
        return;
      }
      if (key === "ArrowUp") {
        e.preventDefault();
        h.up();
        return;
      }

      // ⌘Enter → openExternal
      if (key === "Enter" && (e.metaKey || e.ctrlKey)) {
        if (isInteractiveControl(e.target)) return;
        e.preventDefault();
        h.openExternal();
        return;
      }

      // Ignore repeat for toggles and non-navigation actions
      if (e.repeat) return;

      // Enter → open
      if (key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (isInteractiveControl(e.target)) return;
        e.preventDefault();
        h.open();
        return;
      }

      // Space → toggleCurrent
      if (key === " " && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (isInteractiveControl(e.target)) return;
        e.preventDefault();
        h.toggleCurrent();
        return;
      }

      // Single-key shortcuts (no modifiers)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // . → note
      if (key === ".") {
        e.preventDefault();
        h.note();
        return;
      }

      // x → close
      if (lowerKey === "x") {
        e.preventDefault();
        h.close();
        return;
      }

      // u → unread
      if (lowerKey === "u") {
        e.preventDefault();
        h.unread();
        return;
      }

      // n → nextUpdated
      if (lowerKey === "n") {
        e.preventDefault();
        h.nextUpdated();
        return;
      }

      // r → refresh
      if (lowerKey === "r") {
        e.preventDefault();
        h.refresh();
        return;
      }

      // F / f → focusMode (match shift or not)
      if (lowerKey === "f") {
        e.preventDefault();
        h.focusMode();
        return;
      }

      // S / s → standupMode (match shift or not)
      if (lowerKey === "s") {
        e.preventDefault();
        h.standupMode();
        return;
      }

      // ? → help
      if (key === "?" && e.shiftKey) {
        e.preventDefault();
        h.help();
        return;
      }

      // g c sequence (within 1s)
      if (lowerKey === "g") {
        e.preventDefault();
        waitingForCRef.current = true;

        if (sequenceTimerRef.current !== null) {
          clearTimeout(sequenceTimerRef.current);
        }

        sequenceTimerRef.current = setTimeout(() => {
          waitingForCRef.current = false;
          sequenceTimerRef.current = null;
        }, SEQUENCE_TIMEOUT_MS);
        return;
      }

      if (lowerKey === "c" && waitingForCRef.current) {
        e.preventDefault();
        waitingForCRef.current = false;
        if (sequenceTimerRef.current !== null) {
          clearTimeout(sequenceTimerRef.current);
          sequenceTimerRef.current = null;
        }
        h.toggleOnlyCurrent();
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (sequenceTimerRef.current !== null) {
        clearTimeout(sequenceTimerRef.current);
      }
    };
  }, [enabled, blocked, isBlocked, h]);
}
