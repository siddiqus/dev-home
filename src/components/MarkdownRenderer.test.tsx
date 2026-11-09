import { fireEvent, render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Markdown from "./MarkdownRenderer";
import { ImageExpiredContext } from "./markdownImages";

describe("Markdown", () => {
  it("renders GFM tables, task lists and strikethrough", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~old~~";
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelectorAll("table td")).toHaveLength(2);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(container.querySelector("del")?.textContent).toBe("old");
  });

  it("renders GitHub-allowed HTML but strips scripts and handlers", () => {
    const md =
      '<details><summary>More</summary>hidden</details>\n\n<img src="x.png" onerror="alert(1)">\n\n<script>alert(1)</script>';
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelector("details summary")?.textContent).toBe("More");
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("opens links in a new tab", () => {
    const { container } = render(<Markdown>{"see https://github.com"}</Markdown>);
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://github.com");
    expect(a?.getAttribute("target")).toBe("_blank");
  });

  it("loads images lazily", () => {
    const { container } = render(<Markdown>{"![a](https://example.com/a.png)"}</Markdown>);
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("lazy");
  });

  it("reports a signed image that fails to load, as its URL may have expired", () => {
    const onExpired = vi.fn();
    const signed = "https://private-user-images.githubusercontent.com/1/2-x.png?jwt=t";
    const { container } = render(
      <ImageExpiredContext.Provider value={onExpired}>
        <Markdown>{`![a](${signed})\n\n![b](https://example.com/b.png)`}</Markdown>
      </ImageExpiredContext.Provider>,
    );
    const [signedImg, otherImg] = container.querySelectorAll("img");
    fireEvent.error(otherImg);
    expect(onExpired).not.toHaveBeenCalled();
    fireEvent.error(signedImg);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("ignores failed images with nobody listening", () => {
    const signed = "https://private-user-images.githubusercontent.com/1/2-x.png?jwt=t";
    const { container } = render(<Markdown>{`![a](${signed})`}</Markdown>);
    expect(() => fireEvent.error(container.querySelector("img")!)).not.toThrow();
  });
});
