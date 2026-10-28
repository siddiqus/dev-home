import { render, screen, fireEvent, act, within, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubPR, JiraIssue, Note } from "../../types";

vi.mock("../../hooks/useWorkdayExtras", () => ({
  useWorkdayExtras: () => ({
    sprint: { data: [], error: null },
    offSprint: {
      data: [
        {
          key: "CHD-88",
          summary: "Preview links",
          status: { name: "To Do", statusCategory: { key: "new", colorName: "blue-gray" } },
          updated: "2026-10-05T00:00:00Z",
          codeReviewers: [],
          flagged: false,
          project: { key: "CHD", name: "C" },
        },
      ],
      error: null,
    },
    doneTickets: {
      data: [
        {
          key: "WMU-402",
          summary: "Delete",
          toStatus: "Code Review",
          changedAt: "2026-10-10T08:00:00Z",
        },
      ],
      error: null,
    },
    merged: { data: [], error: null },
    reviewed: { data: null, error: "GitHub down" },
    ticketMerged: { data: [], error: null },
  }),
}));

// The modal's notes panel needs the app-level NotesProvider; not under test here.
vi.mock("../../components/PrNotesPanel", () => ({ PrNotesPanel: () => null }));
vi.mock("../../hooks/usePRBody", () => ({
  usePRBody: () => ({ body: "PR body text", loading: false }),
}));

import { WorkdayView } from "./WorkdayView";
import { MergeProvider } from "../../context/MergeContext";
import { WorkdaySection } from "./WorkdaySection";
const NOW = new Date(2026, 9, 11, 10, 0);
const prs: GitHubPR[] = [
  {
    id: 1,
    number: 3310,
    title: "WMU-402 delete",
    html_url: "https://github.com/o/r/pull/3310",
    state: "open",
    draft: false,
    created_at: "2026-10-09T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: "WMU-402" },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: ["guru"],
  },
];

function renderView(
  extra: Partial<React.ComponentProps<typeof WorkdayView>> = {},
  wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>,
) {
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
  const { rerender } = render(view({}), { wrapper });
  return {
    addNote,
    editNote,
    rerender: (more: Partial<React.ComponentProps<typeof WorkdayView>>) => rerender(view(more)),
  };
}

const MODE_KEY = "workday-v2.mode";
const listView = () => localStorage.setItem(MODE_KEY, "list");
const standup = () => localStorage.setItem(MODE_KEY, "standup");
const sectionOf = (title: string) =>
  screen.getByText(title).closest(".workday-section") as HTMLElement;

describe("Workday List View", () => {
  beforeEach(() => {
    localStorage.clear();
    listView();
  });

  it("shows v1's Focus lists, with Collapse all and no Copy", () => {
    renderView();
    for (const title of ["Lock in", "Mentions", "Working on", "Waiting on others"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByTestId("workday-list")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Copy$/ })).toBeNull();
  });

  it("switches between Focus, List View and Standup Sheet with the tabs and F / L / S", () => {
    localStorage.clear();
    renderView();
    expect(screen.getByTestId("deck-mode")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /List View/ }));
    expect(screen.getByText("Lock in")).toBeTruthy();
    expect(localStorage.getItem(MODE_KEY)).toBe("list");
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByTestId("standup-sheet")).toBeTruthy();
    // Not while typing in the note box.
    fireEvent.keyDown(screen.getByRole("textbox", { name: /Your blockers/ }), { key: "l" });
    expect(screen.getByTestId("standup-sheet")).toBeTruthy();
    fireEvent.keyDown(window, { key: "L" });
    expect(screen.getByTestId("workday-list")).toBeTruthy();
    fireEvent.keyDown(window, { key: "f" });
    expect(screen.getByTestId("deck-mode")).toBeTruthy();
  });

  it("collapses and expands every Focus section", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Collapse all/ }));
    for (const title of ["Mentions", "Working on", "Waiting on others"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(title) }).getAttribute("aria-expanded"),
      ).toBe("false");
    }
    fireEvent.click(screen.getByRole("button", { name: /Expand all/ }));
    for (const title of ["Mentions", "Working on", "Waiting on others"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(title) }).getAttribute("aria-expanded"),
      ).toBe("true");
    }
  });

  it("shows the all-clear line when nothing needs you", () => {
    renderView();
    expect(screen.getByText("✓ Nothing needs you right now")).toBeTruthy();
  });

  it("pins a PR to a Pinned section on top, remembers it, and unpins", () => {
    renderView({ openPRs: [{ ...prs[0], requested_reviewers: [] }] });
    expect(screen.queryByText("Pinned")).toBeNull();
    fireEvent.click(within(sectionOf("Lock in")).getByRole("button", { name: "Pin r#3310" }));

    const pinned = sectionOf("Pinned");
    expect(document.querySelector(".workday-section")).toBe(pinned);
    expect(within(pinned).getByText("delete")).toBeTruthy();
    // Moved, not copied: Lock in no longer lists it.
    expect(screen.getByText("✓ Nothing needs you right now")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("dev-home-workday-pins")!)).toEqual([
      "pr:https://github.com/o/r/pull/3310",
    ]);

    fireEvent.click(within(pinned).getByRole("button", { name: "Unpin r#3310" }));
    expect(screen.queryByText("Pinned")).toBeNull();
    expect(within(sectionOf("Lock in")).getByText("delete")).toBeTruthy();
  });

  it("pinning a ticket brings all its PRs into Pinned", () => {
    const second = {
      ...prs[0],
      id: 2,
      number: 3311,
      title: "WMU-402 follow-up",
      html_url: "https://github.com/o/r/pull/3311",
    };
    renderView({ openPRs: [prs[0], second] });
    fireEvent.click(screen.getAllByRole("button", { name: "Pin WMU-402" })[0]);
    const pinned = sectionOf("Pinned");
    expect(within(pinned).getByText("2 PRs")).toBeTruthy();
    expect(within(pinned).getByText("delete")).toBeTruthy();
    expect(within(pinned).getByText("follow-up")).toBeTruthy();
    expect(within(pinned).getByRole("button", { name: "Unpin WMU-402" })).toBeTruthy();
  });

  it("lists what needs you, and opens the PR modal from a row", () => {
    renderView({ openPRs: [{ ...prs[0], requested_reviewers: [] }] });
    const strip = sectionOf("Lock in");
    expect(within(strip).getByText("Unblock yourself")).toBeTruthy();
    const verb = within(strip).getByText("Request review");
    expect(verb.className).toContain("workday-tone--warning");
    fireEvent.click(within(strip).getByText("delete"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("groups a ticket's PRs in Needs you under one header", () => {
    renderView({
      openPRs: [
        { ...prs[0], requested_reviewers: [] },
        {
          ...prs[0],
          id: 2,
          number: 3311,
          title: "WMU-402 cleanup",
          html_url: "https://github.com/o/r/pull/3311",
          requested_reviewers: [],
        },
      ],
      allIssues: [
        { key: "WMU-402", summary: "Delete assets", status: { name: "In Progress" } } as JiraIssue,
      ],
    });
    const section = sectionOf("Lock in");
    expect(within(section).getAllByText("WMU-402")).toHaveLength(1);
    const header = within(section).getByText("2 PRs").closest(".workday-line") as HTMLElement;
    expect(within(header).getByText("Delete assets")).toBeTruthy();
    expect(within(section).getAllByText("Request review")).toHaveLength(2); // One state dot per PR after the count.
    expect(header.querySelectorAll(".workday-pr-dots i")).toHaveLength(2);
  });

  it("lists Needs you rows per PR with their own keys when grouped By PR, and remembers it", () => {
    const issues = [
      { key: "WMU-402", summary: "Delete assets", status: { name: "In Progress" } } as JiraIssue,
    ];
    const openPRs = [
      { ...prs[0], requested_reviewers: [] },
      {
        ...prs[0],
        id: 2,
        number: 3311,
        title: "WMU-402 cleanup",
        html_url: "https://github.com/o/r/pull/3311",
        has_conflict: true,
      },
    ];
    renderView({ openPRs, allIssues: issues });
    let section = sectionOf("Lock in");
    fireEvent.click(within(section).getByRole("button", { name: "By PR" }));
    expect(within(section).queryByText("2 PRs")).toBeNull();
    expect(within(section).getAllByText("WMU-402")).toHaveLength(2);
    // Ranked: the conflict (danger) above the missing reviewer (warning).
    const verbs = [...section.querySelectorAll(".workday-line--needs .workday-line-lead")];
    expect(verbs.map((v) => v.textContent)).toEqual(["Resolve conflict", "Request review"]);

    cleanup();
    renderView({ openPRs, allIssues: issues });
    section = sectionOf("Lock in");
    expect(within(section).getByRole("button", { name: "By PR" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows '+N more issues' beside a PR with several, listing them in the tooltip", () => {
    renderView({
      openPRs: [
        {
          ...prs[0],
          checks_status: "FAILURE",
          has_conflict: true,
          requested_reviewers: [],
        },
      ],
    });
    const section = sectionOf("Lock in");
    expect(within(section).getByText("Fix CI")).toBeTruthy();
    const pill = within(section).getByText("+2 more issues");
    expect(pill.getAttribute("title")).toBe(
      "Resolve conflict: conflicts with main\nRequest review: no reviewer assigned",
    );
  });

  it("points a ticket header at its PRs in other Needs you tiers", () => {
    renderView({
      openPRs: [{ ...prs[0], requested_reviewers: [] }],
      reviewRequests: [
        {
          ...prs[0],
          id: 2,
          number: 3311,
          title: "WMU-402 api",
          html_url: "https://github.com/o/r/pull/3311",
          user: { login: "abu", avatar_url: "" },
        },
      ],
      allIssues: [
        { key: "WMU-402", summary: "Delete assets", status: { name: "In Progress" } } as JiraIssue,
      ],
    });
    const section = sectionOf("Lock in");
    expect(within(section).getAllByText("WMU-402")).toHaveLength(2);
    expect(within(section).getByText("+1 in Unblock others")).toBeTruthy();
    expect(within(section).getByText("+1 in Unblock yourself")).toBeTruthy();
  });

  it("shows a ticket's PRs under it in Working on by default; Hide PRs is remembered", () => {
    const issues = [
      { key: "WMU-402", summary: "Delete assets", status: { name: "In Progress" } } as JiraIssue,
    ];
    renderView({ allIssues: issues });
    const section = () => sectionOf("Working on");
    const child = within(section()).getByText("r#3310").closest(".workday-item") as HTMLElement;
    expect(child.classList.contains("workday-item--child")).toBe(true);
    expect(within(child).getByText("delete")).toBeTruthy();
    fireEvent.click(within(section()).getByRole("button", { name: "Hide PRs" }));
    expect(within(section()).queryByText("r#3310")).toBeNull();
    expect(localStorage.getItem("dev-home-workday-working-prs")).toBe("0");
    cleanup();
    renderView({ allIssues: issues });
    expect(within(section()).queryByText("r#3310")).toBeNull();
    fireEvent.click(within(section()).getByRole("button", { name: "Show PRs" }));
    expect(within(section()).getByText("r#3310")).toBeTruthy();
  });

  it("shows recent mentions in Focus", () => {
    renderView({
      githubMentions: [
        {
          id: 1,
          html_url: "https://github.com/o/r/pull/9#issuecomment-1",
          body: "@me can you look?",
          created_at: "2026-10-10T09:00:00Z",
          updated_at: "2026-10-10T09:00:00Z",
          user: { login: "tomas", avatar_url: "" },
          pr_number: 9,
          repo_full_name: "o/r",
          context_title: "WMU-9 thing",
          reason: "mention",
        },
      ],
    });
    const section = sectionOf("Mentions");
    expect(within(section).getByText("tomas")).toBeTruthy();
    expect(within(section).getByText("r#9")).toBeTruthy();
    expect(within(section).getByText("@me can you look?")).toBeTruthy();
  });

  it("keeps Waiting on others collapsed by default", () => {
    renderView();
    const toggle = screen.getByRole("button", { name: /Waiting on others/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(within(sectionOf("Waiting on others")).getByText("guru · 2d")).toBeTruthy();
  });

  it("copies a PR's link with a toast", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    renderView();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Copy link to r#3310" })[0]);
    });
    expect(writeText).toHaveBeenLastCalledWith("https://github.com/o/r/pull/3310");
    expect(screen.getByRole("status").textContent).toBe("Copied PR link to clipboard");
  });

  it("links a PR's repo#number to GitHub next to its copy icon", () => {
    renderView();
    const link = screen.getAllByRole("link", { name: "Open r#3310 on GitHub" })[0];
    expect(link.getAttribute("href")).toBe("https://github.com/o/r/pull/3310");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("copies a ticket key from next to its pill without opening the row", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    renderView();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Copy WMU-402" })[0]);
    });
    expect(writeText).toHaveBeenLastCalledWith("WMU-402");
    expect(screen.getByRole("status").textContent).toBe("Copied ticket key to clipboard");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getAllByRole("link", { name: "Open WMU-402 in Jira" })[0].getAttribute("href"),
    ).toContain("/browse/WMU-402");
  });
});

describe("Workday standup note", () => {
  beforeEach(() => {
    localStorage.clear();
    standup();
  });
  afterEach(() => vi.useRealTimers());

  const typeNote = async (value: string) => {
    fireEvent.change(screen.getByRole("textbox", { name: /Your blockers/ }), {
      target: { value },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
  };

  it("creates today's standup note once, then edits it", async () => {
    vi.useFakeTimers();
    const { addNote, editNote } = renderView();
    const box = screen.getByRole("textbox", { name: /Your blockers/ });
    fireEvent.change(box, { target: { value: "Need prod access" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(addNote).toHaveBeenCalledWith(
      "standup",
      "Need prod access",
      "standup:2026-10-11",
      "Standup · Sun 11 Oct",
    );
    fireEvent.change(box, { target: { value: "Need prod access!" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(editNote).toHaveBeenCalledWith(7, { content: "Need prod access!" });
  });

  it("shows a save error when autosave fails, and retries the create", async () => {
    vi.useFakeTimers();
    const addNote = vi
      .fn()
      .mockRejectedValueOnce(new Error("db locked"))
      .mockImplementation(
        async (type, content, reference_id, title) =>
          ({ id: 8, type, content, reference_id, title }) as Note,
      );
    renderView({ addNote });
    await typeNote("Need prod access");
    expect(screen.getByText(/Couldn't save to Notes; will retry on next edit/)).toBeTruthy();

    await typeNote("Need prod access!");
    expect(addNote).toHaveBeenCalledTimes(2);
    expect(addNote).toHaveBeenLastCalledWith(
      "standup",
      "Need prod access!",
      "standup:2026-10-11",
      "Standup · Sun 11 Oct",
    );
    expect(screen.queryByText(/Couldn't save/)).toBeNull();
  });

  it("folds keystrokes made during an in-flight create into one follow-up edit", async () => {
    vi.useFakeTimers();
    let resolveCreate: (n: Note) => void = () => {};
    const addNote = vi.fn(() => new Promise<Note>((r) => (resolveCreate = r)));
    const editNote = vi.fn(async () => {});
    renderView({ addNote, editNote });
    await typeNote("one");
    await typeNote("one two");
    await typeNote("one two three");
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(editNote).not.toHaveBeenCalled();
    await act(async () => {
      resolveCreate({ id: 11, type: "standup", content: "one" } as Note);
    });
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(editNote).toHaveBeenCalledTimes(1);
    expect(editNote).toHaveBeenCalledWith(11, { content: "one two three" });
  });

  it("holds the create until notes load, then edits today's existing note", async () => {
    vi.useFakeTimers();
    const { addNote, editNote, rerender } = renderView({ notesLoaded: false });
    await typeNote("Need prod access");
    expect(addNote).not.toHaveBeenCalled();
    const existing = {
      id: 42,
      type: "standup",
      content: "old",
      reference_id: "standup:2026-10-11",
      title: "Standup · Sun 11 Oct",
    } as Note;
    await act(async () => {
      rerender({ notesLoaded: true, notes: [existing] });
    });
    expect(addNote).not.toHaveBeenCalled();
    expect(editNote).toHaveBeenCalledWith(42, { content: "Need prod access" });
  });

  it("doesn't create a note for whitespace-only text", async () => {
    vi.useFakeTimers();
    const { addNote } = renderView();
    await typeNote("   ");
    expect(addNote).not.toHaveBeenCalled();
  });
});

describe("WorkdaySection", () => {
  it("hides the empty line when there is an error", () => {
    render(
      <WorkdaySection
        collapsed={false}
        onToggle={() => {}}
        title="Done"
        count={0}
        loading={false}
        error="Jira down"
        empty="Nothing here"
      >
        {null}
      </WorkdaySection>,
    );
    expect(screen.getByText("Jira down")).toBeTruthy();
    expect(screen.queryByText("Nothing here")).toBeNull();
  });
});

describe("Workday List View merge button", () => {
  beforeEach(() => {
    localStorage.clear();
    listView();
  });

  const ready: GitHubPR = {
    ...prs[0],
    review_status: "APPROVED",
    checks_status: "SUCCESS",
    requested_reviewers: [],
  };

  it("gives my ready PR the Merge button in Needs you and Working on", () => {
    renderView({ openPRs: [ready], githubUsername: "me" }, MergeProvider);
    const shipRow = within(sectionOf("Lock in")).getByText("delete").closest(".workday-line")!;
    expect(within(shipRow as HTMLElement).getByRole("button", { name: "Merge" })).toBeTruthy();
    const working = sectionOf("Working on");
    expect(within(working).getByRole("button", { name: "Merge" })).toBeTruthy();
    expect(within(working).queryByText("Ready to merge")).toBeNull();
  });

  it("keeps the badge when the PR isn't ready", () => {
    renderView({ openPRs: prs, githubUsername: "me" }, MergeProvider);
    expect(screen.queryByRole("button", { name: "Merge" })).toBeNull();
  });
});
