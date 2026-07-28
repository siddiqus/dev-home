import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PrNotesPanel } from "./PrNotesPanel";
import { NotesProvider, type NotesApi } from "../context/NotesContext";
import type { GitHubPR, Note } from "../types";

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: 1,
    number: 1,
    title: "Test PR",
    html_url: "https://github.com/o/r/pull/1",
    state: "open",
    draft: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    user: { login: "octocat", avatar_url: "" },
    head: { ref: "feature" },
    base: { ref: "main" },
    body: "",
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    in_merge_queue: false,
    merged_at: undefined,
    ...overrides,
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    type: "github_pr",
    title: "",
    content: "Test note content",
    reference_id: "o/r#1",
    resolved: 0,
    pinned: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function makeNotesApi(notes: Note[]): NotesApi {
  return {
    notes,
    unresolvedNotes: notes.filter((n) => n.resolved === 0),
    loading: false,
    error: null,
    addNote: vi.fn(),
    editNote: vi.fn(),
    resolveNote: vi.fn(),
    unresolveNote: vi.fn(),
    pinNote: vi.fn(),
    unpinNote: vi.fn(),
    removeNote: vi.fn(),
    refresh: vi.fn(),
  };
}

describe("PrNotesPanel", () => {
  it("only renders notes matching the PR", () => {
    const note1 = makeNote({ id: 1, content: "Note 1", reference_id: "o/r#1" });
    const note2 = makeNote({
      id: 2,
      content: "Note 2",
      reference_id: "https://github.com/o/r/pull/1",
    });
    const note3 = makeNote({ id: 3, content: "Note 3", reference_id: "o/r#2" });
    const api = makeNotesApi([note1, note2, note3]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    expect(screen.getByText("Note 1")).toBeInTheDocument();
    expect(screen.getByText("Note 2")).toBeInTheDocument();
    expect(screen.queryByText("Note 3")).not.toBeInTheDocument();
  });

  it("clicking add button, typing content, clicking Save calls addNote with correct params", () => {
    const api = makeNotesApi([]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    fireEvent.click(screen.getByTitle("Add note"));

    const contentTextarea = screen.getByPlaceholderText("Note content...");
    fireEvent.change(contentTextarea, { target: { value: "New note content" } });

    fireEvent.click(screen.getByText("Save"));

    expect(api.addNote).toHaveBeenCalledWith("github_pr", "New note content", "o/r#1", undefined);
  });

  it("clicking add button, typing title and content, clicking Save calls addNote with title", () => {
    const api = makeNotesApi([]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    fireEvent.click(screen.getByTitle("Add note"));

    const titleInput = screen.getByPlaceholderText("Title (optional)");
    fireEvent.change(titleInput, { target: { value: "My Title" } });

    const contentTextarea = screen.getByPlaceholderText("Note content...");
    fireEvent.change(contentTextarea, { target: { value: "New note content" } });

    fireEvent.click(screen.getByText("Save"));

    expect(api.addNote).toHaveBeenCalledWith("github_pr", "New note content", "o/r#1", "My Title");
  });

  it("clicking a note's resolve button calls resolveNote", () => {
    const note = makeNote({ id: 42, content: "Test note", resolved: 0 });
    const api = makeNotesApi([note]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    const resolveButtons = screen.getAllByTitle("Resolve");
    fireEvent.click(resolveButtons[0]);

    expect(api.resolveNote).toHaveBeenCalledWith(42);
  });

  it("clicking delete (with window.confirm stubbed) calls removeNote", () => {
    const note = makeNote({ id: 99, content: "To be deleted" });
    const api = makeNotesApi([note]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    fireEvent.click(screen.getByTitle("Delete"));

    expect(confirmSpy).toHaveBeenCalledWith("Are you sure you want to delete this note?");
    expect(api.removeNote).toHaveBeenCalledWith(99);

    confirmSpy.mockRestore();
  });

  it("shows unresolved count in header", () => {
    const note1 = makeNote({ id: 1, content: "Unresolved 1", resolved: 0 });
    const note2 = makeNote({ id: 2, content: "Unresolved 2", resolved: 0 });
    const note3 = makeNote({ id: 3, content: "Resolved", resolved: 1 });
    const api = makeNotesApi([note1, note2, note3]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    expect(screen.getByText("Notes (2)")).toBeInTheDocument();
  });

  it("shows empty state when no notes exist and composer is closed", () => {
    const api = makeNotesApi([]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    expect(screen.getByText("No notes for this PR yet.")).toBeInTheDocument();
  });

  it("opens the composer on the new-note shortcut (Cmd/Ctrl+Shift+N)", () => {
    const api = makeNotesApi([]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    expect(screen.queryByPlaceholderText("Note content...")).not.toBeInTheDocument();

    // A plain "n" must not open it.
    fireEvent.keyDown(document, { key: "n" });
    expect(screen.queryByPlaceholderText("Note content...")).not.toBeInTheDocument();

    // Meta+Shift+N opens the composer (linked to this PR by construction).
    fireEvent.keyDown(document, { key: "N", metaKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText("Note content...")).toBeInTheDocument();
  });

  it("hides empty state when composer is open", () => {
    const api = makeNotesApi([]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    fireEvent.click(screen.getByTitle("Add note"));

    expect(screen.queryByText("No notes for this PR yet.")).not.toBeInTheDocument();
  });

  it("clicking unresolve button calls unresolveNote", () => {
    const note = makeNote({ id: 50, content: "Resolved note", resolved: 1 });
    const api = makeNotesApi([note]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    const unresolveButtons = screen.getAllByTitle("Unresolve");
    fireEvent.click(unresolveButtons[0]);

    expect(api.unresolveNote).toHaveBeenCalledWith(50);
  });

  it("clicking pin button calls pinNote", () => {
    const note = makeNote({ id: 60, content: "Unpinned note", pinned: 0 });
    const api = makeNotesApi([note]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    const pinButtons = screen.getAllByTitle("Pin");
    fireEvent.click(pinButtons[0]);

    expect(api.pinNote).toHaveBeenCalledWith(60);
  });

  it("clicking unpin button calls unpinNote", () => {
    const note = makeNote({ id: 70, content: "Pinned note", pinned: 1 });
    const api = makeNotesApi([note]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    const unpinButtons = screen.getAllByTitle("Unpin");
    fireEvent.click(unpinButtons[0]);

    expect(api.unpinNote).toHaveBeenCalledWith(70);
  });

  it("clicking edit, changing content, clicking Save calls editNote", () => {
    const note = makeNote({ id: 80, content: "Original content", title: "Original title" });
    const api = makeNotesApi([note]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    fireEvent.click(screen.getByTitle("Edit"));

    const contentTextarea = screen.getByPlaceholderText("Note content...");
    fireEvent.change(contentTextarea, { target: { value: "Updated content" } });

    const titleInput = screen.getByPlaceholderText("Title (optional)");
    fireEvent.change(titleInput, { target: { value: "Updated title" } });

    fireEvent.click(screen.getByText("Save"));

    expect(api.editNote).toHaveBeenCalledWith(80, {
      content: "Updated content",
      title: "Updated title",
    });
  });

  it("Save button is disabled when content is empty or whitespace", () => {
    const api = makeNotesApi([]);
    const pr = makePR({ repo_full_name: "o/r", number: 1 });

    render(
      <NotesProvider value={api}>
        <PrNotesPanel pr={pr} />
      </NotesProvider>,
    );

    fireEvent.click(screen.getByTitle("Add note"));

    const saveButton = screen.getByText("Save");
    expect(saveButton).toBeDisabled();

    const contentTextarea = screen.getByPlaceholderText("Note content...");
    fireEvent.change(contentTextarea, { target: { value: "   " } });

    expect(saveButton).toBeDisabled();

    fireEvent.change(contentTextarea, { target: { value: "Valid content" } });

    expect(saveButton).not.toBeDisabled();
  });
});
