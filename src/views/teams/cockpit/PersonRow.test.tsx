import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PersonRow } from "./PersonRow";
import dashboardFixture from "../__fixtures__/dashboardFixture";

const [tashfia, nadman] = dashboardFixture.workload;

describe("PersonRow", () => {
  it("shows the name, WIP, done and open/merged PRs", () => {
    render(<PersonRow member={tashfia!} max={7} onClick={vi.fn()} />);

    const row = screen.getByRole("button", { name: /Tashfia/ });
    expect(row).toHaveTextContent("WIP 4 · Done 2 · PRs 3/1");
    expect(screen.getByTitle("3 open, 1 merged")).toBeInTheDocument();
  });

  it("shows the stalled chip and the check-in flag only when there's something to say", () => {
    const { rerender } = render(<PersonRow member={tashfia!} max={7} onClick={vi.fn()} />);

    expect(screen.getByText("2 stalled")).toBeInTheDocument();
    expect(screen.getByLabelText("Check in: 1 ticket at risk")).toBeInTheDocument();

    rerender(<PersonRow member={nadman!} max={7} onClick={vi.fn()} />);

    expect(screen.queryByText(/stalled/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Check in:/)).not.toBeInTheDocument();
  });

  it("calls onClick when the row is clicked", () => {
    const onClick = vi.fn();
    render(<PersonRow member={tashfia!} max={7} onClick={onClick} />);

    fireEvent.click(screen.getByText("Tashfia"));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("becomes a listbox option when given a selected state", () => {
    const { rerender } = render(<PersonRow member={tashfia!} max={7} onClick={vi.fn()} selected />);

    const option = screen.getByRole("option", { name: /Tashfia/ });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(option).toHaveAttribute("tabindex", "0");

    rerender(<PersonRow member={tashfia!} max={7} onClick={vi.fn()} selected={false} />);

    expect(option).toHaveAttribute("aria-selected", "false");
    expect(option).toHaveAttribute("tabindex", "-1");
  });
});
