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
});
