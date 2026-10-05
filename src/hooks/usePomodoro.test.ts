import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePomodoro } from "./usePomodoro";

describe("usePomodoro", () => {
  let notify: ReturnType<typeof vi.fn<(title: string) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    notify = vi.fn<(title: string) => void>();
    class MockNotification {
      static permission = "granted";
      static requestPermission = vi.fn(() => Promise.resolve("granted"));
      constructor(title: string) {
        notify(title);
      }
    }
    // @ts-expect-error test double
    global.Notification = MockNotification;
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // @ts-expect-error clean up test double
    delete global.Notification;
  });

  it("re-renders once per second and notifies once at the end of the phase", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return usePomodoro({ focusableItems: [] });
    });
    act(() => result.current.start());
    const afterStart = renders;

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // 4 ticks/sec but only one update per displayed second.
    expect(renders - afterStart).toBeLessThanOrEqual(11);

    act(() => {
      vi.advanceTimersByTime(30 * 60_000);
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Work session complete");
    expect(result.current.phase).toBe("shortBreak");
    expect(result.current.isRunning).toBe(false);
  });

  it("doesn't rewrite storage on every countdown tick", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => usePomodoro({ focusableItems: [] }));
    act(() => result.current.start());
    setItem.mockClear();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(setItem).not.toHaveBeenCalled();
  });
});
