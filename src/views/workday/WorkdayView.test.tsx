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
  }),
}));

// The modal's notes panel needs the app-level NotesProvider; not under test here.
vi.mock("../../components/PrNotesPanel", () => ({ PrNotesPanel: () => null }));
vi.mock("../../hooks/usePRBody", () => ({
  usePRBody: () => ({ body: "PR body text", loading: false }),
}));

import { WorkdayView } from "./WorkdayView";
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

const standup = () => localStorage.setItem("workday.mode", "standup");
const sectionOf = (title: string) =>
  screen.getByText(title).closest(".workday-section") as HTMLElement;

describe("WorkdayView modes", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to Focus, without the sprint filter, Collapse all or Copy", () => {
    renderView();
    for (const title of ["Needs you", "Mentions", "Working on", "Waiting on others"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.queryByText("In Progress")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy standup" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Off-sprint · / })).toBeNull();
    expect(screen.queryByRole("button", { name: /Collapse all/ })).toBeNull();
  });

  it("switches mode from the toggle and remembers it", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Standup/ }));
    expect(screen.getByText("In Progress")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy standup" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Off-sprint · 1/ })).toBeTruthy();
    expect(localStorage.getItem("workday.mode")).toBe("standup");
    cleanup();

    renderView();
    expect(screen.getByText("In Progress")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Focus/ }));
    expect(screen.getByText("Needs you")).toBeTruthy();
    expect(localStorage.getItem("workday.mode")).toBe("focus");
  });

  it("switches with F / S, but not while typing in the notes", () => {
    renderView();
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByText("In Progress")).toBeTruthy();
    const box = screen.getByPlaceholderText(/Anything to raise at standup/);
    fireEvent.keyDown(box, { key: "f" });
    expect(screen.getByText("In Progress")).toBeTruthy();
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(screen.getByText("In Progress")).toBeTruthy();
    fireEvent.keyDown(window, { key: "F" });
    expect(screen.getByText("Needs you")).toBeTruthy();
  });

  it("shows the all-clear line when nothing needs you", () => {
    renderView();
    expect(screen.getByText("✓ Nothing needs you right now")).toBeTruthy();
    expect(screen.getByText("All clear")).toBeTruthy();
  });

  it("lists what needs you, and opens the PR modal from a row", () => {
    renderView({ openPRs: [{ ...prs[0], requested_reviewers: [] }] });
    expect(screen.getByText("1 thing needs you")).toBeTruthy();
    const strip = sectionOf("Needs you");
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
    const section = sectionOf("Needs you");
    expect(within(section).getAllByText("WMU-402")).toHaveLength(1);
    const header = within(section).getByText("2 PRs").closest(".workday-line") as HTMLElement;
    expect(within(header).getByText("Delete assets")).toBeTruthy();
    expect(within(section).getAllByText("Request review")).toHaveLength(2); // One state dot per PR after the count.
    expect(header.querySelectorAll(".workday-pr-dots i")).toHaveLength(2);
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
    const section = sectionOf("Needs you");
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
});

describe("WorkdayView standup", () => {
  beforeEach(() => {
    localStorage.clear();
    standup();
  });
  afterEach(() => vi.useRealTimers());

  it("renders the standup sections, the off-sprint count, and a per-section error", () => {
    renderView();
    for (const title of [
      "Done since last workday",
      "In Progress",
      "Blockers",
      "Reviewing",
      "Assigned, not started",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /Off-sprint · 1/ })).toBeTruthy();
    expect(screen.getByText(/GitHub down/)).toBeTruthy();
    expect(screen.getByText("Since Thu 8 Oct")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Assigned, not started/ }));
    expect(within(sectionOf("Assigned, not started")).getByText("Off-sprint")).toBeTruthy();
  });

  it("titles the done section after the lookback", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "3 days" }));
    expect(screen.getByText("Done in the last 3 days")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(screen.getByText("Done in the last 7 days")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Last workday" }));
    expect(screen.getByText("Done since last workday")).toBeTruthy();
  });

  it("copies the standup markdown and confirms with a toast", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy standup" }));
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("*Yesterday*\n• Moved WMU-402 to Code Review"),
    );
    expect(screen.getByRole("status").textContent).toBe("Standup copied");
  });

  it("hides the standup text until Preview is clicked", () => {
    renderView();
    expect(document.querySelector(".workday-preview")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(document.querySelector(".workday-preview")?.textContent).toContain("*Yesterday*");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(document.querySelector(".workday-preview")).toBeNull();
  });

  it("shows each PR once in In Progress, with one state badge", () => {
    renderView({ openPRs: [{ ...prs[0], requested_reviewers: [] }] });
    const section = sectionOf("In Progress");
    expect(within(section).getAllByText("delete")).toHaveLength(1);
    expect(within(section).getByText("No reviewer").className).toContain("badge-status--warning");
  });

  it("lists blockers as one-liners under their ticket, even a lone one", () => {
    renderView({
      openPRs: [{ ...prs[0], requested_reviewers: [] }],
      allIssues: [
        { key: "WMU-402", summary: "Delete assets", status: { name: "In Progress" } } as JiraIssue,
      ],
    });
    const section = sectionOf("Blockers");
    const line = within(section).getByText("No reviewer").closest(".workday-line") as HTMLElement;
    expect(within(line).getByText("delete")).toBeTruthy();
    expect(within(line).queryByText("WMU-402")).toBeNull();
    const header = within(section).getByText("1 blocker").closest(".workday-line") as HTMLElement;
    expect(within(header).getByText("WMU-402")).toBeTruthy();
    expect(within(header).getByText("Delete assets")).toBeTruthy();
  });

  it("groups a ticket's blockers under one header", () => {
    renderView({
      openPRs: [
        { ...prs[0], requested_reviewers: [] },
        {
          ...prs[0],
          id: 2,
          number: 3311,
          title: "WMU-402 cleanup",
          html_url: "https://github.com/o/r/pull/3311",
          has_conflict: true,
        },
      ],
      allIssues: [
        { key: "WMU-402", summary: "Delete assets", status: { name: "In Progress" } } as JiraIssue,
      ],
    });
    const section = sectionOf("Blockers");
    expect(within(section).getAllByText("WMU-402")).toHaveLength(1);
    const header = within(section).getByText("2 blockers").closest(".workday-line") as HTMLElement;
    expect(within(header).getByText("Delete assets")).toBeTruthy();
    const child = within(section).getByText("Conflict").closest(".workday-line") as HTMLElement;
    expect(child.classList.contains("workday-line--child")).toBe(true);
    expect(within(child).getByText("cleanup")).toBeTruthy();
  });

  it("labels reviewing one-liners by whose move it is", () => {
    const other = (n: number, url: string): GitHubPR => ({
      ...prs[0],
      id: n,
      number: n,
      title: `CPC-${n} change`,
      html_url: url,
      user: { login: "abu", avatar_url: "" },
    });
    renderView({
      reviewRequests: [
        other(49, "https://github.com/o/r/pull/49"),
        { ...other(50, "https://github.com/o/r/pull/50"), viewer_engaged: true },
      ],
      reviewingPRs: [
        other(55, "https://github.com/o/r/pull/55"),
        {
          ...other(56, "https://github.com/o/r/pull/56"),
          viewer_review_state: "CHANGES_REQUESTED",
          new_commits_since_review: true,
        },
      ],
    });
    const section = sectionOf("Reviewing");
    expect(within(section).getByText("Requested").className).toContain("workday-tone--info");
    expect(within(section).getByText("Re-requested").className).toContain("workday-tone--warning");
    expect(within(section).getByText("New commits")).toBeTruthy();
    expect(within(section).getByText("Waiting on author")).toBeTruthy();
    for (const n of [49, 50, 55, 56])
      expect(within(section).getByText(`r#${n} · abu`)).toBeTruthy();
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

  it("opens the PR modal from a row instead of a new tab", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderView();
    fireEvent.click(within(sectionOf("In Progress")).getByText("delete"));
    expect(open).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector('a[href="https://github.com/o/r/pull/3310"]')).toBeTruthy();
    open.mockRestore();
  });

  it("creates today's standup note once, then edits it", async () => {
    vi.useFakeTimers();
    const { addNote, editNote } = renderView();
    const box = screen.getByPlaceholderText(/Anything to raise at standup/);
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
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(
      within(document.querySelector(".workday-preview") as HTMLElement).getByText(
        /Need prod access!/,
      ),
    ).toBeTruthy();
  });

  const typeNote = async (value: string) => {
    fireEvent.change(screen.getByPlaceholderText(/Anything to raise at standup/), {
      target: { value },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
  };

  it("shows a save error instead of the hint when autosave fails, and retries the create", async () => {
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
    expect(screen.getByText(/Couldn't save — will retry on next edit/)).toBeTruthy();
    expect(screen.queryByText(/Saved to Notes as/)).toBeNull();

    await typeNote("Need prod access!");
    expect(addNote).toHaveBeenCalledTimes(2);
    expect(addNote).toHaveBeenLastCalledWith(
      "standup",
      "Need prod access!",
      "standup:2026-10-11",
      "Standup · Sun 11 Oct",
    );
    expect(screen.queryByText(/Couldn't save/)).toBeNull();
    expect(screen.getByText(/Saved to Notes as/)).toBeTruthy();
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
  beforeEach(() => localStorage.clear());

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

  it("collapses and expands from the header, remembering the choice", () => {
    standup();
    renderView();
    const toggle = screen.getByRole("button", { name: /In Progress/ });
    const prIn = () => within(sectionOf("In Progress")).queryByText("delete");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(prIn()).toBeTruthy();
    fireEvent.click(toggle);
    expect(prIn()).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    cleanup();

    renderView();
    expect(prIn()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /In Progress/ }));
    expect(prIn()).toBeTruthy();
  });

  it("collapses and expands every standup section at once", () => {
    standup();
    renderView();
    const sectionToggles = () => [...document.querySelectorAll(".workday-section-toggle")];
    fireEvent.click(screen.getByRole("button", { name: /Collapse all/ }));
    expect(sectionToggles().every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(screen.queryByText("delete")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Expand all/ }));
    expect(sectionToggles().every((b) => b.getAttribute("aria-expanded") === "true")).toBe(true);
  });
});
