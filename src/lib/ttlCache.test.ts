import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCached, writeCached } from "./ttlCache";

describe("ttlCache", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("round-trips within the TTL and expires after it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    writeCached("k", { data: [1, 2] });
    expect(JSON.parse(localStorage.getItem("k")!)).toEqual({ data: [1, 2], timestamp: 1_000 });
    vi.setSystemTime(1_500);
    expect(readCached<{ data: number[] }>("k", 500)?.data).toEqual([1, 2]);
    vi.setSystemTime(1_501);
    expect(readCached("k", 500)).toBeNull();
  });

  it("supports a custom stamp field", () => {
    writeCached("k", { filters: ["a"] }, "ts");
    expect(readCached<{ filters: string[] }>("k", 1_000, "ts")?.filters).toEqual(["a"]);
    expect(readCached("k", 1_000)).toBeNull();
  });

  it("reads missing, corrupt or unstamped entries as null", () => {
    expect(readCached("k", 1_000)).toBeNull();
    localStorage.setItem("k", "{not json");
    expect(readCached("k", 1_000)).toBeNull();
    localStorage.setItem("k", JSON.stringify({ data: 1 }));
    expect(readCached("k", 1_000)).toBeNull();
  });
});
