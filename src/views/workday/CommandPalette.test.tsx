import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GitHubPR, JiraIssue, Note } from "../../types";
import type { MentionItem } from "./types";
import type { DeckData } from "./deckTypes";

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
const getPrDetail = vi.fn();
vi.mock("../../api/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/github")>()),
  getPrDetail: (args: unknown) => getPrDetail(args),
}));

import { WorkdayView } from "./WorkdayView";
import { CommandPalette, UNMATCHED_CAP } from "./CommandPalette";

const NOW = new Date(2026, 9, 14, 10, 0);

function pr(n: number, title: string, created: string, o: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: n,
    number: n,
    title,
    html_url: `https://github.com/o/r/pull/${n}`,
    state: "open",
    draft: false,
    created_at: created,
    updated_at: "2026-10-14T08:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: `branch-${n}` },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: [],
    ...o,
  };
}

const deckPRs: GitHubPR[] = [
  pr(1203, "CCP-412 backend: queue worker", "2026-10-01T10:00:00Z"),
  pr(1199, "CCP-401 Webhook retry policy", "2026-10-03T10:00:00Z"),
  pr(1150, "CCP-388 Bulk tag editor", "2026-10-04T10:00:00Z", {
    updated_at: "2026-10-14T09:00:00Z",
  }),
];

const issue = (key: string, summary: string): JiraIssue => ({
  key,
  summary,
  status: { name: "In Progress", statusCategory: { key: "indeterminate", colorName: "yellow" } },
  priority: { name: "Medium", iconUrl: "" },
  assignee: { displayName: "Me", avatarUrls: { "48x48": "" } },
  project: { key: "CCP", name: "Project" },
  created: "2026-10-05T10:00:00Z",
  updated: "2026-10-10T10:00:00Z",
  codeReviewers: [],
});

const deckIssues = [
  issue("CCP-412", "Move asset sync to a queue"),
  issue("CCP-401", "Webhook retry policy"),
  issue("CCP-388", "Bulk tag editor"),
];

/** A seeded deck where everything is seen except the given PR numbers. */
function seedSeen(unseen: number[] = []) {
  const seen: Record<string, string> = {};
  for (const p of deckPRs) if (!unseen.includes(p.number)) seen[p.html_url] = p.updated_at;
  for (const k of ["CCP-412", "CCP-401", "CCP-388"]) seen[`ticket:${k}`] = NOW.toISOString();
  localStorage.setItem("dev-home-workday-v2", JSON.stringify({ v: 1, seeded: true, seen }));
}
const stored = () => JSON.parse(localStorage.getItem("dev-home-workday-v2") ?? "{}");

function renderDeck(extra: Partial<React.ComponentProps<typeof WorkdayView>> = {}) {
  const addNote = vi.fn(
    async (type, content, reference_id, title) =>
      ({ id: 7, type, content, reference_id, title }) as Note,
  );
  render(
    <WorkdayView
      configured
      openPRs={deckPRs}
      reviewRequests={[]}
      reviewingPRs={[]}
      assignedIssues={[]}
      allIssues={deckIssues}
      loading={false}
      jiraBaseUrl="https://example.atlassian.net"
      weekendDays={[5, 6]}
      refreshKey={0}
      onRefresh={() => {}}
      notes={[]}
      notesLoaded
      addNote={addNote}
      editNote={vi.fn(async () => {})}
      now={NOW}
      {...extra}
    />,
  );
  return { addNote };
}

const press = (key: string, init: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(document.body, { key, ...init });
const openPalette = () => press("k", { metaKey: true });
const input = () => screen.getByRole("combobox", { name: /Find a ticket/ });
const queryInput = () => screen.queryByRole("combobox", { name: /Find a ticket/ });
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const key = (k: string, init: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(input(), { key: k, ...init });
const card = () => screen.getByRole("region", { name: /^CCP-/ });
const activeOption = () => document.getElementById(input().getAttribute("aria-activedescendant")!);
const flush = () => act(async () => {});

describe("⌘K command palette", () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    getPrDetail.mockReset();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("opens with ⌘K (and Ctrl+K), closes with Esc, and ⌘K toggles it", () => {
    renderDeck();
    expect(queryInput()).toBeNull();
    openPalette();
    expect(input()).toHaveFocus();
    expect(input()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("↑↓ move · ⏎ jump · Tab actions · esc close")).toBeTruthy();
    fireEvent.keyDown(input(), { key: "Escape", code: "Escape", keyCode: 27 });
    expect(queryInput()).toBeNull();

    press("k", { ctrlKey: true });
    expect(input()).toBeTruthy();
    fireEvent.keyDown(input(), { key: "k", metaKey: true });
    expect(queryInput()).toBeNull();
  });

  it("opens from the header button", () => {
    renderDeck();
    fireEvent.click(screen.getByRole("button", { name: /find & act/ }));
    expect(input()).toBeTruthy();
  });

  it("does not open over the PR modal", async () => {
    renderDeck();
    press("Enter");
    await screen.findByRole("dialog");
    openPalette();
    expect(queryInput()).toBeNull();
  });

  it("lists unseen PRs and the commands for an empty query", () => {
    seedSeen([1150]);
    renderDeck();
    openPalette();
    const updated = screen.getByRole("group", { name: "Updated since you looked" });
    const rows = within(updated).getAllByRole("option");
    expect(rows[0].textContent).toContain("r#1150 CCP-388 Bulk tag editor");
    const commands = within(screen.getByRole("group", { name: "Commands" }))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(commands).toEqual([
      "Next updated ticketn",
      "Show only currentg c",
      "Show closed",
      "Refreshr",
      "Switch to List ViewL",
      "Switch to Standup SheetS",
      "Hide key hints",
    ]);
  });

  it("jumps to a pasted PR URL's card", async () => {
    renderDeck();
    openPalette();
    type("https://github.com/o/r/pull/1150/files#discussion_r1");
    key("Enter");
    await flush();
    expect(queryInput()).toBeNull();
    expect(card()).toHaveAccessibleName(/^CCP-388/);
  });

  it("jumps to a ticket by key and reopens a closed one", async () => {
    renderDeck();
    press("ArrowRight"); // CCP-401
    press("x");
    expect(stored().closed).toHaveProperty("CCP-401");
    openPalette();
    type("CCP-401");
    expect(activeOption()?.textContent).toContain("closed");
    key("Enter");
    await flush();
    expect(card()).toHaveAccessibleName(/^CCP-401/);
    expect(stored().closed ?? {}).not.toHaveProperty("CCP-401");
  });

  it("⌘B copies the branch name and confirms with the toast", async () => {
    renderDeck();
    openPalette();
    type("1199");
    key("b", { metaKey: true });
    await flush();
    expect(writeText).toHaveBeenCalledWith("branch-1199");
    expect(screen.getByText("Copied branch name to clipboard")).toHaveClass("is-visible");
    expect(queryInput()).toBeNull();
  });

  it("⌘L copies the PR link", async () => {
    renderDeck();
    openPalette();
    type("1199");
    key("l", { metaKey: true });
    await flush();
    expect(writeText).toHaveBeenCalledWith("https://github.com/o/r/pull/1199");
  });

  it("Space toggles current with an empty query; with a query it types", () => {
    seedSeen([1150]);
    renderDeck();
    openPalette();
    key(" ");
    expect(stored().current).toEqual(["pr:https://github.com/o/r/pull/1150"]);
    expect(input()).toBeTruthy(); // stays open
    expect(within(activeOption()!).getByText("current")).toBeTruthy();

    type("bulk");
    const typed = fireEvent.keyDown(input(), { key: " " });
    expect(typed).toBe(true); // not prevented: the space goes into the query
    expect(stored().current).toEqual(["pr:https://github.com/o/r/pull/1150"]);
    key(" ", { metaKey: true, shiftKey: true });
    expect(stored().current ?? []).toEqual([]);
  });

  it("Tab moves into the actions; ↓ and ⏎ run one, and plain b copies the branch there", async () => {
    renderDeck();
    openPalette();
    type("1203");
    const actions = () =>
      screen.getAllByRole("option").filter((o) => o.classList.contains("deck-palette-action"));
    expect(actions().map((a) => a.textContent)).toEqual([
      "Jump to card⏎",
      "Toggle “I'm on it”⌘⇧Space",
      "Open PR (modal)⌥⏎",
      "Open on GitHub⌘⏎",
      "Copy branch name⌘B",
      "Copy PR link⌘L",
      "Add note…⌘.",
      "Close tab⌘⌫",
      "Mark unread⌘U",
    ]);
    key("Tab");
    expect(activeOption()).toBe(actions()[0]);
    key("ArrowDown");
    expect(activeOption()).toBe(actions()[1]);
    key("Enter");
    expect(stored().current).toEqual(["pr:https://github.com/o/r/pull/1203"]);
    key("b");
    await flush();
    expect(writeText).toHaveBeenCalledWith("branch-1203");
  });

  it("⌥⏎ opens the PR modal and marks it seen", async () => {
    seedSeen([1150]);
    renderDeck();
    openPalette();
    key("Enter", { altKey: true });
    await flush();
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Bulk tag editor");
    expect(stored().seen["https://github.com/o/r/pull/1150"]).toBe("2026-10-14T09:00:00Z");
  });

  it("⌘. jumps to the card and opens the note composer", async () => {
    const { addNote } = renderDeck();
    openPalette();
    type("1199");
    key(".", { metaKey: true });
    await flush();
    expect(card()).toHaveAccessibleName(/^CCP-401/);
    const box = screen.getByRole("textbox", { name: /^New note/ });
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: "retry later" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await flush();
    expect(addNote).toHaveBeenCalledWith("github_pr", "retry later", "o/r#1199");
  });

  it("⌘⌫ closes and reopens the tab; ⌘U marks unread", () => {
    renderDeck();
    openPalette();
    type("1199");
    key("Backspace", { metaKey: true });
    expect(stored().closed).toHaveProperty("CCP-401");
    expect(within(activeOption()!).getByText("closed")).toBeTruthy();
    key("Backspace", { metaKey: true });
    expect(stored().closed ?? {}).not.toHaveProperty("CCP-401");
    key("u", { metaKey: true });
    expect(stored().seen?.["https://github.com/o/r/pull/1199"]).toBeUndefined();
    expect(screen.getByText("Marked unread")).toHaveClass("is-visible");
  });

  it("opens a PR that isn't in the deck through getPrDetail", async () => {
    getPrDetail.mockResolvedValue({
      pr: pr(5, "Outside change", "2026-10-01T10:00:00Z", {
        html_url: "https://github.com/x/y/pull/5",
        repo_full_name: "x/y",
      }),
    });
    renderDeck();
    openPalette();
    type("https://github.com/x/y/pull/5");
    expect(activeOption()?.textContent).toContain("not in deck");
    key("Enter");
    await flush();
    expect(getPrDetail).toHaveBeenCalledWith({ owner: "x", repo: "y", number: 5 });
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Outside change");
  });

  it("toasts when an outside PR can't be loaded", async () => {
    getPrDetail.mockRejectedValue(new Error("nope"));
    renderDeck();
    openPalette();
    type("x/y#5");
    key("Enter");
    await flush();
    expect(screen.getByText("Couldn't load that PR")).toHaveClass("is-visible");
  });

  it("drops an outside PR that loads after the palette was reopened", async () => {
    let resolve!: (v: unknown) => void;
    getPrDetail.mockReturnValue(new Promise((r) => (resolve = r)));
    renderDeck();
    openPalette();
    type("x/y#5");
    key("Enter");
    await flush();
    expect(getPrDetail).toHaveBeenCalled();
    openPalette();
    await act(async () => {
      resolve({
        pr: pr(5, "Outside change", "2026-10-01T10:00:00Z", {
          html_url: "https://github.com/x/y/pull/5",
          repo_full_name: "x/y",
        }),
      });
    });
    expect(screen.queryByText(/Outside change/)).toBeNull();
    expect(input()).toBeTruthy();
  });

  it("repeated ⌘⌫ on an empty query toggles the same row, not its neighbour", () => {
    seedSeen([1199, 1150]);
    renderDeck();
    openPalette();
    const group = screen.getByRole("group", { name: "Updated since you looked" });
    expect(group.querySelectorAll(".deck-palette-option")).toHaveLength(2);
    const first = activeOption()!.textContent!;
    const [mine, other] = first.includes("#1199") ? ["CCP-401", "CCP-388"] : ["CCP-388", "CCP-401"];
    key("Backspace", { metaKey: true });
    expect(stored().closed).toHaveProperty(mine);
    // The closed row stays put and selected, now offering Reopen.
    expect(activeOption()!.textContent).toBe(first + "closed");
    key("Tab");
    expect(screen.getByRole("option", { name: /Reopen tab/ })).toBeTruthy();
    key("Tab");
    key("Backspace", { metaKey: true });
    expect(stored().closed ?? {}).not.toHaveProperty(mine);
    expect(stored().closed ?? {}).not.toHaveProperty(other);
  });

  it("restores focus after copy, GitHub and command actions, not after opening a modal", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderDeck();
    const trigger = screen.getByRole("button", { name: /find & act/ });
    const reopen = () => {
      trigger.focus();
      fireEvent.click(trigger);
    };
    reopen();
    type("1199");
    key("l", { metaKey: true });
    await flush();
    expect(queryInput()).toBeNull();
    expect(trigger).toHaveFocus();

    reopen();
    type("1199");
    key("Enter", { metaKey: true });
    await flush();
    expect(trigger).toHaveFocus();

    reopen();
    fireEvent.click(screen.getByRole("option", { name: /Hide key hints/ }));
    await flush();
    expect(trigger).toHaveFocus();

    reopen();
    type("1199");
    key("Enter", { altKey: true });
    await flush();
    expect(trigger).not.toHaveFocus();
    open.mockRestore();
  });

  it("opens a ticket that isn't in the deck in Jira when there's no drawer", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderDeck();
    openPalette();
    type("ABC-9");
    key("Enter");
    await flush();
    expect(open).toHaveBeenCalledWith(
      "https://example.atlassian.net/browse/ABC-9",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("runs commands: Switch to Standup, and ⌘K still works there", async () => {
    renderDeck();
    openPalette();
    type("");
    const cmd = screen.getByRole("option", { name: /Switch to Standup/ });
    fireEvent.click(cmd);
    await flush();
    expect(screen.getByTestId("standup-sheet")).toBeTruthy();
    openPalette();
    expect(screen.getByRole("option", { name: /Switch to Focus/ })).toBeTruthy();
  });

  it("deck keys and mode keys stand down while it's open", () => {
    renderDeck();
    openPalette();
    press("ArrowRight");
    press("s");
    expect(card()).toHaveAccessibleName(/^CCP-412/);
  });
});

describe("CommandPalette", () => {
  const mention = (i: number): MentionItem => ({
    id: `m${i}`,
    source: "GitHub",
    who: `user${i}`,
    ticketKey: null,
    where: `other#${i}`,
    snippet: `comment ${i}`,
    at: new Date(Date.UTC(2026, 9, 1, i)).toISOString(),
    url: `https://github.com/x/other/pull/${i}#c${i}`,
  });
  const deck = (unmatched: MentionItem[]): DeckData =>
    ({
      current: [],
      open: [],
      closed: [],
      unmatched,
      counts: { tickets: 0, current: 0, unseen: 0 },
    }) as DeckData;

  it("caps unmatched mentions to the newest few and opens one on ⏎", async () => {
    const onOpenMention = vi.fn();
    const mentions = Array.from({ length: UNMATCHED_CAP + 3 }, (_, i) => mention(i));
    render(
      <CommandPalette
        show
        onHide={() => {}}
        deck={deck(mentions)}
        commands={[]}
        onAction={vi.fn()}
        onOpenMention={onOpenMention}
      />,
    );
    const rows = within(
      screen.getByRole("group", { name: "Updated since you looked" }),
    ).getAllByRole("option");
    expect(rows).toHaveLength(UNMATCHED_CAP);
    expect(rows[0].textContent).toContain(`user${UNMATCHED_CAP + 2}`);
    fireEvent.keyDown(input(), { key: "Enter" });
    // Closing actions wait for the parent to hide the palette.
    expect(onOpenMention).not.toHaveBeenCalled();
  });

  it("says when nothing is new or nothing matches", () => {
    render(
      <CommandPalette
        show
        onHide={() => {}}
        deck={deck([])}
        commands={[]}
        onAction={vi.fn()}
        onOpenMention={vi.fn()}
      />,
    );
    expect(screen.getByText("Nothing new since you looked")).toBeTruthy();
    type("zzz");
    expect(screen.getByText("No matches")).toBeTruthy();
  });
});
