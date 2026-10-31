import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PeopleView } from "./PeopleView";
import dashboardFixture from "../__fixtures__/dashboardFixture";

function renderView(selectedId: string | null, onSelect = vi.fn()) {
  render(
    <PeopleView
      workload={dashboardFixture.workload}
      issues={dashboardFixture.issues}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

describe("PeopleView", () => {
  it("shows the legend for the bar colors", () => {
    renderView("u1");

    const legend = screen.getByLabelText("Bar colors");
    for (const label of ["To Do", "In Progress", "In Review", "Done"]) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
  });

  it("lists people in Work Spread order and marks the selected one", () => {
    renderView("u2");

    const people = within(screen.getByRole("listbox", { name: "People" })).getAllByRole("option");
    // Tashfia (high risk) before Nadman (on track).
    expect(people.map((p) => p.textContent)).toEqual([
      expect.stringContaining("Tashfia"),
      expect.stringContaining("Nadman"),
    ]);
    expect(people[1]).toHaveAttribute("aria-selected", "true");
    expect(people[0]).toHaveAttribute("aria-selected", "false");
  });

  it("flags people with flagged tickets and shows their stalled count", () => {
    renderView("u1");

    const tashfia = screen.getByRole("option", { name: /Tashfia/ });
    expect(within(tashfia).getByLabelText("Check in: 1 ticket at risk")).toBeInTheDocument();
    expect(within(tashfia).getByText("2 stalled")).toBeInTheDocument();
    const nadman = screen.getByRole("option", { name: /Nadman/ });
    expect(within(nadman).queryByLabelText(/^Check in:/)).not.toBeInTheDocument();
  });

  it("shows the selected person's details", () => {
    renderView("u2");

    expect(screen.getByRole("heading", { name: "Nadman" })).toBeInTheDocument();
    expect(screen.getByText("Token refresh")).toBeInTheDocument();
  });

  it("falls back to the person who needs help most", () => {
    renderView(null);

    expect(screen.getByRole("heading", { name: "Tashfia" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Tashfia/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("picks a person on click", () => {
    const onSelect = renderView("u1");

    fireEvent.click(screen.getByRole("option", { name: /Nadman/ }));

    expect(onSelect).toHaveBeenCalledWith("u2");
  });

  it("steps through people with the arrow keys", () => {
    const onSelect = renderView("u1");
    const list = screen.getByRole("listbox", { name: "People" });

    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith("u2");

    // Already at the top: ArrowUp stays put.
    onSelect.mockClear();
    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("says so when the team has nobody", () => {
    render(<PeopleView workload={[]} issues={[]} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("No team members")).toBeInTheDocument();
  });
});
