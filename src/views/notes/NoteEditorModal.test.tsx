import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Note } from "../../types";
import { NoteEditorModal } from "./NoteEditorModal";

const note: Note = {
  id: 7,
  type: "free_text",
  title: "Old title",
  content: "Some text",
  reference_id: null,
  resolved: 0,
  pinned: 0,
  remind_at: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

describe("NoteEditorModal", () => {
  it("saves changes on ⌘↵, and not before there are any", async () => {
    const onEdit = vi.fn(async () => {});
    render(
      <NoteEditorModal
        show
        note={note}
        onHide={() => {}}
        onSave={vi.fn()}
        onEdit={onEdit}
        jiraBaseUrl=""
      />,
    );
    const title = await screen.findByDisplayValue("Old title");
    fireEvent.keyDown(title, { key: "Enter", metaKey: true });
    expect(onEdit).not.toHaveBeenCalled();

    fireEvent.change(title, { target: { value: "New title" } });
    fireEvent.keyDown(title, { key: "Enter", ctrlKey: true });

    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(7, expect.objectContaining({ title: "New title" })),
    );
  });
});
