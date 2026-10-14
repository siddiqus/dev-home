import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubPR, JiraIssue, Note } from "../../types";

vi.mock("../../hooks/useWorkdayExtras", () => ({
  useWorkdayExtras: () => ({
    sprint: { data: [], error: null },
    offSprint: { data: [], error: null },
    doneTickets: { data: [], error: null },
    merged: { data: [], error: null },
    reviewed: { data: null, error: null },
  }),
}));

vi.mock("../../components/PrNotesPanel", () => ({ PrNotesPanel: () => null }));
vi.mock("../../hooks/usePRBody", () => ({
  usePRBody: () => ({ body: "PR body text", loading: false }),
}));

import { WorkdayV2View } from "./WorkdayV2View";

const NOW = new Date(2026, 9, 14, 10, 0);
const prs: GitHubPR[] = [
  {
    id: 1,
    number: 1203,
    title: "CCP-412 backend: queue worker",
    html_url: "https://github.com/o/r/pull/1203",
    state: "open",
    draft: false,
    created_at: "2026-10-13T10:00:00Z",
    updated_at: "2026-10-14T09:56:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: "CCP-412-backend" },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: ["tomas"],
  },
];

function renderView(extra: Partial<React.ComponentProps<typeof WorkdayV2View>> = {}) {
  const addNote = vi.fn(
    async (type, content, reference_id, title) =>
      ({ id: 7, type, content, reference_id, title }) as Note,
  );
  const editNote = vi.fn(async () => {});
  const view = (more: Partial<React.ComponentProps<typeof WorkdayV2View>>) => (
    <WorkdayV2View
      configured
      openPRs={prs}
      reviewRequests={[]}
      reviewingPRs={[]}
      assignedIssues={[] as JiraIssue[]}
      allIssues={[] as JiraIssue[]}
      loading={false}
      jiraBaseUrl="https://example.atlassian.net"
      weekendDays={[5, 6]}
      refreshKey={0}
      onRefresh={() => {}}
      notes={[]}
      notesLoaded
      addNote={addNote}
      editNote={editNote}
      now={NOW}
      {...extra}
      {...more}
    />
  );
  const { rerender } = render(view({}));
  return {
    addNote,
    editNote,
    rerender: (more: Partial<React.ComponentProps<typeof WorkdayV2View>>) => rerender(view(more)),
  };
}

describe("WorkdayV2View", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to Focus mode with placeholder", () => {
    renderView();
    expect(screen.getByText("Workday V2")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Focus/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("deck-mode")).toBeTruthy();
  });

  it("switches to Standup mode and renders v1's StandupMode", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Standup/ }));
    // Check for standup sections from v1
    expect(screen.getByText("In Progress")).toBeTruthy();
    expect(screen.getByText("Done since last workday")).toBeTruthy();
    expect(localStorage.getItem("workday-v2.mode")).toBe("standup");
  });

  it("switches modes with F / S keys", () => {
    renderView();
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByText("In Progress")).toBeTruthy();
    fireEvent.keyDown(window, { key: "F" });
    expect(screen.getByTestId("deck-mode")).toBeTruthy();
  });

  it("ignores mode keys while typing", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Standup/ }));
    const box = screen.getByPlaceholderText(/Anything to raise at standup/);
    fireEvent.keyDown(box, { key: "f" });
    expect(screen.getByText("In Progress")).toBeTruthy(); // Still in Standup
  });

  it("shows not-configured state", () => {
    renderView({ configured: false });
    expect(screen.getByText("Connect Jira and GitHub")).toBeTruthy();
    expect(screen.queryByText("Workday V2")).toBeNull();
  });

  it("shows the header summary with counts", () => {
    renderView();
    // "1 tickets · 0 current · 0 updated" (Focus only, no deck state yet)
    expect(screen.getByText(/1 tickets/)).toBeTruthy();
  });

  it("remembers the mode across reloads", () => {
    localStorage.setItem("workday-v2.mode", "standup");
    renderView();
    expect(screen.getByText("In Progress")).toBeTruthy();
    cleanup();

    renderView();
    expect(screen.getByText("In Progress")).toBeTruthy();
  });
});
