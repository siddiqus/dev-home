import { useCallback, useEffect, useRef, useState } from "react";
import "./Toast.css";

/** `neutral` is for hints that report nothing done ("back again to exit"). */
export type ToastTone = "success" | "danger" | "neutral";

/** Bottom toast; the message stays set while it fades out. */
export function Toast({
  message,
  visible,
  tone = "success",
}: {
  message: string;
  visible: boolean;
  tone?: ToastTone;
}) {
  return (
    <div
      className={`app-toast${tone === "success" ? "" : ` app-toast--${tone}`} ${visible ? "is-visible" : ""}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

/**
 * State for a self-hiding <Toast>: `show(msg)` displays it for `durationMs`;
 * a call can override the tone and duration (e.g. a longer-lived error).
 */
export function useToast(durationMs = 2000) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const [tone, setTone] = useState<ToastTone>("success");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const show = useCallback(
    (msg: string, opts: { tone?: ToastTone; durationMs?: number } = {}) => {
      setMessage(msg);
      setTone(opts.tone ?? "success");
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), opts.durationMs ?? durationMs);
    },
    [durationMs],
  );

  return { message, visible, tone, show };
}
