import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SearchableDropdown, itemMatches, type DropdownItem } from "./SearchableDropdown";
import { MultiSelectDropdown } from "./MultiSelectDropdown";

const people: DropdownItem[] = [
  { value: "abu", label: "abu", hint: "Abu Bakar" },
  { value: "rkhan", label: "rkhan" },
];

describe("itemMatches", () => {
  it("matches the label or the hint, ignoring case and surrounding spaces", () => {
    expect(itemMatches(people[0], "ABU")).toBe(true);
    expect(itemMatches(people[0], " bakar ")).toBe(true);
    expect(itemMatches(people[1], "bakar")).toBe(false);
    expect(itemMatches(people[1], "")).toBe(true);
  });
});

describe("SearchableDropdown", () => {
  it("shows the hint beside the label and finds an item by it", () => {
    render(
      <SearchableDropdown
        items={people}
        value=""
        onChange={vi.fn()}
        placeholder="Search login or name…"
        allLabel="Select GitHub member"
        hideAllOption
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("Abu Bakar")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search login or name…"), {
      target: { value: "bakar" },
    });
    expect(screen.getByText("abu")).toBeInTheDocument();
    expect(screen.queryByText("rkhan")).not.toBeInTheDocument();
  });
});

describe("MultiSelectDropdown", () => {
  it("shows the hint beside the label and finds an item by it", () => {
    render(
      <MultiSelectDropdown
        items={people}
        values={[]}
        onChange={vi.fn()}
        placeholder="Search login or name..."
        allLabel="Select author(s)"
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("Abu Bakar")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search login or name..."), {
      target: { value: "bakar" },
    });
    expect(screen.getByText("abu")).toBeInTheDocument();
    expect(screen.queryByText("rkhan")).not.toBeInTheDocument();
  });

  it("heads each section, keeps picks first within it, and shows a glyph and label override", () => {
    render(
      <MultiSelectDropdown
        items={[
          { value: "team:web", label: "Web", glyph: <i>team-icon</i>, count: 2, group: "Teams" },
          { value: "team:core", label: "Core", count: 3, group: "Teams" },
          { value: "abu", label: "abu", group: "People" },
          { value: "zed", label: "zed", group: "People" },
        ]}
        values={["zed", "team:core"]}
        onChange={vi.fn()}
        placeholder="Search people or teams..."
        allLabel="Select author(s)"
        selectionLabel="Core + 1"
      />,
    );
    expect(screen.getByText("Core + 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox"));
    // The trigger's tooltip also lists the picks; read only the open list.
    const rows = screen
      .getAllByText(/^(Teams|People|Web|Core|abu|zed)$/)
      .filter((el) => !el.closest(".multi-select-tooltip"))
      // The row's own text, without its icon or count.
      .map((el) =>
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent)
          .join(""),
      );
    expect(rows).toEqual(["Teams", "Core", "Web", "People", "zed", "abu"]);
    expect(screen.getByText("team-icon")).toBeInTheDocument();
  });
});
