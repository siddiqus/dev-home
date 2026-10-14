import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDeckKeys } from "./useDeckKeys";
import type { DeckKeyHandlers } from "./useDeckKeys";

describe("useDeckKeys", () => {
  let handlers: DeckKeyHandlers;

  beforeEach(() => {
    handlers = {
      next: vi.fn(),
      prev: vi.fn(),
      down: vi.fn(),
      up: vi.fn(),
      toggleCurrent: vi.fn(),
      open: vi.fn(),
      openExternal: vi.fn(),
      note: vi.fn(),
      close: vi.fn(),
      unread: vi.fn(),
      nextUpdated: vi.fn(),
      toggleOnlyCurrent: vi.fn(),
      refresh: vi.fn(),
      palette: vi.fn(),
      focusMode: vi.fn(),
      standupMode: vi.fn(),
      help: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fireKey = (key: string, options: Partial<KeyboardEventInit> = {}) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    Object.defineProperty(event, "repeat", { value: options.repeat ?? false });
    document.dispatchEvent(event);
    return event;
  };

  it("fires next handler on → key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("ArrowRight");
    expect(handlers.next).toHaveBeenCalledTimes(1);
  });

  it("fires prev handler on ← key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("ArrowLeft");
    expect(handlers.prev).toHaveBeenCalledTimes(1);
  });

  it("fires down handler on ↓ key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("ArrowDown");
    expect(handlers.down).toHaveBeenCalledTimes(1);
  });

  it("fires up handler on ↑ key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("ArrowUp");
    expect(handlers.up).toHaveBeenCalledTimes(1);
  });

  it("fires toggleCurrent handler on Space", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey(" ");
    expect(handlers.toggleCurrent).toHaveBeenCalledTimes(1);
  });

  it("fires open handler on Enter", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("Enter");
    expect(handlers.open).toHaveBeenCalledTimes(1);
  });

  it("fires openExternal handler on ⌘Enter", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("Enter", { metaKey: true });
    expect(handlers.openExternal).toHaveBeenCalledTimes(1);
  });

  it("fires note handler on . key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey(".");
    expect(handlers.note).toHaveBeenCalledTimes(1);
  });

  it("fires close handler on x key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("x");
    expect(handlers.close).toHaveBeenCalledTimes(1);
  });

  it("fires unread handler on u key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("u");
    expect(handlers.unread).toHaveBeenCalledTimes(1);
  });

  it("fires nextUpdated handler on n key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("n");
    expect(handlers.nextUpdated).toHaveBeenCalledTimes(1);
  });

  it("fires refresh handler on r key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("r");
    expect(handlers.refresh).toHaveBeenCalledTimes(1);
  });

  it("fires palette handler on ⌘K", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("k", { metaKey: true });
    expect(handlers.palette).toHaveBeenCalledTimes(1);
  });

  it("fires palette handler on Ctrl+K", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("k", { ctrlKey: true });
    expect(handlers.palette).toHaveBeenCalledTimes(1);
  });

  it("fires focusMode handler on F key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("f");
    expect(handlers.focusMode).toHaveBeenCalledTimes(1);
  });

  it("fires focusMode handler on Shift+F", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("F", { shiftKey: true });
    expect(handlers.focusMode).toHaveBeenCalledTimes(1);
  });

  it("fires standupMode handler on S key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("s");
    expect(handlers.standupMode).toHaveBeenCalledTimes(1);
  });

  it("fires standupMode handler on Shift+S", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("S", { shiftKey: true });
    expect(handlers.standupMode).toHaveBeenCalledTimes(1);
  });

  it("fires help handler on ? key", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    fireKey("?", { shiftKey: true });
    expect(handlers.help).toHaveBeenCalledTimes(1);
  });

  it("fires toggleOnlyCurrent handler on 'g c' sequence", () => {
    vi.useFakeTimers();
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    fireKey("g");
    expect(handlers.toggleOnlyCurrent).not.toHaveBeenCalled();

    fireKey("c");
    expect(handlers.toggleOnlyCurrent).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("does not fire toggleOnlyCurrent if c comes after 1s", () => {
    vi.useFakeTimers();
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    fireKey("g");
    vi.advanceTimersByTime(1100);
    fireKey("c");

    expect(handlers.toggleOnlyCurrent).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("ignores keys when enabled is false", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: false, blocked: false }));
    fireKey("ArrowRight");
    fireKey("Space");
    fireKey("x");

    expect(handlers.next).not.toHaveBeenCalled();
    expect(handlers.toggleCurrent).not.toHaveBeenCalled();
    expect(handlers.close).not.toHaveBeenCalled();
  });

  it("ignores most keys when blocked is true", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: true }));
    fireKey("ArrowRight");
    fireKey("Space");
    fireKey("x");
    fireKey("n");

    expect(handlers.next).not.toHaveBeenCalled();
    expect(handlers.toggleCurrent).not.toHaveBeenCalled();
    expect(handlers.close).not.toHaveBeenCalled();
    expect(handlers.nextUpdated).not.toHaveBeenCalled();
  });

  it("allows ⌘K when blocked is true", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: true }));
    fireKey("k", { metaKey: true });
    expect(handlers.palette).toHaveBeenCalledTimes(1);
  });

  it("ignores keys when typing in input", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", {
      key: "x",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(handlers.close).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("ignores keys when typing in textarea", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    const event = new KeyboardEvent("keydown", {
      key: "x",
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);

    expect(handlers.close).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it("ignores keys when typing in contenteditable", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const div = document.createElement("div");
    document.body.appendChild(div);

    // JSDOM doesn't fully implement isContentEditable, so mock it
    Object.defineProperty(div, "isContentEditable", {
      value: true,
      writable: true,
    });
    div.focus();

    const event = new KeyboardEvent("keydown", {
      key: "x",
      bubbles: true,
      cancelable: true,
    });
    div.dispatchEvent(event);

    expect(handlers.close).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it("ignores ⌘+digit keys", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    for (let i = 0; i <= 9; i++) {
      fireKey(String(i), { metaKey: true });
    }

    // None of the handlers should be called
    Object.values(handlers).forEach((handler) => {
      expect(handler).not.toHaveBeenCalled();
    });
  });

  it("calls preventDefault on handled keys", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const event = fireKey(" ");
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores repeat events for toggles", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    fireKey(" ", { repeat: true });
    expect(handlers.toggleCurrent).not.toHaveBeenCalled();

    fireKey("x", { repeat: true });
    expect(handlers.close).not.toHaveBeenCalled();
  });

  it("allows repeat for navigation keys", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    fireKey("ArrowRight", { repeat: true });
    expect(handlers.next).toHaveBeenCalledTimes(1);

    fireKey("ArrowDown", { repeat: true });
    expect(handlers.down).toHaveBeenCalledTimes(1);
  });

  it("does not call open when Enter is pressed on a button", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);

    expect(handlers.open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(button);
  });

  it("does not call open when Enter is pressed on a link", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const link = document.createElement("a");
    link.href = "#";
    document.body.appendChild(link);
    link.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);

    expect(handlers.open).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("does not call open when Enter is pressed on [role=button]", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const div = document.createElement("div");
    div.setAttribute("role", "button");
    document.body.appendChild(div);
    div.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    div.dispatchEvent(event);

    expect(handlers.open).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it("does not call toggleCurrent when Space is pressed on a button", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);

    expect(handlers.toggleCurrent).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    document.body.removeChild(button);
  });

  it("does not call openExternal when ⌘Enter is pressed on a button", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);

    expect(handlers.openExternal).not.toHaveBeenCalled();

    document.body.removeChild(button);
  });

  it("leaves Enter and Space native on links and buttons inside a listbox", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));

    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    const option = document.createElement("div");
    option.setAttribute("role", "option");
    const link = document.createElement("a");
    link.href = "https://example.com";
    const button = document.createElement("button");
    option.append(link, button);
    listbox.appendChild(option);
    document.body.appendChild(listbox);
    try {
      for (const target of [link, button]) {
        for (const key of ["Enter", " "]) {
          const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
          target.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(false);
        }
      }
      expect(handlers.open).not.toHaveBeenCalled();
      expect(handlers.toggleCurrent).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(listbox);
    }
  });

  it("still handles Enter and Space on the listbox itself", () => {
    renderHook(() => useDeckKeys(handlers, { enabled: true, blocked: false }));
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.tabIndex = 0;
    document.body.appendChild(listbox);
    try {
      const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      listbox.dispatchEvent(enter);
      const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
      listbox.dispatchEvent(space);
      expect(handlers.open).toHaveBeenCalledTimes(1);
      expect(handlers.toggleCurrent).toHaveBeenCalledTimes(1);
      expect(enter.defaultPrevented).toBe(true);
      expect(space.defaultPrevented).toBe(true);
    } finally {
      document.body.removeChild(listbox);
    }
  });

  it("stands down without preventDefault while isBlocked() says so, except ⌘K", () => {
    let open = true;
    renderHook(() =>
      useDeckKeys(handlers, { enabled: true, blocked: false, isBlocked: () => open }),
    );
    for (const key of ["ArrowDown", "ArrowUp", " ", "Enter", "x", "n"]) {
      expect(fireKey(key).defaultPrevented).toBe(false);
    }
    expect(handlers.down).not.toHaveBeenCalled();
    expect(handlers.toggleCurrent).not.toHaveBeenCalled();
    expect(handlers.close).not.toHaveBeenCalled();
    expect(fireKey("k", { metaKey: true }).defaultPrevented).toBe(true);
    expect(handlers.palette).toHaveBeenCalledTimes(1);
    open = false;
    expect(fireKey("ArrowDown").defaultPrevented).toBe(true);
    expect(handlers.down).toHaveBeenCalledTimes(1);
  });
});
