import { useRegisterSW } from "virtual:pwa-register/react";
import { trackEvent } from "../lib/analytics";
import "./UpdateToast.css";

/**
 * Fixed bottom toast shown when a new service worker is waiting. Never reloads on its own:
 * the new version only takes over when the user clicks Reload.
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="update-toast" role="status">
      <span>New version available</span>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={() => {
          trackEvent("update_reload");
          void updateServiceWorker(true);
        }}
      >
        Reload
      </button>
      <button
        type="button"
        className="update-toast-dismiss"
        aria-label="Dismiss"
        onClick={() => setNeedRefresh(false)}
      >
        ×
      </button>
    </div>
  );
}
