import { useEffect, useState } from "react";
import { IconWifiOff, IconWifi } from "@tabler/icons-react";
import "./ConnectionBanner.css";

export const RECONNECTED_DISMISS_MS = 2000;

type Status = "online" | "offline" | "reconnected";

/**
 * Fixed top bar: red while the browser is offline, then green "Reconnected" for a moment once
 * the connection returns. Overlays the page so showing/hiding it never reflows the layout.
 */
export function ConnectionBanner() {
  const [status, setStatus] = useState<Status>(() => (navigator.onLine ? "online" : "offline"));

  useEffect(() => {
    const goOffline = () => setStatus("offline");
    const goOnline = () => setStatus((s) => (s === "offline" ? "reconnected" : s));
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    if (status !== "reconnected") return;
    const id = setTimeout(() => setStatus("online"), RECONNECTED_DISMISS_MS);
    return () => clearTimeout(id);
  }, [status]);

  if (status === "online") return null;

  const offline = status === "offline";
  return (
    <div
      className={`connection-banner ${offline ? "is-offline" : "is-reconnected"}`}
      role={offline ? "alert" : "status"}
    >
      {offline ? <IconWifiOff size={14} /> : <IconWifi size={14} />}
      <span>{offline ? "No internet connection" : "Reconnected"}</span>
    </div>
  );
}
