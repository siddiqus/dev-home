import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSubmitShortcut } from "./useSubmitShortcut";

const press = (init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.body, { key: "Enter", metaKey: true, ...init });

describe("useSubmitShortcut", () => {
  it("submits on ⌘↵ and Ctrl+↵, and keeps the browser from acting on it", () => {
    const onSubmit = vi.fn();
    renderHook(() => useSubmitShortcut(onSubmit, true));

    expect(press()).toBe(false);
    press({ metaKey: false, ctrlKey: true });

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("leaves plain Enter, held-down keys and IME composition alone", () => {
    const onSubmit = vi.fn();
    renderHook(() => useSubmitShortcut(onSubmit, true));

    press({ metaKey: false });
    press({ repeat: true });
    press({ isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does nothing while inactive", () => {
    const onSubmit = vi.fn();
    renderHook(() => useSubmitShortcut(onSubmit, false));

    expect(press()).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("gives the shortcut to the form opened last, and back when it closes", () => {
    const page = vi.fn();
    const modal = vi.fn();
    renderHook(() => useSubmitShortcut(page, true));
    const { unmount } = renderHook(() => useSubmitShortcut(modal, true));

    press();
    expect(modal).toHaveBeenCalledTimes(1);
    expect(page).not.toHaveBeenCalled();

    unmount();
    press();
    expect(page).toHaveBeenCalledTimes(1);
    expect(modal).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback after a re-render", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useSubmitShortcut(fn, true), {
      initialProps: { fn: first },
    });

    rerender({ fn: second });
    press();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
