import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubPR } from "../../types";
import { fetchPR } from "../../services/github";
import { PRSearchBox } from "./PRSearchBox";

vi.mock("../../services/github", () => ({ fetchPR: vi.fn() }));

const linked = { number: 812, html_url: "https://github.com/acme/api/pull/812" } as GitHubPR;
const onSearch = vi.fn();
const onOpenPR = vi.fn();
const onLinkError = vi.fn();

beforeEach(() => {
  vi.mocked(fetchPR).mockReset().mockResolvedValue(linked);
  onSearch.mockReset();
  onOpenPR.mockReset();
  onLinkError.mockReset();
});

function renderBox(query = "") {
  render(
    <PRSearchBox
      query={query}
      onSearch={onSearch}
      onOpenPR={onOpenPR}
      onLinkError={onLinkError}
      slashHint
    />,
  );
  return screen.getByRole("textbox", { name: "Search PRs or paste a link…" });
}

const settle = () => act(async () => {});
const paste = (box: HTMLElement, text: string) => {
  fireEvent.paste(box);
  fireEvent.change(box, { target: { value: text } });
};

describe("PRSearchBox", () => {
  it("searches typed text on Enter, saying it isn't searched until then", () => {
    const box = renderBox();
    expect(screen.getByText("/")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "label:bug sso" } });
    expect(screen.getByText("↵ Search")).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSearch).toHaveBeenCalledWith("label:bug sso");
    expect(fetchPR).not.toHaveBeenCalled();
  });

  it("doesn't say ↵ Search for the text already searched", () => {
    renderBox("token");
    expect(screen.getByRole("textbox")).toHaveValue("token");
    expect(screen.queryByText("↵ Search")).toBeNull();
  });

  it("opens a pasted PR link without Enter, then clears", async () => {
    const box = renderBox();
    paste(box, "https://github.com/acme/api/pull/812/files");
    await settle();
    expect(fetchPR).toHaveBeenCalledWith("acme", "api", 812);
    expect(onOpenPR).toHaveBeenCalledWith(linked);
    expect(box).toHaveValue("");
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("opens a typed short link on Enter, but not while it's being typed", async () => {
    const box = renderBox();
    fireEvent.change(box, { target: { value: "acme/api#81" } });
    fireEvent.change(box, { target: { value: "acme/api#812" } });
    expect(fetchPR).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    await settle();
    expect(fetchPR).toHaveBeenCalledWith("acme", "api", 812);
    expect(onOpenPR).toHaveBeenCalledWith(linked);
  });

  it("says when a link won't load, keeping the text", async () => {
    vi.mocked(fetchPR).mockRejectedValue(new Error("Not Found"));
    const box = renderBox();
    paste(box, "github.com/acme/api/pull/99999");
    await settle();
    expect(onLinkError).toHaveBeenCalledWith("Couldn't load acme/api#99999");
    expect(onOpenPR).not.toHaveBeenCalled();
    expect(box).toHaveValue("github.com/acme/api/pull/99999");
  });

  it("drops the searched text when cleared with ✕", () => {
    const box = renderBox("token");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onSearch).toHaveBeenCalledWith("");
    expect(box).toHaveValue("");
  });

  it("drops the searched text once the box is emptied by hand, and not before", () => {
    const box = renderBox("token");
    fireEvent.change(box, { target: { value: "tok" } });
    expect(onSearch).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "" } });
    expect(onSearch).toHaveBeenCalledWith("");
  });
});
