import { act, render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubComment, GitHubPR, JiraComment, JiraIssue, Note } from "../../types";

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

  it("does not open PR modal when Enter is pressed on the Refresh button", () => {
    renderDeck();
    const refreshButton = screen.getByRole("button", { name: /Refresh/ });
    refreshButton.focus();
    fireEvent.keyDown(refreshButton, { key: "Enter" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores arrow keys when a drawer is open", () => {
    renderDeck();
    const drawer = document.createElement("div");
    drawer.className = "offcanvas show";
    document.body.appendChild(drawer);

    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-412/); // Still on first card

    document.body.removeChild(drawer);
  });
});

describe("WorkdayV2View personal state", () => {
  beforeEach(() => localStorage.clear());

  const renderDeck = (extra: Partial<React.ComponentProps<typeof WorkdayV2View>> = {}) =>
    renderView({ openPRs: deckPRs, allIssues: deckIssues, ...extra });
  const rail = () => screen.getByRole("listbox", { name: "Tickets" });
  const groupRows = (name: string) => {
    const g = within(rail()).queryByRole("group", { name });
    return g
      ? within(g)
          .queryAllByRole("option")
          .map((r) => r.textContent ?? "")
      : [];
  };
  const stored = () => JSON.parse(localStorage.getItem("dev-home-workday-v2") ?? "{}");
  /** A seeded deck where everything is seen except the given PR numbers. */
  const seedSeen = (unseen: number[] = [], o: Record<string, unknown> = {}) => {
    const seen: Record<string, string> = {};
    for (const p of deckPRs) if (!unseen.includes(p.number)) seen[p.html_url] = p.updated_at;
    for (const k of ["CCP-412", "CCP-401", "CCP-388"]) seen[`ticket:${k}`] = NOW.toISOString();
    localStorage.setItem("dev-home-workday-v2", JSON.stringify({ v: 1, seeded: true, seen, ...o }));
  };

  it("Space moves a ticket into Current and back to its arrival slot", () => {
    renderDeck();
    press(" ");
    expect(groupRows("Current")).toEqual([expect.stringContaining("412")]);
    expect(groupRows("Open")).toEqual([
      expect.stringContaining("401"),
      expect.stringContaining("388"),
    ]);
    // Space marked the selected PR (the top row), which is now the current one.
    expect(selectedPRRow()).toHaveClass("deck-pr--current");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(screen.getByText(/tickets · 1 current/)).toBeTruthy();

    press(" ");
    expect(groupRows("Current")).toEqual([]);
    expect(groupRows("Open")).toEqual([
      expect.stringContaining("412"),
      expect.stringContaining("401"),
      expect.stringContaining("388"),
    ]);
  });

  it("Space marks a PR-less ticket current by its key", () => {
    renderView({ openPRs: [], assignedIssues: [issue("CCP-371", "Thumbnail backfill")] });
    press(" ");
    expect(groupRows("Current")).toEqual([expect.stringContaining("Thumbnail backfill")]);
    expect(stored().current).toEqual(["ticket:CCP-371"]);
  });

  it("x closes the tab and selects the next; clicking it in Closed reopens it in place", () => {
    renderDeck();
    press("x");
    expect(groupRows("Open")).toEqual([
      expect.stringContaining("401"),
      expect.stringContaining("388"),
    ]);
    expect(card()).toHaveAccessibleName(/^CCP-401/);
    const closed = within(rail()).getByRole("group", { name: "Closed" });
    // Folded by default.
    expect(within(closed).queryAllByRole("option")).toHaveLength(0);
    fireEvent.click(within(closed).getByRole("button", { name: /Closed · 1/ }));
    expect(localStorage.getItem("dev-home-workday-v2-closed-folded")).toBe("false");
    fireEvent.click(within(closed).getByRole("option", { name: /412/ }));
    expect(groupRows("Open")).toEqual([
      expect.stringContaining("412"),
      expect.stringContaining("401"),
      expect.stringContaining("388"),
    ]);
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(within(rail()).queryByRole("group", { name: "Closed" })).toBeNull();
  });

  it("←/→ skip Closed tabs", () => {
    renderDeck();
    press("ArrowRight");
    press("x"); // close CCP-401, selection moves to CCP-388
    expect(card()).toHaveAccessibleName(/^CCP-388/);
    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-388/);
  });

  it("n with nothing new shows the Nothing new toast", () => {
    renderDeck();
    press("n");
    expect(screen.getByText("Nothing new")).toHaveClass("app-toast", "is-visible");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
  });

  it("n jumps to the next ticket with unseen activity", () => {
    seedSeen([1150]);
    renderDeck();
    expect(
      within(screen.getByRole("option", { name: /388/ })).getByLabelText("new activity"),
    ).toBeTruthy();
    press("n");
    expect(card()).toHaveAccessibleName(/^CCP-388/);
    expect(within(prList()).getByLabelText("new activity")).toBeTruthy();
  });

  it("marks every PR on the card seen after the dwell", () => {
    vi.useFakeTimers();
    try {
      seedSeen([1203, 1207]);
      renderDeck();
      expect(within(prList()).getAllByLabelText("new activity")).toHaveLength(2);
      act(() => vi.advanceTimersByTime(1500));
      expect(within(prList()).queryAllByLabelText("new activity")).toHaveLength(0);
      expect(stored().seen[deckPRs[0].html_url]).toBe(deckPRs[0].updated_at);
      expect(stored().seen["ticket:CCP-412"]).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("⏎ marks the opened PR seen immediately", async () => {
    seedSeen([1207]);
    renderDeck();
    press("Enter");
    await screen.findByRole("dialog");
    expect(stored().seen[deckPRs[1].html_url]).toBe(deckPRs[1].updated_at);
  });

  it("u marks the selected PR unread", () => {
    seedSeen();
    renderDeck();
    expect(within(prList()).queryAllByLabelText("new activity")).toHaveLength(0);
    press("u");
    expect(within(selectedPRRow()!).getByLabelText("new activity")).toBeTruthy();
    expect(stored().seen[deckPRs[1].html_url]).toBeUndefined();
  });

  it("g c shows only current tickets and is remembered", () => {
    renderDeck();
    press("ArrowRight");
    press(" "); // CCP-401 into Current
    press("g");
    press("c");
    expect(within(rail()).queryByRole("group", { name: "Open" })).toBeNull();
    expect(groupRows("Current")).toEqual([expect.stringContaining("401")]);
    expect(localStorage.getItem("dev-home-workday-v2-only-current")).toBe("true");
    press("g");
    press("c");
    expect(groupRows("Open")).toHaveLength(2);
  });

  it("falls back to the first ticket when the remembered one is gone", () => {
    localStorage.setItem("dev-home-workday-v2", JSON.stringify({ v: 1, selected: "CCP-999" }));
    renderDeck();
    expect(card()).toHaveAccessibleName(/^CCP-412/);
  });

  it("selection survives a remount", () => {
    renderDeck();
    press("ArrowLeft");
    expect(card()).toHaveAccessibleName(/^CCP-388/);
    cleanup();
    renderDeck();
    expect(card()).toHaveAccessibleName(/^CCP-388/);
  });

  it("applies state updates only once loading is done and no source failed", () => {
    const { rerender } = renderDeck({ loading: true });
    expect(stored().seeded).toBeFalsy();
    rerender({ loading: false, sourceError: "GitHub PRs: boom" });
    expect(stored().seeded).toBeFalsy();
    rerender({ loading: false, sourceError: null });
    expect(stored().seeded).toBe(true);
    expect(Object.keys(stored().arrival)).toHaveLength(3);
  });

  it("does not drop current pins while loading", () => {
    renderDeck();
    press(" ");
    const pins = stored().current;
    cleanup();
    renderView({ openPRs: [], allIssues: deckIssues, loading: true });
    expect(stored().current).toEqual(pins);
  });
});

describe("WorkdayV2View card context", () => {
  beforeEach(() => localStorage.clear());

  const renderDeck = (extra: Partial<React.ComponentProps<typeof WorkdayV2View>> = {}) =>
    renderView({ openPRs: deckPRs, allIssues: deckIssues, ...extra });
  const rail = () => screen.getByRole("listbox", { name: "Tickets" });
  const stored = () => JSON.parse(localStorage.getItem("dev-home-workday-v2") ?? "{}");
  /** Seeded: every PR seen at its updated_at, except `unseen`, seen at `before`. */
  const seed = (unseen: number[] = [], before = "2026-10-01T00:00:00Z") => {
    const seen: Record<string, string> = {};
    for (const p of deckPRs) seen[p.html_url] = unseen.includes(p.number) ? before : p.updated_at;
    for (const k of ["CCP-412", "CCP-401", "CCP-388"]) seen[`ticket:${k}`] = before;
    localStorage.setItem("dev-home-workday-v2", JSON.stringify({ v: 1, seeded: true, seen }));
  };
  const note = (o: Partial<Note>): Note => ({
    id: 1,
    type: "github_pr",
    title: "",
    content: "ask Claude why retry is sync",
    reference_id: "o/r#1207",
    resolved: 0,
    pinned: 0,
    remind_at: null,
    created_at: "2026-10-13T10:00:00Z",
    updated_at: "2026-10-13T10:00:00Z",
    ...o,
  });

  it("quotes the newest unseen comment under the PR row, linking to it", () => {
    seed([1207]);
    const comment: GitHubComment = {
      id: 55,
      html_url: "https://github.com/o/r/pull/1207#issuecomment-55",
      body: "should the retry here be async?\nsecond line",
      created_at: new Date(NOW.getTime() - 4 * 60_000).toISOString(),
      updated_at: new Date(NOW.getTime() - 4 * 60_000).toISOString(),
      user: { login: "tomas", avatar_url: "" },
      pr_number: 1207,
      repo_full_name: "o/r",
      context_title: "CCP-412 frontend",
      reason: "comment",
    };
    renderDeck({ githubMentions: [comment] });
    const row = within(prList()).getAllByRole("option")[0];
    const link = within(row).getByRole("link", { name: /tomas/ });
    expect(link).toHaveAttribute("href", comment.html_url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.textContent).toContain("4m");
    expect(link.textContent).toContain("should the retry here be async?");
    expect(link.textContent).not.toContain("second line");
    // Clicking the quote doesn't open the PR modal.
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("quotes an unseen Jira mention under the card header", () => {
    seed();
    const mention: JiraComment = {
      id: "9001",
      author: { displayName: "Abu", avatarUrls: { "48x48": "" } },
      body: { text: "can you look at the retry?" },
      // After the newest PR's seen time (09:56Z), so it counts as unseen.
      created: "2026-10-14T09:58:00Z",
      updated: "2026-10-14T09:58:00Z",
      issueKey: "CCP-412",
      issueSummary: "Move asset sync to a queue",
    } as JiraComment;
    renderDeck({ jiraMentions: [mention] });
    const link = within(card()).getByRole("link", { name: /Abu/ });
    expect(link.textContent).toContain("can you look at the retry?");
    expect(link).toHaveAttribute(
      "href",
      "https://example.atlassian.net/browse/CCP-412?focusedCommentId=9001",
    );
  });

  it("shows my newest unresolved note on the PR and opens it on click", () => {
    const onOpenNote = vi.fn();
    const n = note({});
    renderDeck({ notes: [n, note({ id: 2, content: "old", resolved: 1 })], onOpenNote });
    const row = within(prList()).getAllByRole("option")[0];
    fireEvent.click(within(row).getByRole("button", { name: /ask Claude why retry is sync/ }));
    expect(onOpenNote).toHaveBeenCalledWith(n);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(row).queryByText("old")).toBeNull();
  });

  it(". opens the composer under the selected PR; ⏎ saves it as a github_pr note", async () => {
    const { addNote } = renderDeck();
    press("ArrowDown");
    press(".");
    const input = screen.getByRole("textbox", { name: "New note" });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "  ask about retries  " } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(addNote).toHaveBeenCalledWith("github_pr", "ask about retries", "o/r#1203");
    expect(screen.queryByRole("textbox", { name: "New note" })).toBeNull();
    expect(screen.getByText("Note saved")).toHaveClass("app-toast", "is-visible");
  });

  it("saves a PR-less ticket's note as a jira_ticket note", async () => {
    const { addNote } = renderView({
      openPRs: [],
      assignedIssues: [issue("CCP-371", "Thumbnail backfill")],
    });
    press(".");
    const input = screen.getByRole("textbox", { name: "New note" });
    fireEvent.change(input, { target: { value: "backfill plan" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(addNote).toHaveBeenCalledWith("jira_ticket", "backfill plan", "CCP-371");
    expect(screen.getByText("Note saved")).toHaveClass("is-visible");
  });

  it("shows a PR-less ticket's newest jira_ticket note", () => {
    renderView({
      openPRs: [],
      assignedIssues: [issue("CCP-371", "Thumbnail backfill")],
      notes: [note({ type: "jira_ticket", reference_id: "CCP-371", content: "plan it" })],
    });
    expect(within(card()).getByRole("button", { name: /plan it/ })).toBeTruthy();
  });

  it("Esc cancels the composer without saving, and deck keys are ignored while typing", () => {
    const { addNote } = renderDeck();
    press(".");
    const input = screen.getByRole("textbox", { name: "New note" });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    fireEvent.change(input, { target: { value: "draft" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "New note" })).toBeNull();
    expect(addNote).not.toHaveBeenCalled();
  });

  it("shows the Off-sprint pill for tickets v1 flags off-sprint", () => {
    // The mocked extras have an empty sprint, so assigned tickets are off-sprint (as in v1).
    renderView({ openPRs: [], assignedIssues: [issue("CCP-371", "Thumbnail backfill")] });
    expect(within(card()).getByText("Off-sprint")).toBeTruthy();
  });

  it("does not let the dwell undo u after the PR modal opens and closes on another PR", async () => {
    vi.useFakeTimers();
    try {
      seed();
      renderDeck();
      act(() => vi.advanceTimersByTime(1500)); // dwell fires for this visit
      press("u"); // the top row (#1207) unread
      const unreadRow = within(prList()).getAllByRole("option")[0];
      expect(within(unreadRow).getByLabelText("new activity")).toBeTruthy();
      press("ArrowDown");
      press("Enter"); // open #1203 in the modal
      expect(screen.getByRole("dialog")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /close/i }));
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByRole("dialog")).toBeNull();
      act(() => vi.advanceTimersByTime(5000));
      const row = within(prList()).getAllByRole("option")[0];
      expect(within(row).getByLabelText("new activity")).toBeTruthy();
      expect(stored().seen[deckPRs[1].html_url]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns off only-current when a Closed tab is reopened", () => {
    renderDeck();
    press("x"); // close CCP-412
    press("g");
    press("c"); // only current: nothing is current
    fireEvent.click(within(rail()).getByRole("button", { name: /Closed · 1/ }));
    fireEvent.click(
      within(within(rail()).getByRole("group", { name: "Closed" })).getByRole("option", {
        name: /412/,
      }),
    );
    expect(localStorage.getItem("dev-home-workday-v2-only-current")).toBe("false");
    expect(within(rail()).getByRole("group", { name: "Open" })).toBeTruthy();
    expect(card()).toHaveAccessibleName(/^CCP-412/);
  });
});
