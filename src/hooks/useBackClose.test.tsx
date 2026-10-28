import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBackClose, useBackExitPrompt } from "./useBackClose";

let phone = true;
let standalone = false;
const desktop = window.matchMedia;

beforeEach(() => {
  phone = true;
  standalone = false;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("display-mode") ? standalone : phone,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

// Each test leaves history as it found it: unmounting gives the entries back.
afterEach(async () => {
  cleanup();
  await settle();
  window.matchMedia = desktop;
});

/** Lets jsdom finish a history traversal and fire its popstate. */
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 20)));

const back = async () => {
  await act(async () => history.back());
  await settle();
};

/** Our entries at and under the current one. */
const depth = () => (history.state as { devHomeBack?: number } | null)?.devHomeBack ?? 0;

function Overlay({ name, onClose }: { name: string; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  useBackClose(open, onClose ?? (() => setOpen(false)));
  return (
    <>
      <button onClick={() => setOpen(true)}>open {name}</button>
      {open && (
        <div role="dialog" aria-label={name}>
          <button onClick={() => setOpen(false)}>close {name}</button>
        </div>
      )}
    </>
  );
}

const open = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: `open ${name}` }));
  await settle();
};

describe("useBackClose", () => {
  it("closes the open overlay on Back instead of leaving the page", async () => {
    render(<Overlay name="PR" />);
    await open("PR");
    expect(depth()).toBe(1);
    await back();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(depth()).toBe(0);
  });

  it("closes stacked overlays from the top down", async () => {
    render(
      <>
        <Overlay name="PR" />
        <Overlay name="Jira" />
      </>,
    );
    await open("PR");
    await open("Jira");
    expect(depth()).toBe(2);
    await back();
    expect(screen.queryByRole("dialog", { name: "Jira" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "PR" })).toBeTruthy();
    await back();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gives the entry back when the overlay closes another way", async () => {
    render(<Overlay name="PR" />);
    await open("PR");
    fireEvent.click(screen.getByRole("button", { name: "close PR" }));
    await settle();
    expect(depth()).toBe(0);
  });

  it("keeps an overlay that stays open on Back, and asks again on the next one", async () => {
    const onClose = vi.fn();
    render(<Overlay name="Note" onClose={onClose} />);
    await open("Note");
    await back();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Note" })).toBeTruthy();
    // Its entry comes back with the next tap.
    fireEvent.click(document.body);
    await settle();
    expect(depth()).toBe(1);
    await back();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("waits for a tap before adding an entry", async () => {
    function Shown() {
      useBackClose(true, () => {});
      return null;
    }
    render(<Shown />);
    await settle();
    expect(depth()).toBe(0);
    fireEvent.click(document.body);
    await settle();
    expect(depth()).toBe(1);
  });

  it("leaves history alone off a phone", async () => {
    phone = false;
    render(<Overlay name="PR" />);
    await open("PR");
    expect(depth()).toBe(0);
  });
});

describe("useBackExitPrompt", () => {
  function App({ onPrompt }: { onPrompt: () => void }) {
    useBackExitPrompt(onPrompt);
    return <Overlay name="PR" />;
  }

  it("in the installed app, asks on a Back with nothing open; the next Back leaves", async () => {
    standalone = true;
    const onPrompt = vi.fn();
    render(<App onPrompt={onPrompt} />);
    fireEvent.click(document.body);
    await settle();
    expect(depth()).toBe(1);

    // An overlay closes first.
    await open("PR");
    await back();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onPrompt).not.toHaveBeenCalled();

    await back();
    expect(onPrompt).toHaveBeenCalledTimes(1);
    // Nothing is held back now: the next Back leaves the app...
    expect(depth()).toBe(0);
    // ...unless the user carries on, which asks again next time.
    fireEvent.click(document.body);
    await settle();
    expect(depth()).toBe(1);
  });

  it("doesn't ask in a browser tab", async () => {
    const onPrompt = vi.fn();
    render(<App onPrompt={onPrompt} />);
    fireEvent.click(document.body);
    await settle();
    expect(depth()).toBe(0);
  });
});
