import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

const realClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const realExecCommand = document.execCommand;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

afterEach(() => {
  if (realClipboard) Object.defineProperty(navigator, "clipboard", realClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
  document.execCommand = realExecCommand;
});

describe("copyText", () => {
  it("uses the Clipboard API where it exists", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    document.execCommand = vi.fn(() => true);
    await copyText("https://github.com/o/r/pull/42");
    expect(writeText).toHaveBeenCalledWith("https://github.com/o/r/pull/42");
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it("falls back to copying a selection on plain-http origins, which have no Clipboard API", async () => {
    // e.g. the dev server opened on a phone at http://192.168.x.x
    setClipboard(undefined);
    let selected = "";
    document.execCommand = vi.fn((command: string) => {
      selected = command === "copy" ? String(document.getSelection()) : "";
      return true;
    });
    await copyText("https://github.com/o/r/pull/42");
    expect(selected).toBe("https://github.com/o/r/pull/42");
    // Leaves nothing behind.
    expect(String(document.getSelection())).toBe("");
    expect(document.body.textContent).not.toContain("pull/42");
  });

  it("rejects when neither way can copy", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => false);
    await expect(copyText("x")).rejects.toThrow();
  });
});
