import "@testing-library/jest-dom/vitest";
import { afterAll } from "vitest";

// react-bootstrap's Fade (Modal, Toast, …) arms a fallback setTimeout via
// dom-helpers/transitionEnd that fires ~5ms later and dispatches on `document`.
// It's never cleared on unmount, so if a file's last test finishes inside that
// window, jsdom is torn down first and the timer throws "document is not
// defined" — an unhandled error that fails the run. Let pending timers drain
// before the environment goes away.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 50)));

// jsdom doesn't implement scrollIntoView, but our dropdown components call it to
// keep the keyboard-highlighted option in view when they open. Stub it globally.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
