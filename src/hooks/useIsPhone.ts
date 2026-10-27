import { useSyncExternalStore } from "react";

/**
 * A touch screen that is narrow (a phone upright: the 768px breakpoint the
 * Settings and Summary layouts use) or short (a phone on its side). Tablets are
 * neither; a narrowed desktop window has a fine pointer.
 */
const PHONE_QUERY =
  "(pointer: coarse) and (max-width: 767.98px), (pointer: coarse) and (max-height: 500px)";

const media = () => window.matchMedia?.(PHONE_QUERY);

function subscribe(onChange: () => void) {
  const mq = media();
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}

const isPhone = () => media()?.matches ?? false;

/**
 * True on a phone, in the browser and the installed app alike, upright or on
 * its side. Follows changes as they happen.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}
