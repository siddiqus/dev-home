import { useCallback, useEffect, useRef, useState } from "react";
import "./Toast.css";

/** Bottom toast; the message stays set while it fades out. */
export function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className={`app-toast ${visible ? "is-visible" : ""}`} role="status">
      {message}
    </div>
  );
}

/** State for a self-hiding <Toast>: `show(msg)` displays it for `durationMs`. */
export function useToast(durationMs = 2000) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const show = useCallback(
    (msg: string) => {
      setMessage(msg);
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), durationMs);
    },
    [durationMs],
  );

  return { message, visible, show };
}
