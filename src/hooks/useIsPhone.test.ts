import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useIsPhone } from "./useIsPhone";

const original = window.matchMedia;

/** A matchMedia whose answer can be flipped, firing "change". */
function fakeMatchMedia(phone: boolean) {
  const listeners = new Set<() => void>();
  let matches = phone;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((l) => l());
    },
  };
}

afterEach(() => {
  window.matchMedia = original;
});

describe("useIsPhone", () => {
  it("is true when the screen matches the phone query and false otherwise", () => {
    fakeMatchMedia(true);
    expect(renderHook(() => useIsPhone()).result.current).toBe(true);
    fakeMatchMedia(false);
    expect(renderHook(() => useIsPhone()).result.current).toBe(false);
  });

  it("follows the screen as it changes", () => {
    const media = fakeMatchMedia(false);
    const { result } = renderHook(() => useIsPhone());
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it("is false where matchMedia is missing", () => {
    // @ts-expect-error -- jsdom-like environments have no matchMedia
    window.matchMedia = undefined;
    expect(renderHook(() => useIsPhone()).result.current).toBe(false);
  });
});
