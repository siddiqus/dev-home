import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollIntoView, but our dropdown components call it to
// keep the keyboard-highlighted option in view when they open. Stub it globally.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
