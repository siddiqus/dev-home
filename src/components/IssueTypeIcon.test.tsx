import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { IssueTypeIcon } from "./IssueTypeIcon";

const tile = (name: string) => screen.getByRole("img", { name });

describe("IssueTypeIcon", () => {
  it("draws a known type as a tile in Jira's colour for it, named on hover", () => {
    render(<IssueTypeIcon type={{ name: "Bug" }} />);

    expect(tile("Bug")).toHaveStyle({ backgroundColor: "#e5493a" });
    expect(tile("Bug")).toHaveAttribute("title", "Bug");
    // Drawn by us: Jira's image needs a Jira login the browser doesn't have.
    expect(document.querySelector("img")).toBeNull();
  });

  it("matches type names whatever their case, and both spellings of sub-task", () => {
    render(
      <>
        <IssueTypeIcon type={{ name: "story" }} />
        <IssueTypeIcon type={{ name: "Sub-task" }} />
        <IssueTypeIcon type={{ name: "Subtask" }} />
      </>,
    );

    expect(tile("story")).toHaveStyle({ backgroundColor: "#63ba3c" });
    expect(tile("Sub-task")).toHaveStyle({ backgroundColor: "#4bade8" });
    expect(tile("Subtask")).toHaveStyle({ backgroundColor: "#4bade8" });
  });

  it("draws any other type as a grey tile, still named", () => {
    render(<IssueTypeIcon type={{ name: "Spike" }} />);
    expect(tile("Spike")).toHaveStyle({ backgroundColor: "#8993a4" });
  });

  it("draws nothing when Jira gave no type", () => {
    const { container } = render(
      <>
        <IssueTypeIcon type={null} />
        <IssueTypeIcon type={undefined} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
