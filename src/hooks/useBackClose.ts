import { useEffect, useRef } from "react";
import { useIsPhone } from "./useIsPhone";

/*
 * On a phone, Back (Android's back gesture) closes the overlay on top instead
 * of leaving the app. Each open overlay holds one history entry above the
 * page's own: a back pops one and closes the overlay on top, and an overlay
 * closed another way (its ×, the backdrop, Escape) gives its entry back.
 *
 * In the installed app one more entry, the guard, sits under the overlays, so
 * a back with nothing open asks first and only the next one leaves.
 *
 * Chrome's back skips entries a page added without a tap since the last back,
 * so entries are only added after a tap or key press: one that's due waits
 * for the next.
 */

const KEY = "devHomeBack";

interface Layer {
  close(): void;
}

/** Open overlays, bottom first. */
const layers: Layer[] = [];
/** Says "back again to exit", while the guard is on. */
let prompt: (() => void) | null = null;
/** A back left the guard: the next one leaves the app. */
let exiting = false;
/** Our entries at and under the current one. */
let depth = 0;
/** Our own `history.go` is under way: its popstate isn't a back. */
let traversing = false;
/** A tap or key press since the last back. */
let activated = false;
let listening = false;
let queued = false;

const depthOf = (state: unknown): number => {
  const d = (state as Record<string, unknown> | null)?.[KEY];
  return typeof d === "number" ? d : 0;
};

const wanted = () => (prompt && !exiting ? 1 : 0) + layers.length;

/** Adds or gives back entries to match the open overlays and the guard. */
function sync() {
  queued = false;
  // A push now would cancel the traversal; its popstate syncs again.
  if (traversing) return;
  const want = wanted();
  if (want < depth) {
    traversing = true;
    history.go(want - depth);
  } else if (want > depth && activated) {
    while (depth < want) history.pushState({ [KEY]: ++depth }, "");
  }
}

function schedule() {
  if (queued) return;
  queued = true;
  // After the commit at hand, so an overlay closing as another opens nets out.
  queueMicrotask(sync);
}

function onPopState(e: PopStateEvent) {
  activated = false;
  depth = depthOf(e.state);
  const ours = traversing;
  traversing = false;
  if (!ours) {
    // What the back took away: overlays from the top, then the guard.
    const above = wanted() - depth;
    const closing = layers.slice(Math.max(0, layers.length - above)).reverse();
    if (closing.length > 0) closing.forEach((l) => l.close());
    else if (above > 0 && prompt) {
      exiting = true;
      prompt();
    }
  }
  // An overlay that stays open (unsaved changes) gets its entry back after the next tap.
  schedule();
}

function onActivation(e: Event) {
  if (e instanceof KeyboardEvent && e.key === "Escape") return;
  activated = true;
  exiting = false;
  schedule();
}

function listen() {
  if (listening) return;
  listening = true;
  depth = depthOf(history.state);
  // Taps before now count: no back has happened unseen since.
  activated = navigator.userActivation?.hasBeenActive ?? false;
  window.addEventListener("popstate", onPopState);
  window.addEventListener("click", onActivation, true);
  window.addEventListener("keydown", onActivation, true);
}

function addLayer(close: () => void): () => void {
  listen();
  const layer = { close };
  layers.push(layer);
  schedule();
  return () => {
    const i = layers.indexOf(layer);
    if (i !== -1) layers.splice(i, 1);
    schedule();
  };
}

function setPrompt(fn: () => void): () => void {
  listen();
  prompt = fn;
  schedule();
  return () => {
    if (prompt === fn) prompt = null;
    schedule();
  };
}

/** While `open` on a phone, Back calls `onClose` instead of leaving the app. */
export function useBackClose(open: boolean, onClose: () => void): void {
  const phone = useIsPhone();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!phone) return;
    // From mount, so the tap that opens the overlay is seen.
    listen();
    if (open) return addLayer(() => closeRef.current());
  }, [open, phone]);
}

const installed = () => window.matchMedia?.("(display-mode: standalone)").matches ?? false;

/**
 * In the installed app on a phone, a Back with nothing open calls `onPrompt`
 * (to say "back again to exit") instead of leaving; the next Back leaves.
 */
export function useBackExitPrompt(onPrompt: () => void): void {
  const phone = useIsPhone();
  const promptRef = useRef(onPrompt);
  promptRef.current = onPrompt;
  useEffect(() => {
    if (!phone || !installed()) return;
    return setPrompt(() => promptRef.current());
  }, [phone]);
}
