import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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

  it("defaults to Focus mode with the deck", () => {
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

  it("shows spinner while loading after first data, but not on first load", () => {
    const { rerender } = renderView({ loading: true });
    // First load: no spinner even though loading=true
    expect(screen.queryByLabelText("Refreshing")).toBeNull();

    // First load completes
    rerender({ loading: false });
    expect(screen.queryByLabelText("Refreshing")).toBeNull();

    // Subsequent refresh: spinner shows
    rerender({ loading: true });
    expect(screen.getByLabelText("Refreshing")).toBeTruthy();

    // Refresh completes: spinner disappears
    rerender({ loading: false });
    expect(screen.queryByLabelText("Refreshing")).toBeNull();
  });
});

function deckPR(n: number, title: string, created: string, o: Partial<GitHubPR> = {}): GitHubPR {
  return {
    ...prs[0],
    id: n,
    number: n,
    title,
    html_url: `https://github.com/o/r/pull/${n}`,
    created_at: created,
    updated_at: "2026-10-14T08:00:00Z",
    head: { ref: `branch-${n}` },
    ...o,
  };
}

// Arrival order: CCP-412 (oldest PR), CCP-401, CCP-388.
const deckPRs: GitHubPR[] = [
  deckPR(1203, "CCP-412 backend: queue worker", "2026-10-01T10:00:00Z"),
  deckPR(1207, "CCP-412 frontend: sync progress UI", "2026-10-02T10:00:00Z", {
    updated_at: new Date(NOW.getTime() - 4 * 60_000).toISOString(),
  }),
  deckPR(1199, "CCP-401 Webhook retry policy", "2026-10-03T10:00:00Z"),
  deckPR(1150, "CCP-388 Bulk tag editor", "2026-10-04T10:00:00Z"),
];

const issue = (key: string, summary: string, o: Partial<JiraIssue> = {}): JiraIssue => ({
  key,
  summary,
  status: { name: "In Progress", statusCategory: { key: "indeterminate", colorName: "yellow" } },
  priority: { name: "Medium", iconUrl: "" },
  assignee: { displayName: "Me", avatarUrls: { "48x48": "" } },
  project: { key: "CCP", name: "Project" },
  created: "2026-10-05T10:00:00Z",
  updated: "2026-10-10T10:00:00Z",
  codeReviewers: [],
  ...o,
});

const deckIssues = [
  issue("CCP-412", "Move asset sync to a queue"),
  issue("CCP-401", "Webhook retry policy"),
  issue("CCP-388", "Bulk tag editor"),
];

const card = () => screen.getByRole("region", { name: /^CCP-/ });
const prList = () => screen.getByRole("listbox", { name: "Pull requests" });
const selectedPRRow = () =>
  within(prList())
    .getAllByRole("option")
    .find((o) => o.getAttribute("aria-selected") === "true");
const press = (key: string, init: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(document.body, { key, ...init });

describe("WorkdayV2View deck", () => {
  beforeEach(() => localStorage.clear());

  const renderDeck = (extra: Partial<React.ComponentProps<typeof WorkdayV2View>> = {}) =>
    renderView({ openPRs: deckPRs, allIssues: deckIssues, ...extra });

  it("renders the rail groups and the first ticket's card", () => {
    renderDeck();
    const rail = screen.getByRole("listbox", { name: "Tickets" });
    const open = within(rail).getByRole("group", { name: "Open" });
    const rows = within(open).getAllByRole("option");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("412"),
      expect.stringContaining("401"),
      expect.stringContaining("388"),
    ]);
    // Short keys: everything shares the CCP project.
    expect(within(rows[0]).getByText("412")).toBeTruthy();
    expect(within(rows[0]).getByText("Move asset sync to a queue")).toHaveAttribute(
      "title",
      "Move asset sync to a queue",
    );
    expect(rail).toHaveAttribute("aria-activedescendant", rows[0].id);
    expect(rows[0]).toHaveAttribute("aria-selected", "true");

    expect(card()).toHaveAccessibleName("CCP-412 Move asset sync to a queue");
    expect(within(card()).getByText("CCP-412")).toBeTruthy();
    expect(within(card()).getByText("In Progress")).toBeTruthy();
    expect(within(card()).getByText("2 PRs · 0 current · updated 4m")).toBeTruthy();
    const options = within(prList()).getAllByRole("option");
    expect(options).toHaveLength(2);
    // Newest first, key stripped from PR titles; top row selected on open.
    expect(within(options[0]).getByText("#1207")).toBeTruthy();
    expect(within(options[0]).getByText("frontend: sync progress UI")).toBeTruthy();
    expect(within(options[1]).getByText("backend: queue worker")).toBeTruthy();
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(prList()).toHaveAttribute("aria-activedescendant", options[0].id);
  });

  it("selects a ticket when its rail row is clicked", () => {
    renderDeck();
    fireEvent.click(screen.getByRole("option", { name: /401/ }));
    expect(card()).toHaveAccessibleName("CCP-401 Webhook retry policy");
  });

  it("moves through tickets with ←/→ and wraps around", () => {
    renderDeck();
    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-401/);
    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-388/);
    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    press("ArrowLeft");
    expect(card()).toHaveAccessibleName(/^CCP-388/);
  });

  it("remembers the selected ticket across reloads", () => {
    renderDeck();
    press("ArrowRight");
    cleanup();
    renderDeck();
    expect(card()).toHaveAccessibleName(/^CCP-401/);
  });

  it("moves the selected PR with ↑/↓ and resets it on a new card", () => {
    renderDeck();
    const [first, second] = within(prList()).getAllByRole("option");
    press("ArrowDown");
    expect(selectedPRRow()).toBe(second);
    press("ArrowDown"); // stays on the last row
    expect(selectedPRRow()).toBe(second);
    press("ArrowUp");
    expect(selectedPRRow()).toBe(first);
    press("ArrowDown");
    press("ArrowRight");
    press("ArrowLeft");
    expect(selectedPRRow()).toBe(within(prList()).getAllByRole("option")[0]);
  });

  it("opens the selected PR in the modal with ⏎ and ignores deck keys while it's open", async () => {
    renderDeck();
    press("ArrowDown");
    press("Enter");
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("backend: queue worker");
    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
  });

  it("opens the selected PR on GitHub with ⌘⏎", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderDeck();
    press("ArrowRight");
    press("Enter", { metaKey: true });
    expect(open).toHaveBeenCalledWith(
      "https://github.com/o/r/pull/1199",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("ignores deck keys while typing in an input", () => {
    renderDeck();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    input.remove();
  });

  it("ignores deck keys in Standup mode", () => {
    renderDeck();
    fireEvent.click(screen.getByRole("button", { name: /Standup/ }));
    press("ArrowRight");
    fireEvent.click(screen.getByRole("button", { name: /Focus/ }));
    expect(card()).toHaveAccessibleName(/^CCP-412/);
  });

  it("shows a No PR yet card for an in-progress ticket without PRs", () => {
    renderView({ openPRs: [], assignedIssues: [issue("CCP-371", "Thumbnail backfill")] });
    expect(card()).toHaveAccessibleName("CCP-371 Thumbnail backfill");
    expect(within(card()).getByText("No PR yet")).toBeTruthy();
    expect(within(card()).queryByRole("listbox")).toBeNull();
  });
});
