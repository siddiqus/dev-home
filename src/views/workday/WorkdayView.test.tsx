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

const drawer = vi.hoisted(() => ({ open: null as null | ((key: string) => void) }));
vi.mock("../../context/JiraDrawerContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../context/JiraDrawerContext")>()),
  useOptionalJiraDrawer: () => drawer.open,
}));

import { WorkdayView, sourceErrorText } from "./WorkdayView";

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

function renderView(extra: Partial<React.ComponentProps<typeof WorkdayView>> = {}) {
  const addNote = vi.fn(
    async (type, content, reference_id, title) =>
      ({ id: 7, type, content, reference_id, title }) as Note,
  );
  const editNote = vi.fn(async () => {});
  const view = (more: Partial<React.ComponentProps<typeof WorkdayView>>) => (
    <WorkdayView
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
    rerender: (more: Partial<React.ComponentProps<typeof WorkdayView>>) => rerender(view(more)),
  };
}

describe("sourceErrorText", () => {
  it("maps deck sources to a source down and mentions to Mentions unavailable", () => {
    expect(sourceErrorText(null)).toBeNull();
    expect(sourceErrorText("GitHub PRs: 500")).toBe(
      "GitHub unavailable, showing Jira tickets only",
    );
    expect(sourceErrorText("GitHub Reviews: 500")).toBe(
      "GitHub unavailable, showing Jira tickets only",
    );
    expect(sourceErrorText("JIRA Issues: 500")).toBe("Jira unavailable, showing PRs only");
    expect(sourceErrorText("GitHub PRs: a; JIRA Issues: b")).toBe("GitHub and Jira unavailable");
    expect(sourceErrorText("GitHub Mentions: a")).toBe("Mentions unavailable");
    expect(sourceErrorText("JIRA Mentions: a; GitHub Mentions: b")).toBe("Mentions unavailable");
    expect(sourceErrorText("JIRA Mentions: a; GitHub PRs: b")).toBe(
      "GitHub unavailable, showing Jira tickets only",
    );
    // A message that itself contains "; " doesn't confuse the split.
    expect(sourceErrorText("GitHub Mentions: bad; very bad")).toBe("Mentions unavailable");
    expect(sourceErrorText("oops")).toBe("Some data failed to load");
  });
});

describe("WorkdayView", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to Focus mode with the deck", () => {
    renderView();
    expect(screen.getByRole("button", { name: /Focus/ })).toHaveAttribute("aria-pressed", "true");
    // Today's date leads the header (no page title).
    expect(screen.getByText("Wed 14 Oct")).toBeTruthy();
    expect(screen.getByTestId("deck-mode")).toBeTruthy();
  });

  it("switches to Standup mode and renders the standup sheet", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Standup/ }));
    expect(screen.getByRole("region", { name: /Yesterday/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Blockers" })).toBeTruthy();
    expect(localStorage.getItem("workday-v2.mode")).toBe("standup");
  });

  it("switches modes with F / S keys", () => {
    renderView();
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByTestId("standup-sheet")).toBeTruthy();
    fireEvent.keyDown(window, { key: "F" });
    expect(screen.getByTestId("deck-mode")).toBeTruthy();
  });

  it("ignores mode keys while typing", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Standup/ }));
    const box = screen.getByRole("textbox", { name: /Your blockers/ });
    fireEvent.keyDown(box, { key: "f" });
    expect(screen.getByTestId("standup-sheet")).toBeTruthy(); // Still in Standup
  });

  it("shows not-configured state", () => {
    renderView({ configured: false });
    expect(screen.getByText("Connect Jira and GitHub")).toBeTruthy();
    expect(screen.queryByTestId("deck-mode")).toBeNull();
  });

  it("shows the header summary with counts", () => {
    renderView();
    // "1 tickets · 0 current · 0 updated" (Focus only, no deck state yet)
    expect(screen.getByText(/1 tickets/)).toBeTruthy();
  });

  it("remembers the mode across reloads", () => {
    localStorage.setItem("workday-v2.mode", "standup");
    renderView();
    expect(screen.getByTestId("standup-sheet")).toBeTruthy();
    cleanup();

    renderView();
    expect(screen.getByTestId("standup-sheet")).toBeTruthy();
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

describe("WorkdayView deck", () => {
  beforeEach(() => localStorage.clear());

  const renderDeck = (extra: Partial<React.ComponentProps<typeof WorkdayView>> = {}) =>
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
    // repo#number: the short repo (no org), muted, with the full ref as a tooltip.
    const ref = options[0].querySelector(".deck-pr-ref")!;
    expect(ref).toHaveTextContent(/^r#1207$/);
    expect(ref).toHaveAttribute("title", "r#1207");
    expect(within(options[0]).getByText("r")).toHaveClass("deck-pr-repo");
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

  it("card has copy and open icons for the ticket and each PR, without opening the PR", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDeck();
    const c = card();
    expect(within(c).getByRole("link", { name: "Open in Jira" })).toHaveAttribute(
      "href",
      expect.stringContaining("/browse/CCP-412"),
    );
    fireEvent.click(within(c).getByRole("button", { name: "Copy CCP-412" }));
    expect(writeText).toHaveBeenCalledWith("CCP-412");

    for (const n of [1203, 1207]) {
      expect(
        within(c).getByRole("link", { name: new RegExp(`Open .*#${n} on GitHub`) }),
      ).toHaveAttribute("href", `https://github.com/o/r/pull/${n}`);
    }
    fireEvent.click(within(c).getByRole("button", { name: /Copy link to .*#1207/ }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith("https://github.com/o/r/pull/1207");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("card shows each PR's branch in the meta line with a copy icon, without opening the PR", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDeck();
    const c = card();
    expect(within(c).getByTitle("branch-1203")).toHaveTextContent("branch-1203");
    fireEvent.click(within(c).getByRole("button", { name: "Copy branch branch-1207" }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith("branch-1207");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides the author on my own PRs and shows it on others'", () => {
    const { rerender } = renderDeck({ githubUsername: "Me" });
    expect(card().querySelector(".deck-pr-author")).toBeNull();
    rerender({ githubUsername: "someone-else" });
    expect(card().querySelector(".deck-pr-author")).toHaveTextContent("me");
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

  it("⌘K stays shut while the Jira drawer is open", () => {
    renderDeck();
    const drawer = document.createElement("div");
    drawer.className = "offcanvas show";
    document.body.appendChild(drawer);
    try {
      press("k", { metaKey: true });
      expect(screen.queryByRole("combobox")).toBeNull();
    } finally {
      drawer.remove();
    }
    press("k", { metaKey: true });
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("ignores arrow keys when a drawer is open", () => {
    renderDeck();
    const drawer = document.createElement("div");
    drawer.className = "offcanvas show";
    document.body.appendChild(drawer);

    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-412/); // Still on first card
    // Not even preventDefault: arrows and Space scroll the open drawer.
    expect(press("ArrowDown")).toBe(true);
    expect(press(" ")).toBe(true);

    document.body.removeChild(drawer);
  });
});

describe("WorkdayView personal state", () => {
  beforeEach(() => localStorage.clear());

  const renderDeck = (extra: Partial<React.ComponentProps<typeof WorkdayView>> = {}) =>
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
    expect(within(selectedPRRow()!).getByText("▶ current")).toBeTruthy();
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
    const closed = screen.getByRole("group", { name: "Closed" });
    // Folded by default.
    expect(within(closed).queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.click(within(closed).getByRole("button", { name: /Closed · 1/ }));
    expect(localStorage.getItem("dev-home-workday-v2-closed-folded")).toBe("false");
    fireEvent.click(within(closed).getByRole("button", { name: /412/ }));
    expect(groupRows("Open")).toEqual([
      expect.stringContaining("412"),
      expect.stringContaining("401"),
      expect.stringContaining("388"),
    ]);
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(screen.queryByRole("group", { name: "Closed" })).toBeNull();
  });

  it("Enter and Space on the Closed toggle and rows stay native, not deck keys", async () => {
    renderDeck();
    press("x"); // close 412; card shows 401
    const toggle = screen.getByRole("button", { name: /Closed · 1/ });
    toggle.focus();
    // Not swallowed: the browser turns these into clicks on the focused button.
    expect(fireEvent.keyDown(toggle, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(toggle, { key: " " })).toBe(true);
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(groupRows("Current")).toEqual([]);
    fireEvent.click(toggle);
    const row = within(screen.getByRole("group", { name: "Closed" })).getByRole("button", {
      name: /412/,
    });
    row.focus();
    expect(fireEvent.keyDown(row, { key: "Enter" })).toBe(true);
    fireEvent.click(row);
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(rail()).toHaveFocus();
  });

  it("x on the last rail ticket wraps to the first", () => {
    renderDeck();
    press("ArrowLeft"); // wraps to 388, the last
    press("x");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(groupRows("Open")).toEqual([
      expect.stringContaining("412"),
      expect.stringContaining("401"),
    ]);
  });

  it("x on the only ticket clears the selection and shows the empty deck", () => {
    renderView({ openPRs: [deckPRs[3]], allIssues: [deckIssues[2]] });
    press("x");
    expect(screen.queryByRole("region", { name: /^CCP-/ })).toBeNull();
    expect(screen.getByText("Nothing open. Nice.")).toBeTruthy();
    expect(stored().selected ?? null).toBeNull();
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

describe("WorkdayView card context", () => {
  beforeEach(() => localStorage.clear());

  const renderDeck = (extra: Partial<React.ComponentProps<typeof WorkdayView>> = {}) =>
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
    const input = screen.getByRole("textbox", { name: /^New note/ });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "  ask about retries  " } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(addNote).toHaveBeenCalledWith("github_pr", "ask about retries", "o/r#1203");
    expect(screen.queryByRole("textbox", { name: /^New note/ })).toBeNull();
    expect(screen.getByText("Note saved")).toHaveClass("app-toast", "is-visible");
  });

  it("puts the composer outside the PR listbox, and its ⏎ never opens the PR modal", async () => {
    renderDeck();
    press(".");
    const input = screen.getByRole("textbox", { name: "New note on r#1207" });
    expect(prList().contains(input)).toBe(false);
    expect(within(card()).getByText("r#1207", { selector: ".deck-note-target" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "hello" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the text and refocuses the input when saving fails", async () => {
    const addNote = vi.fn(async () => {
      throw new Error("offline");
    });
    renderDeck({ addNote });
    press(".");
    const input = screen.getByRole("textbox", { name: /^New note/ });
    fireEvent.change(input, { target: { value: "keep me" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(addNote).toHaveBeenCalled();
    expect(screen.getByText("Couldn't save the note")).toHaveClass("is-visible");
    const after = screen.getByRole("textbox", { name: /^New note/ });
    expect(after).toHaveValue("keep me");
    expect(after).not.toBeDisabled();
    expect(after).toHaveFocus();
  });

  it("saves a PR-less ticket's note as a jira_ticket note", async () => {
    const { addNote } = renderView({
      openPRs: [],
      assignedIssues: [issue("CCP-371", "Thumbnail backfill")],
    });
    press(".");
    const input = screen.getByRole("textbox", { name: /^New note/ });
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
    const input = screen.getByRole("textbox", { name: /^New note/ });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    fireEvent.change(input, { target: { value: "draft" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: /^New note/ })).toBeNull();
    expect(addNote).not.toHaveBeenCalled();
  });

  it("drops the composer when the selection moves away", () => {
    renderDeck();
    press(".");
    fireEvent.click(screen.getByRole("option", { name: /401/ }));
    expect(screen.queryByRole("textbox", { name: /^New note/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /412/ }));
    expect(screen.queryByRole("textbox", { name: /^New note/ })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: /Closed · 1/ }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Closed" })).getByRole("button", {
        name: /412/,
      }),
    );
    expect(localStorage.getItem("dev-home-workday-v2-only-current")).toBe("false");
    expect(within(rail()).getByRole("group", { name: "Open" })).toBeTruthy();
    expect(card()).toHaveAccessibleName(/^CCP-412/);
  });
});

describe("WorkdayView polish", () => {
  beforeEach(() => localStorage.clear());

  const renderDeck = (extra: Partial<React.ComponentProps<typeof WorkdayView>> = {}) =>
    renderView({ openPRs: deckPRs, allIssues: deckIssues, ...extra });
  const column = () => card().closest(".deck-column");
  const seedSeen = (unseen: number[] = []) => {
    const seen: Record<string, string> = {};
    for (const p of deckPRs) if (!unseen.includes(p.number)) seen[p.html_url] = p.updated_at;
    for (const k of ["CCP-412", "CCP-401", "CCP-388"]) seen[`ticket:${k}`] = NOW.toISOString();
    localStorage.setItem("dev-home-workday-v2", JSON.stringify({ v: 1, seeded: true, seen }));
  };
  const banner = () => document.querySelector<HTMLElement>(".deck-rail-banner");
  const todo = issue("CCP-500", "Not started yet", {
    status: { name: "To Do", statusCategory: { key: "new", colorName: "blue-gray" } },
  });

  it("shows the empty deck with closed and not-started counts and its links", () => {
    renderView({ openPRs: [], assignedIssues: [todo], allIssues: [todo] });
    expect(screen.getByText("Nothing open. Nice.")).toBeTruthy();
    expect(screen.getByText("0 closed tabs · 1 assigned ticket not started")).toBeTruthy();
    // Nothing closed: no "Show closed" link.
    expect(screen.queryByRole("button", { name: "Show closed" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Standup" }));
    expect(screen.getByTestId("standup-sheet")).toBeTruthy();
  });

  it("Show closed on the empty deck unfolds the Closed group", () => {
    const one = [deckPRs[3]];
    renderView({ openPRs: one, allIssues: [deckIssues[2]] });
    press("x");
    expect(screen.getByText("Nothing open. Nice.")).toBeTruthy();
    expect(screen.getByText(/^1 closed tab · 0 assigned tickets not started$/)).toBeTruthy();
    const closed = screen.getByRole("group", { name: "Closed" });
    expect(within(closed).queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Show closed" }));
    expect(within(closed).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows rail and card skeletons on a first load with no data, not on refresh", () => {
    const { rerender } = renderView({ openPRs: [], loading: true, sourcesLoaded: false });
    const rows = screen.getByTestId("deck-rail-skeleton").querySelectorAll(".deck-skeleton-row");
    expect(rows).toHaveLength(6);
    expect(screen.getByTestId("deck-card-skeleton")).toBeTruthy();
    expect(screen.queryByText("Nothing open. Nice.")).toBeNull();

    rerender({ openPRs: [], loading: false, sourcesLoaded: true });
    expect(screen.queryByTestId("deck-rail-skeleton")).toBeNull();
    expect(screen.getByText("Nothing open. Nice.")).toBeTruthy();

    rerender({ openPRs: [], loading: true, sourcesLoaded: true });
    expect(screen.queryByTestId("deck-rail-skeleton")).toBeNull();
    expect(screen.getByLabelText("Refreshing")).toBeTruthy();
  });

  it("shows a Jira source error banner at the top of the rail; retry refreshes", () => {
    const onRefresh = vi.fn();
    renderDeck({ sourceError: "JIRA Issues: 503 Service Unavailable", onRefresh });
    expect(banner()).toHaveAttribute("role", "status");
    expect(banner()).toHaveTextContent("Jira unavailable, showing PRs only · retry");
    expect(banner()!.closest(".deck-rail")).toBeTruthy();
    // The rail keeps rendering the other source.
    expect(screen.getAllByRole("option", { name: /412/ }).length).toBeGreaterThan(0);
    fireEvent.click(within(banner()!).getByRole("button", { name: "Retry" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("names GitHub, or both sources, in the banner", () => {
    const { rerender } = renderDeck({ sourceError: "GitHub PRs: timeout" });
    expect(banner()).toHaveTextContent("GitHub unavailable, showing Jira tickets only · retry");
    rerender({ sourceError: "GitHub Reviews: x; JIRA Issues: y" });
    expect(banner()).toHaveTextContent("GitHub and Jira unavailable · retry");
    rerender({ sourceError: null });
    expect(banner()).toBeNull();
  });

  it("only deck sources count as a source down; mentions failures say so", () => {
    const { rerender } = renderDeck({ sourceError: "GitHub Mentions: 502" });
    expect(banner()).toHaveTextContent("Mentions unavailable · retry");
    rerender({ sourceError: "JIRA Mentions: 500" });
    expect(banner()).toHaveTextContent("Mentions unavailable · retry");
    rerender({ sourceError: "GitHub Mentions: a; JIRA Mentions: b" });
    expect(banner()).toHaveTextContent("Mentions unavailable · retry");
    // A deck source plus a mentions source: the deck source wins.
    rerender({ sourceError: "GitHub Reviews: x; JIRA Mentions: y" });
    expect(banner()).toHaveTextContent("GitHub unavailable, showing Jira tickets only · retry");
    rerender({ sourceError: "JIRA Issues: x; GitHub Mentions: y" });
    expect(banner()).toHaveTextContent("Jira unavailable, showing PRs only · retry");
    rerender({ sourceError: "Something else broke" });
    expect(banner()).toHaveTextContent("Some data failed to load · retry");
  });

  it("? opens the shortcut sheet; deck keys wait until it closes", () => {
    renderDeck();
    press("?", { shiftKey: true });
    const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(sheet).getByText("Next ticket with unseen activity")).toBeTruthy();
    expect(within(sheet).getByText("Show only current (toggle)")).toBeTruthy();
    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    fireEvent.keyDown(sheet, { key: "Escape", code: "Escape", keyCode: 27 });
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    press("ArrowRight");
    expect(card()).toHaveAccessibleName(/^CCP-401/);
  });

  it("hides the key hint bar from ⌘K and remembers it", async () => {
    renderDeck();
    expect(screen.getByTestId("deck-hints")).toHaveTextContent("←→ previous/next");
    expect(screen.getByTestId("deck-nav-hint")).toHaveTextContent("← previousnext →");
    press("k", { metaKey: true });
    fireEvent.click(screen.getByRole("option", { name: /Hide key hints/ }));
    await act(async () => {});
    expect(screen.queryByTestId("deck-hints")).toBeNull();
    expect(screen.queryByTestId("deck-nav-hint")).toBeNull();
    expect(localStorage.getItem("dev-home-workday-v2-hide-hints")).toBe("true");
    cleanup();
    renderDeck();
    expect(screen.queryByTestId("deck-hints")).toBeNull();
  });

  it("swipes the card the way the selection moves, with ←/→ wraps following the key", () => {
    renderDeck();
    expect(column()).not.toHaveAttribute("data-swipe");
    press("ArrowRight"); // 412 → 401
    expect(column()).toHaveAttribute("data-swipe", "next");
    press("ArrowLeft"); // 401 → 412
    expect(column()).toHaveAttribute("data-swipe", "prev");
    press("ArrowLeft"); // wraps 412 → 388: still the key's direction
    expect(card()).toHaveAccessibleName(/^CCP-388/);
    expect(column()).toHaveAttribute("data-swipe", "prev");
    press("ArrowRight"); // wraps 388 → 412
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(column()).toHaveAttribute("data-swipe", "next");
    // Other moves go by rail order: a click from 412 up to 388 is "next", back is "prev".
    fireEvent.click(screen.getByRole("option", { name: /388/ }));
    expect(column()).toHaveAttribute("data-swipe", "next");
    fireEvent.click(screen.getByRole("option", { name: /401/ }));
    expect(column()).toHaveAttribute("data-swipe", "prev");
  });

  it("says Nothing to show, not Nice, on an empty deck while a source is down", () => {
    renderView({ openPRs: [], sourceError: "GitHub PRs: 500" });
    expect(screen.queryByText("Nothing open. Nice.")).toBeNull();
    expect(screen.getByText("Nothing to show")).toBeTruthy();
  });

  it("puts ? all keys first in the hint bar so clipping drops the others", () => {
    renderDeck();
    const hints = screen.getByTestId("deck-hints").children;
    expect(hints[0]).toHaveTextContent("? all keys");
  });

  it("n swipes forward even when it wraps", () => {
    seedSeen([1203]);
    renderDeck();
    press("ArrowRight"); // 412 → 401
    press("ArrowRight"); // 401 → 388
    press("n"); // wraps to 412, the only unseen one
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(column()).toHaveAttribute("data-swipe", "next");
  });

  it("a palette jump swipes by rail order", async () => {
    renderDeck();
    press("k", { metaKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "CCP-388" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    await act(async () => {});
    expect(card()).toHaveAccessibleName(/^CCP-388/);
    expect(column()).toHaveAttribute("data-swipe", "next");
    press("k", { metaKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "CCP-412" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    await act(async () => {});
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(column()).toHaveAttribute("data-swipe", "prev");
  });

  it("doesn't swipe when a refresh drops the selected ticket", () => {
    const { rerender } = renderDeck();
    fireEvent.click(screen.getByRole("option", { name: /401/ }));
    expect(column()).toHaveAttribute("data-swipe", "next");
    rerender({
      openPRs: deckPRs.filter((p) => p.number !== 1199),
      allIssues: deckIssues.filter((i) => i.key !== "CCP-401"),
    });
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(column()).not.toHaveAttribute("data-swipe");
  });

  it("doesn't swipe when g c narrows the rail away from the selection", () => {
    renderDeck();
    press(" "); // 412 current
    press("ArrowRight"); // 401 (open)
    expect(card()).toHaveAccessibleName(/^CCP-401/);
    press("g");
    press("c");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    expect(column()).not.toHaveAttribute("data-swipe");
  });

  it("x swipes forward to the next ticket and a mode switch doesn't replay the swipe", () => {
    renderDeck();
    press("x"); // closes 412, selects 401
    expect(card()).toHaveAccessibleName(/^CCP-401/);
    expect(column()).toHaveAttribute("data-swipe", "next");
    press("s");
    press("f");
    expect(column()).not.toHaveAttribute("data-swipe");
  });
});

describe("WorkdayView final review follow-ups", () => {
  beforeEach(() => {
    localStorage.clear();
    drawer.open = null;
  });

  const renderDeck = (extra: Partial<React.ComponentProps<typeof WorkdayView>> = {}) =>
    renderView({ openPRs: deckPRs, allIssues: deckIssues, ...extra });
  const stored = () => JSON.parse(localStorage.getItem("dev-home-workday-v2") ?? "{}");
  const seedSeen = (unseen: number[] = []) => {
    const seen: Record<string, string> = {};
    for (const p of deckPRs) if (!unseen.includes(p.number)) seen[p.html_url] = p.updated_at;
    for (const k of ["CCP-412", "CCP-401", "CCP-388"]) seen[`ticket:${k}`] = NOW.toISOString();
    localStorage.setItem("dev-home-workday-v2", JSON.stringify({ v: 1, seeded: true, seen }));
  };
  const rowNumbers = () =>
    within(prList())
      .getAllByRole("option")
      .map((o) => o.querySelector(".deck-pr-number")?.textContent);

  it("keeps the highlighted PR and the card order when the dwell marks PRs seen", () => {
    vi.useFakeTimers();
    try {
      // 1203 unseen sorts above the newer 1207; once seen, newest-first would flip them.
      seedSeen([1203]);
      renderDeck();
      expect(rowNumbers()).toEqual(["#1203", "#1207"]);
      expect(selectedPRRow()).toHaveTextContent("#1203");
      act(() => vi.advanceTimersByTime(1500));
      expect(stored().seen[deckPRs[0].html_url]).toBe(deckPRs[0].updated_at);
      expect(rowNumbers()).toEqual(["#1203", "#1207"]);
      expect(selectedPRRow()).toHaveTextContent("#1203");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an open composer and its text through the dwell", () => {
    vi.useFakeTimers();
    try {
      seedSeen([1203]);
      renderDeck();
      act(() => vi.advanceTimersByTime(500));
      press(".");
      const input = screen.getByRole("textbox", { name: "New note on r#1203" });
      fireEvent.change(input, { target: { value: "half a thought" } });
      act(() => vi.advanceTimersByTime(1500));
      expect(screen.getByRole("textbox", { name: "New note on r#1203" })).toHaveValue(
        "half a thought",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a new card visit with a fresh order", () => {
    seedSeen([1203]);
    renderDeck();
    press("ArrowRight");
    press("ArrowLeft");
    expect(selectedPRRow()).toHaveTextContent("#1203");
  });

  const jiraMention: JiraComment = {
    id: "901",
    issueKey: "OPS-7",
    issueSummary: "Elsewhere",
    author: { displayName: "Dana", avatarUrls: { "48x48": "" } },
    body: { text: "can you look?" },
    created: new Date(NOW.getTime() - 60_000).toISOString(),
    updated: new Date(NOW.getTime() - 60_000).toISOString(),
  } as unknown as JiraComment;

  const openMention = async () => {
    press("k", { metaKey: true });
    fireEvent.click(screen.getByRole("option", { name: /Dana on OPS-7/ }));
    await act(async () => {});
    await act(async () => new Promise((r) => setTimeout(r, 400)));
  };

  it("⌘K on an unmatched Jira mention opens the Jira drawer, never a blank tab", async () => {
    const open = vi.fn();
    drawer.open = open;
    const win = vi.spyOn(window, "open").mockImplementation(() => null);
    try {
      renderDeck({ jiraMentions: [jiraMention] });
      await openMention();
      expect(open).toHaveBeenCalledWith("OPS-7");
      expect(win).not.toHaveBeenCalled();
    } finally {
      win.mockRestore();
    }
  });

  it("⌘K on a Jira mention without a drawer links to the comment, or does nothing without a base URL", async () => {
    const win = vi.spyOn(window, "open").mockImplementation(() => null);
    try {
      renderDeck({ jiraMentions: [jiraMention] });
      await openMention();
      expect(win).toHaveBeenCalledWith(
        "https://example.atlassian.net/browse/OPS-7?focusedCommentId=901",
        "_blank",
        "noopener,noreferrer",
      );
      cleanup();
      win.mockClear();
      renderDeck({ jiraMentions: [jiraMention], jiraBaseUrl: "" });
      await openMention();
      expect(win).not.toHaveBeenCalled();
    } finally {
      win.mockRestore();
    }
  });

  it("renders a card's Jira mention quote as plain text when there is no Jira base URL", () => {
    const m = { ...jiraMention, issueKey: "CCP-412" } as JiraComment;
    const seen: Record<string, string> = {};
    for (const p of deckPRs) seen[p.html_url] = p.updated_at;
    seen["ticket:CCP-412"] = "2026-10-01T00:00:00Z";
    localStorage.setItem("dev-home-workday-v2", JSON.stringify({ v: 1, seeded: true, seen }));
    renderDeck({ jiraMentions: [m], jiraBaseUrl: "" });
    const quote = card().querySelector(".deck-quote")!;
    expect(quote).toHaveTextContent("can you look?");
    expect(quote.tagName).not.toBe("A");
    expect(quote.getAttribute("href")).toBeNull();
  });

  it("applies state updates with mentions still loading or failed, not with a deck source down", () => {
    const { rerender } = renderDeck({ mentionsLoading: true, sourceError: "GitHub Mentions: 502" });
    expect(stored().seeded).toBe(true);
    localStorage.clear();
    cleanup();
    const second = renderDeck({ sourceError: "JIRA Mentions: x; GitHub Reviews: y" });
    expect(stored().seeded).toBeFalsy();
    second.rerender({ sourceError: "Something else broke" });
    expect(stored().seeded).toBeFalsy();
    second.rerender({ sourceError: "JIRA Mentions: down" });
    expect(stored().seeded).toBe(true);
    void rerender;
  });

  it("standup sheet: grouped rows open their ticket or PR, and Copy copies the same groups", async () => {
    const opened: string[] = [];
    drawer.open = (key) => opened.push(key);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDeck();
    fireEvent.click(screen.getByRole("button", { name: /Standup/ }));
    const today = screen.getByRole("region", { name: "Today" });
    const lines = within(today).getAllByRole("listitem");
    expect(lines.length).toBeGreaterThan(0);
    const inReview = screen.getByTestId("standup-group-review");
    expect(inReview).toHaveTextContent("In review");
    const ticketLine = within(inReview).getAllByRole("button")[0];
    // KEY, title and each PR as repo#number.
    expect(ticketLine).toHaveTextContent(/CCP-412.*Move asset sync to a queue.*r#1207.*r#1203/);
    fireEvent.click(ticketLine);
    expect(opened).toEqual(["CCP-412"]);

    fireEvent.change(screen.getByRole("textbox", { name: /Your blockers/ }), {
      target: { value: "- waiting on design" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    await act(async () => {});
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("*Today*");
    expect(text).toContain(
      "*Today*\n_In review_\n• CCP-412 Move asset sync to a queue (r#1207, r#1203)",
    );
    expect(text).toMatch(/\*Blockers\*[\s\S]*• waiting on design/);
  });

  it("shows first-load skeletons until every source has loaded, whatever loading says", () => {
    const { rerender } = renderView({ openPRs: [], loading: false, sourcesLoaded: false });
    expect(screen.getByTestId("deck-rail-skeleton")).toBeTruthy();
    rerender({ openPRs: [], loading: false, sourcesLoaded: true });
    expect(screen.queryByTestId("deck-rail-skeleton")).toBeNull();
    expect(screen.getByText("Nothing open. Nice.")).toBeTruthy();
  });

  it("stamps a close no earlier than the ticket's newest PR update", () => {
    const future = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    const skewed = deckPRs.map((p) => (p.number === 1207 ? { ...p, updated_at: future } : p));
    renderView({ openPRs: skewed, allIssues: deckIssues });
    expect(card()).toHaveAccessibleName(/^CCP-412/);
    const realNow = Date.now;
    Date.now = () => NOW.getTime();
    try {
      press("x");
    } finally {
      Date.now = realNow;
    }
    expect(stored().closed["CCP-412"]).toBe(future.replace(/\.\d{3}Z$/, ".000Z"));
    // It stays closed rather than bouncing straight back.
    expect(
      within(screen.getByRole("group", { name: "Closed" })).getByText(/Closed · 1/),
    ).toBeTruthy();
  });

  it("F / S stand down while the Jira drawer or a modal is open", () => {
    renderDeck();
    const shown = document.createElement("div");
    shown.className = "offcanvas show";
    document.body.appendChild(shown);
    try {
      fireEvent.keyDown(window, { key: "s" });
      expect(screen.getByTestId("deck-mode")).toBeTruthy();
    } finally {
      shown.remove();
    }
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.queryByTestId("deck-mode")).toBeNull();
  });
});

describe("WorkdayView #todo notes", () => {
  beforeEach(() => localStorage.clear());

  const renderDeck = (extra: Partial<React.ComponentProps<typeof WorkdayView>> = {}) =>
    renderView({ openPRs: deckPRs, allIssues: deckIssues, ...extra });
  const rail = () => screen.getByRole("listbox", { name: "Tickets" });
  const todo = (o: Partial<Note>): Note => ({
    id: 1,
    type: "free_text",
    title: "Renew staging cert",
    content: "<p>#todo</p><p>expires Oct 30, ping ops</p>",
    reference_id: null,
    resolved: 0,
    pinned: 0,
    remind_at: null,
    created_at: "2026-10-13T10:00:00Z",
    updated_at: "2026-10-13T10:00:00Z",
    ...o,
  });
  const noteCard = () => screen.getByRole("region", { name: "Renew staging cert" });

  it("puts a free #todo note on the rail as a 📝 item with its own card", () => {
    const onOpenNote = vi.fn();
    const n = todo({});
    renderDeck({ notes: [n], onOpenNote });
    const row = within(rail()).getByRole("option", { name: /Renew staging cert/ });
    expect(within(row).getByText("📝")).toBeTruthy();
    expect(within(row).getByText("Note")).toBeTruthy();
    fireEvent.click(row);
    expect(within(noteCard()).getByText(/^Note · #todo · \d+[mhd]$/)).toBeTruthy();
    expect(within(noteCard()).getByText(/expires Oct 30, ping ops/)).toBeTruthy();
    fireEvent.click(within(noteCard()).getByRole("button", { name: /Edit/ }));
    expect(onOpenNote).toHaveBeenCalledWith(n);
    onOpenNote.mockClear();
    press("Enter");
    expect(onOpenNote).toHaveBeenCalledWith(n);
  });

  it("Space marks a note item current", () => {
    renderDeck({ notes: [todo({})] });
    fireEvent.click(within(rail()).getByRole("option", { name: /Renew staging cert/ }));
    press(" ");
    const current = within(rail()).getByRole("group", { name: "Current" });
    expect(within(current).getByRole("option", { name: /Renew staging cert/ })).toBeTruthy();
  });

  it("Resolve resolves the note and moves on to the next item", async () => {
    const resolveNote = vi.fn(async () => {});
    renderDeck({ notes: [todo({ id: 5 })], resolveNote });
    fireEvent.click(within(rail()).getByRole("option", { name: /Renew staging cert/ }));
    await act(async () => {
      fireEvent.click(within(noteCard()).getByRole("button", { name: "Resolve" }));
    });
    expect(resolveNote).toHaveBeenCalledWith(5);
    expect(screen.getByText("Note resolved")).toHaveClass("app-toast", "is-visible");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
  });

  it("shows no Resolve without a resolveNote handler", () => {
    renderDeck({ notes: [todo({})] });
    fireEvent.click(within(rail()).getByRole("option", { name: /Renew staging cert/ }));
    expect(within(noteCard()).queryByRole("button", { name: "Resolve" })).toBeNull();
  });

  it("folds a note on a deck PR into its ticket: a #todo chip and a #todo block", () => {
    const onOpenNote = vi.fn();
    const n = todo({
      type: "github_pr",
      title: "",
      content: "ask tomas about backoff #todo",
      reference_id: "o/r#1207",
    });
    renderDeck({ notes: [n], onOpenNote });
    expect(within(rail()).queryByRole("option", { name: /backoff/ })).toBeNull();
    const row = within(rail()).getByRole("option", { name: /412/ });
    expect(within(row).getByText("#todo")).toHaveAttribute("title", "1 #todo note");
    const todos = within(card()).getByRole("group", { name: "#todo notes" });
    const line = within(todos).getByRole("button", { name: /ask tomas about backoff/ });
    // Two PRs on the ticket: the line names the one it's on.
    expect(line).toHaveTextContent(/· r#1207 · \d+[mhd]$/);
    fireEvent.click(line);
    expect(onOpenNote).toHaveBeenCalledWith(n);
    // Not repeated as the PR's 📝 line.
    expect(within(prList()).queryByRole("button", { name: /ask tomas/ })).toBeNull();
  });

  it("lists #todo items in ⌘K for a #todo query", () => {
    renderDeck({
      notes: [
        todo({}),
        todo({ id: 2, type: "github_pr", title: "", content: "x #todo", reference_id: "o/r#1207" }),
      ],
    });
    press("k", { metaKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "#todo" } });
    const results = within(screen.getByRole("group", { name: "Results" })).getAllByRole("option");
    expect(results.map((r) => r.textContent)).toEqual([
      expect.stringContaining("CCP-412"),
      expect.stringContaining("📝 Renew staging cert"),
    ]);
    expect(within(results[0]).getByText("#todo")).toBeTruthy();
  });
});
