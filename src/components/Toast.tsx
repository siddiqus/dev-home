import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import "./Toast.css";

/** `neutral` is for hints that report nothing done ("back again to exit"). */
export type ToastTone = "success" | "danger" | "neutral";

/** A button in the toast, e.g. Undo for what it reports. */
export interface ToastAction {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/** The toast's fade-out (Toast.css), during which it keeps its shape. */
const FADE_MS = 200;

/**
 * Bottom toast; the message stays set while it fades out. With an action, it
 * holds still while hovered or focused (`onHold` / `onRelease`).
 */
export function Toast({
  message,
  visible,
  tone = "success",
  action,
  actionRef,
  onHold,
  onRelease,
}: {
  message: string;
  visible: boolean;
  tone?: ToastTone;
  action?: ToastAction | null;
  actionRef?: React.Ref<HTMLButtonElement>;
  onHold?: () => void;
  onRelease?: () => void;
}) {
  return (
    <div
      className={`app-toast${tone === "success" ? "" : ` app-toast--${tone}`}${action ? " app-toast--action" : ""} ${visible ? "is-visible" : ""}`}
      role={tone === "danger" ? "alert" : "status"}
      onMouseEnter={action ? onHold : undefined}
      onMouseLeave={action ? onRelease : undefined}
      onFocus={action ? onHold : undefined}
      onBlur={action ? onRelease : undefined}
    >
      {message}
      {action && (
        <button
          ref={actionRef}
          type="button"
          className="app-toast-action"
          tabIndex={visible ? undefined : -1}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * State for a self-hiding <Toast>: `show(msg)` displays it for `durationMs`;
 * a call can override the tone and duration (e.g. a longer-lived error) and
 * add an action button. `hide()` dismisses it early; hiding drops the action
 * once faded out, so a stale Undo can't fire later. Spread `toastProps(state)`
 * into <Toast>.
 */
export function useToast(durationMs = 2000) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const [tone, setTone] = useState<ToastTone>("success");
  const [action, setAction] = useState<ToastAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDuration = useRef(durationMs);
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    // While it fades, the hidden action takes no pointer or Tab (Toast.css, tabIndex).
    timerRef.current = setTimeout(() => setAction(null), FADE_MS);
  }, []);

  const arm = useCallback(
    (ms: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(hide, ms);
    },
    [hide],
  );

  const show = useCallback(
    (
      msg: string,
      opts: { tone?: ToastTone; durationMs?: number; action?: ToastAction | null } = {},
    ) => {
      setMessage(msg);
      setTone(opts.tone ?? "success");
      setAction(opts.action ?? null);
      setVisible(true);
      lastDuration.current = opts.durationMs ?? durationMs;
      arm(lastDuration.current);
    },
    [durationMs, arm],
  );

  /** Keep a toast up while the pointer or focus is on it, then give it its full time again. */
  const hold = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  const release = useCallback(() => arm(lastDuration.current), [arm]);

  /** Move focus to the action (for a keyboard user whose button just went away). */
  const focusAction = useCallback(() => {
    setTimeout(() => actionRef.current?.focus());
  }, []);

  return { message, visible, tone, action, actionRef, show, hide, hold, release, focusAction };
}

export type ToastState = ReturnType<typeof useToast>;

/** <Toast> props from useToast's state. */
export function toastProps(t: ToastState) {
  return {
    message: t.message,
    visible: t.visible,
    tone: t.tone,
    action: t.action,
    actionRef: t.actionRef,
    onHold: t.hold,
    onRelease: t.release,
  };
}
