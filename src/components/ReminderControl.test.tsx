import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReminderControl } from "./ReminderControl";

describe("ReminderControl", () => {
  it("emits an ISO time when a preset is chosen", () => {
    const onChange = vi.fn();
    render(<ReminderControl value={null} onChange={onChange} />);

    fireEvent.click(screen.getByText("In 1h"));

    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  it("emits an ISO time when a specific date/time is picked via the calendar input", () => {
    const onChange = vi.fn();
    render(<ReminderControl value={null} onChange={onChange} />);

    const picker = screen.getByLabelText("Pick a reminder date and time");
    fireEvent.change(picker, { target: { value: "2026-07-30T14:30" } });

    // Converted from the local wall-clock value to an ISO-8601 UTC string.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("shows the chosen time as a chip and clears it", () => {
    const onChange = vi.fn();
    render(<ReminderControl value="2099-01-01T09:00:00.000Z" onChange={onChange} />);

    // Presets are hidden once a value is set.
    expect(screen.queryByText("In 1h")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Clear reminder"));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
