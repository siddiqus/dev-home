import { useEffect, useRef, type MutableRefObject } from "react";
import { isMac } from "./useKeyboardShortcuts";

export const submitShortcutHint = isMac ? "⌘↵" : "Ctrl ↵";

export function isSubmitShortcut(e: KeyboardEvent): boolean {
  return e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.repeat && !e.isComposing;
}

// Only the form activated last gets the shortcut, so a modal over Settings doesn't save both.
const stack: MutableRefObject<() => void>[] = [];

function onKeyDown(e: KeyboardEvent) {
  const top = stack[stack.length - 1];
  if (!top || !isSubmitShortcut(e)) return;
  e.preventDefault();
  e.stopPropagation();
  top.current();
}

/** ⌘↵ / Ctrl+↵ calls `onSubmit` while `active`; `onSubmit` should no-op when its button is disabled. */
export function useSubmitShortcut(onSubmit: () => void, active: boolean): void {
  const ref = useRef(onSubmit);
  ref.current = onSubmit;
  useEffect(() => {
    if (!active) return;
    stack.push(ref);
    if (stack.length === 1) document.addEventListener("keydown", onKeyDown);
    return () => {
      stack.splice(stack.lastIndexOf(ref), 1);
      if (stack.length === 0) document.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);
}
