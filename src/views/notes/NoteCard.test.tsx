import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NoteCard } from "./NoteCard";
import type { Note } from "../../types";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    type: "free_text",
    title: "My note",
    content: "Test note content",
    reference_id: null,
    resolved: 0,
    pinned: 0,
    remind_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

const baseProps = {
  jiraBaseUrl: "",
  onResolve: vi.fn(),
  onDelete: vi.fn(),
  onPin: vi.fn(),
  onUnpin: vi.fn(),
  onOpenNote: vi.fn(),
};

describe("NoteCard reminder chip", () => {
  it("renders an overdue chip for a past reminder on an unresolved note", () => {
    const note = makeNote({
      remind_at: "2026-01-01T00:00:00Z", // clearly in the past
      resolved: 0,
    });

    render(<NoteCard note={note} {...baseProps} />);

    // Overdue state is shown via the chip's alerting style, not an "Overdue" label.
    const chip = screen.getByTestId("reminder-chip");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass("text-danger");
  });

  it("does not render a reminder chip when remind_at is null", () => {
    const note = makeNote({ remind_at: null });

    render(<NoteCard note={note} {...baseProps} />);

    expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("reminder-chip")).not.toBeInTheDocument();
  });
});
