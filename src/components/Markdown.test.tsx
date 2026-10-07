import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Markdown } from "./Markdown";

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
});
