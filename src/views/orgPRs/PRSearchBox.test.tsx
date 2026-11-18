import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubPR } from "../../types";
import { fetchPR } from "../../services/github";
import { loadSettings, saveSettings } from "../../services/config";
import { PRSearchBox } from "./PRSearchBox";

vi.mock("../../services/github", () => ({ fetchPR: vi.fn() }));

const linked = { number: 812, html_url: "https://github.com/acme/api/pull/812" } as GitHubPR;
const onSearch = vi.fn();
const onSearchLink = vi.fn();
const onLinkError = vi.fn();

beforeEach(() => {
  saveSettings({ ...loadSettings(), githubOrg: "acme" });
  vi.mocked(fetchPR).mockReset().mockResolvedValue(linked);
  onSearch.mockReset();
  onSearchLink.mockReset();
  onLinkError.mockReset();
});

function renderBox(query = "") {
  render(
    <PRSearchBox
      query={query}
      onSearch={onSearch}
      onSearchLink={onSearchLink}
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
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSearch).toHaveBeenCalledWith("label:bug sso");
    expect(fetchPR).not.toHaveBeenCalled();
  });

  it("searches on a tap of ↵ Search too", () => {
    const box = renderBox();
    fireEvent.change(box, { target: { value: "token refresh" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSearch).toHaveBeenCalledWith("token refresh");
  });

  it("doesn't offer ↵ Search for the text already searched", () => {
    renderBox("token");
    expect(screen.getByRole("textbox")).toHaveValue("token");
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
  });

  it("searches a pasted PR link without Enter, leaving #number in the box", async () => {
    const box = renderBox();
    paste(box, "https://github.com/acme/api/pull/812/files");
    await settle();
    expect(fetchPR).toHaveBeenCalledWith("acme", "api", 812);
    expect(onSearchLink).toHaveBeenCalledWith(linked);
    expect(box).toHaveValue("#812");
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("searches a typed short link on Enter, but not while it's being typed", async () => {
    const box = renderBox();
    fireEvent.change(box, { target: { value: "acme/api#81" } });
    fireEvent.change(box, { target: { value: "acme/api#812" } });
    expect(fetchPR).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    await settle();
    expect(fetchPR).toHaveBeenCalledWith("acme", "api", 812);
    expect(onSearchLink).toHaveBeenCalledWith(linked);
  });

  it("reads repo/pull/123 as a repo in the configured org", async () => {
    const box = renderBox();
    fireEvent.change(box, { target: { value: "cmp-server/pull/1234" } });
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    fireEvent.keyDown(box, { key: "Enter" });
    await settle();
    expect(fetchPR).toHaveBeenCalledWith("acme", "cmp-server", 1234);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("says when a link won't load, keeping the text", async () => {
    vi.mocked(fetchPR).mockRejectedValue(new Error("Not Found"));
    const box = renderBox();
    paste(box, "github.com/acme/api/pull/99999");
    await settle();
    expect(onLinkError).toHaveBeenCalledWith("Couldn't load acme/api#99999");
    expect(onSearchLink).not.toHaveBeenCalled();
    expect(box).toHaveValue("github.com/acme/api/pull/99999");
  });

  it("doesn't search a link's PR that loads after the box has changed", async () => {
    let resolve!: (pr: GitHubPR) => void;
    vi.mocked(fetchPR).mockReturnValue(new Promise((r) => (resolve = r)));
    const box = renderBox();
    paste(box, "acme/api#812");
    fireEvent.change(box, { target: { value: "token" } });
    await act(async () => resolve(linked));
    expect(onSearchLink).not.toHaveBeenCalled();
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
