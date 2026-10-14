import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStoredState } from "./useStoredState";

const TABS = ["open", "merged"] as const;

describe("useStoredState", () => {
  afterEach(() => localStorage.clear());

  it("starts at the initial value and remembers the last pick", () => {
    const { result, unmount } = renderHook(() => useStoredState("k", "open", TABS));
    expect(result.current[0]).toBe("open");
    act(() => result.current[1]("merged"));
    unmount();
    const again = renderHook(() => useStoredState("k", "open", TABS));
    expect(again.result.current[0]).toBe("merged");
  });

  it("ignores a stored value that isn't allowed", () => {
    localStorage.setItem("k", "gone");
    const { result } = renderHook(() => useStoredState("k", "open", TABS));
    expect(result.current[0]).toBe("open");
  });
});
