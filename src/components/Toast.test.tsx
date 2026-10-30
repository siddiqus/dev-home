import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Toast, toastProps, useToast } from "./Toast";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useToast", () => {
  it("hides after its time, dropping the action so it can't fire later", () => {
    const { result } = renderHook(() => useToast(2000));
    act(() =>
      result.current.show("Resolved thread", { action: { label: "Undo", onClick: vi.fn() } }),
    );
    expect(result.current.visible).toBe(true);
    expect(result.current.action?.label).toBe("Undo");
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.visible).toBe(false);
    // It keeps its shape while it fades, then drops the action.
    expect(result.current.action?.label).toBe("Undo");
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.action).toBeNull();
    // The message stays while it fades out.
    expect(result.current.message).toBe("Resolved thread");
  });

  it("holds while hovered or focused, then gets its full time again", () => {
    const { result } = renderHook(() => useToast(2000));
    act(() => result.current.show("Resolved thread", { durationMs: 5000 }));
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.hold());
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.visible).toBe(true);
    act(() => result.current.release());
    act(() => vi.advanceTimersByTime(4999));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(false);
  });

  it("hides at once on hide()", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.show("Hi", { action: { label: "Undo", onClick: vi.fn() } }));
    act(() => result.current.hide());
    expect(result.current.visible).toBe(false);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.action).toBeNull();
  });
});

describe("Toast", () => {
  function Harness({ onUndo }: { onUndo: () => void }) {
    const toast = useToast();
    return (
      <>
        <button
          type="button"
          onClick={() =>
            toast.show("Resolved thread", { action: { label: "Undo", onClick: onUndo } })
          }
        >
          Resolve
        </button>
        <Toast {...toastProps(toast)} />
      </>
    );
  }

  it("shows an action button while visible", () => {
    const onUndo = vi.fn();
    render(<Harness onUndo={onUndo} />);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("takes clicks only with an action", () => {
    const { container, rerender } = render(<Toast message="Copied" visible />);
    expect(container.firstChild).not.toHaveClass("app-toast--action");
    rerender(<Toast message="Resolved" visible action={{ label: "Undo", onClick: vi.fn() }} />);
    expect(container.firstChild).toHaveClass("app-toast--action");
  });
});
