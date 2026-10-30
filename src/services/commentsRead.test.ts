import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "devhome.commentsRead.v1";
const DAY = 24 * 60 * 60 * 1000;
const T0 = "2026-10-01T00:00:00.000Z";
const PR = { repo_full_name: "acme/web", number: 7 };
const OTHER = { repo_full_name: "acme/web", number: 8 };

/** A fresh copy of the module, so its cache starts empty like a page load. */
const load = async () => {
  vi.resetModules();
  return import("./commentsRead");
};
const saved = () => JSON.parse(localStorage.getItem(KEY) || "null");
const at = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("commentsReadAt", () => {
  it("reads a never-opened PR as the start time, recorded on first use", async () => {
    const store = await load();
    expect(store.commentsReadAt(PR)).toBe(T0);
    expect(saved()).toEqual({ since: T0, read: {} });

    // A later page load keeps the original start time.
    vi.setSystemTime(new Date(at(5 * DAY)));
    const reloaded = await load();
    expect(reloaded.commentsReadAt(OTHER)).toBe(T0);
  });

  it("tolerates garbled storage", async () => {
    localStorage.setItem(KEY, "{not json");
    const store = await load();
    expect(store.commentsReadAt(PR)).toBe(T0);
    expect(saved()).toEqual({ since: T0, read: {} });
  });

  it("drops wrong-shape entries, keeping the valid ones", async () => {
    const mark = at(DAY);
    localStorage.setItem(
      KEY,
      JSON.stringify({ since: 42, read: { "acme/web#7": mark, "acme/web#8": "soon", x: 3 } }),
    );
    const store = await load();
    expect(store.commentsReadAt(PR)).toBe(mark);
    expect(store.commentsReadAt(OTHER)).toBe(T0);
  });
});

describe("markCommentsRead", () => {
  it("records when the PR was opened, keyed by repo and number, and persists it", async () => {
    const store = await load();
    store.commentsReadAt(PR); // first use: start time T0
    vi.setSystemTime(new Date(at(DAY)));
    store.markCommentsRead(PR);
    expect(store.commentsReadAt(PR)).toBe(at(DAY));
    expect(store.commentsReadAt(OTHER)).toBe(T0);
    expect(saved()).toEqual({ since: T0, read: { "acme/web#7": at(DAY) } });

    const reloaded = await load();
    expect(reloaded.commentsReadAt(PR)).toBe(at(DAY));
  });

  it("never moves a marker backwards", async () => {
    const store = await load();
    store.markCommentsRead(PR, at(2 * DAY));
    store.markCommentsRead(PR, at(DAY));
    expect(store.commentsReadAt(PR)).toBe(at(2 * DAY));
    // Nor behind the start time.
    store.markCommentsRead(OTHER, at(-DAY));
    expect(store.commentsReadAt(OTHER)).toBe(T0);
    expect(saved().read).toEqual({ "acme/web#7": at(2 * DAY) });
  });

  it("prunes markers older than 90 days, without resurrecting their comments", async () => {
    const store = await load();
    store.markCommentsRead(OTHER, at(DAY));
    vi.setSystemTime(new Date(at(100 * DAY)));
    store.markCommentsRead(PR);
    expect(saved().read).toEqual({ "acme/web#7": at(100 * DAY) });
    // The pruned PR reads no earlier than its old marker: the start time moves up to the cutoff.
    expect(store.commentsReadAt(OTHER)).toBe(at(10 * DAY));
  });

  it("merges with another tab's markers instead of overwriting them", async () => {
    const store = await load();
    store.commentsReadAt(PR); // cached
    // Another tab writes; the browser tells this one with a storage event.
    localStorage.setItem(KEY, JSON.stringify({ since: T0, read: { "acme/web#8": at(3 * DAY) } }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    store.markCommentsRead(PR, at(DAY));
    expect(saved().read).toEqual({ "acme/web#7": at(DAY), "acme/web#8": at(3 * DAY) });
    expect(store.commentsReadAt(OTHER)).toBe(at(3 * DAY));
  });

  it("swallows quota errors and keeps the marker in memory", async () => {
    const store = await load();
    store.commentsReadAt(PR);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => store.markCommentsRead(PR, at(DAY))).not.toThrow();
    expect(store.commentsReadAt(PR)).toBe(at(DAY));
  });

  it("keeps every marker in memory while storage can't be written", async () => {
    const store = await load();
    store.commentsReadAt(PR);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    store.markCommentsRead(PR, at(DAY));
    store.markCommentsRead(OTHER, at(2 * DAY));
    // The start time stays put, so other PRs keep their new comments.
    expect(store.commentsReadAt(PR)).toBe(at(DAY));
    expect(store.commentsReadAt(OTHER)).toBe(at(2 * DAY));
    expect(store.commentsReadAt({ repo_full_name: "acme/web", number: 9 })).toBe(T0);
  });
});

describe("subscribeCommentsRead", () => {
  it("notifies on a new marker until unsubscribed", async () => {
    const store = await load();
    const onChange = vi.fn();
    const unsubscribe = store.subscribeCommentsRead(onChange);
    store.markCommentsRead(PR, at(DAY));
    expect(onChange).toHaveBeenCalledTimes(1);
    // A no-op (older) mark doesn't notify.
    store.markCommentsRead(PR, T0);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.markCommentsRead(PR, at(2 * DAY));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("picks up markers written by another tab", async () => {
    const store = await load();
    expect(store.commentsReadAt(PR)).toBe(T0);
    const onChange = vi.fn();
    const unsubscribe = store.subscribeCommentsRead(onChange);

    const value = JSON.stringify({ since: T0, read: { "acme/web#7": at(3 * DAY) } });
    localStorage.setItem(KEY, value);
    window.dispatchEvent(new StorageEvent("storage", { key: "other-key" }));
    expect(onChange).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: value }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.commentsReadAt(PR)).toBe(at(3 * DAY));
    unsubscribe();
  });

  it("drops its stale copy on another tab's write even with nobody subscribed", async () => {
    const store = await load();
    expect(store.commentsReadAt(PR)).toBe(T0);
    const value = JSON.stringify({ since: T0, read: { "acme/web#7": at(3 * DAY) } });
    localStorage.setItem(KEY, value);
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: value }));
    expect(store.commentsReadAt(PR)).toBe(at(3 * DAY));
  });
});

describe("useCommentsReadAt", () => {
  it("is null without a PR", async () => {
    const store = await load();
    const { result } = renderHook(() => store.useCommentsReadAt(null));
    expect(result.current).toBeNull();
  });

  it("re-renders when the PR's marker changes, here or in another tab", async () => {
    const store = await load();
    const { result } = renderHook(() => store.useCommentsReadAt(PR));
    expect(result.current).toBe(T0);

    act(() => store.markCommentsRead(PR, at(DAY)));
    expect(result.current).toBe(at(DAY));

    const value = JSON.stringify({ since: T0, read: { "acme/web#7": at(4 * DAY) } });
    act(() => {
      localStorage.setItem(KEY, value);
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: value }));
    });
    expect(result.current).toBe(at(4 * DAY));
  });
});
