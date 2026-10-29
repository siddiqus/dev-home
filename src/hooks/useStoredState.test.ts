import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStoredId, useStoredState } from "./useStoredState";

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

describe("useStoredId", () => {
  afterEach(() => localStorage.clear());

  it("starts from the stored id and survives a remount", () => {
    localStorage.setItem("k", "42");
    const first = renderHook(() => useStoredId("k"));
    expect(first.result.current[0]).toBe(42);

    act(() => first.result.current[1](7));
    first.unmount();
    expect(renderHook(() => useStoredId("k")).result.current[0]).toBe(7);
  });

  it("clears the stored id when set to null", () => {
    const { result } = renderHook(() => useStoredId("k"));
    act(() => result.current[1](3));
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("ignores a value that isn't an id", () => {
    localStorage.setItem("k", "abc");
    expect(renderHook(() => useStoredId("k")).result.current[0]).toBeNull();
  });
});
