import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { GitHubPR } from "../../types";
import { DeckMode, type DeckModeProps } from "./DeckMode";
import type { DeckData, DeckPR, DeckTicket } from "./deckTypes";

const NOW = new Date("2026-10-14T12:00:00Z");

// The phone rail drawer is an Offcanvas, which checks a responsive breakpoint; jsdom has no matchMedia.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

function pr(n: number, o: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: n,
    number: n,
    title: `CCP-1 PR ${n}`,
    html_url: `https://github.com/o/r/pull/${n}`,
    state: "open",
    draft: false,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-14T10:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: `b-${n}` },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: [],
    ...o,
  };
}

function deckPR(n: number, o: Partial<DeckPR> = {}, p: Partial<GitHubPR> = {}): DeckPR {
  return {
    pr: pr(n, p),
    mine: true,
    signals: [],
    priority: 5,
    unseenComment: null,
    note: null,
    current: false,
    unseen: false,
    ...o,
  };
}

function ticket(key: string, o: Partial<DeckTicket> = {}): DeckTicket {
  return {
    id: key,
    key,
    title: `Title ${key}`,
    ticket: {
      key,
      summary: `Title ${key}`,
      statusName: "In Progress",
      updated: null,
      offSprint: false,
    },
    prs: [],
    stripe: "neutral",
    status: "No PR yet",
    statusTone: "neutral",
    reviewOnly: false,
    unseen: false,
    current: false,
    jiraMention: null,
    note: null,
    todos: [],
    noteItem: null,
    ...o,
  };
}

function deck(o: Partial<DeckData> = {}): DeckData {
  return {
    current: [],
    merged: [],
    open: [],
    closed: [],
    unmatched: [],
    counts: { tickets: 0, current: 0, unseen: 0 },
    ...o,
  };
}

/** DeckMode's phone props: drawer closed, card 1 of 3. */
const phoneDeck = (o: Partial<NonNullable<DeckModeProps["phone"]>> = {}) => ({
  railOpen: false,
  onRailOpenChange: vi.fn(),
  position: 1,
  total: 3,
  tickets: 3,
  counts: { openPRs: 5, reviewRequests: 2 },
  ...o,
});

function renderDeck(props: Partial<DeckModeProps> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onSelectPr: vi.fn(),
    onOpen: vi.fn(),
    onReopen: vi.fn(),
  };
  const d = props.deck ?? deck();
  const all = [...d.current, ...d.open];
  const selected = all.find((t) => t.id === props.selectedId) ?? all[0] ?? null;
  render(
    <DeckMode
      deck={d}
      selectedId={selected?.id ?? null}
      selectedPrUrl={selected?.prs[0]?.pr.html_url ?? null}
      jiraBaseUrl="https://example.atlassian.net"
      now={NOW}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("DeckMode rail", () => {
  it("labels the Current and Open groups and folds Closed with its count", () => {
    renderDeck({
      deck: deck({
        current: [ticket("CCP-1", { current: true })],
        open: [ticket("CCP-2")],
        closed: [ticket("CCP-3"), ticket("CCP-4")],
      }),
    });
    const rail = screen.getByRole("listbox", { name: "Tickets" });
    const current = within(rail).getByRole("group", { name: "Current" });
    expect(within(current).getByText("▶ Current")).toBeTruthy();
    expect(within(current).getByRole("option")).toHaveClass("deck-rail-row--current");
    expect(within(rail).getByRole("group", { name: "Open" })).toBeTruthy();
    // Closed sits outside the listbox: a disclosure button, folded by default.
    expect(within(rail).queryByRole("group", { name: "Closed" })).toBeNull();
    const closed = screen.getByRole("group", { name: "Closed" });
    const toggle = within(closed).getByRole("button", { name: /Closed · 2/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(closed).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("lists open note tabs in their own Notes group, after Open", () => {
    const n = {
      id: 1,
      type: "free_text",
      title: "renew cert #todo",
      content: "",
      reference_id: null,
      resolved: 0,
      pinned: 0,
      remind_at: null,
      created_at: "2026-10-10T10:00:00Z",
      updated_at: "2026-10-10T10:00:00Z",
    } as const;
    renderDeck({
      deck: deck({
        open: [
          ticket("CCP-2"),
          ticket("note:1", { key: null, title: "renew cert #todo", noteItem: n }),
        ],
      }),
    });
    const rail = screen.getByRole("listbox", { name: "Tickets" });
    const open = within(rail).getByRole("group", { name: "Open" });
    const notes = within(rail).getByRole("group", { name: "Notes" });
    expect(within(open).getAllByRole("option")).toHaveLength(1);
    expect(within(notes).getAllByRole("option")).toHaveLength(1);
    expect(within(notes).getByText("📝 Notes")).toBeTruthy();
    expect(open.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("ends a merged tab's rail status with its approvers, in their own green span", () => {
    renderDeck({
      deck: deck({
        merged: [ticket("CCP-6", { status: "#6 Merged 2h ago", approvers: ["alice", "bob"] })],
        open: [ticket("CCP-7", { approvers: [] })],
      }),
    });
    const rail = screen.getByRole("listbox", { name: "Tickets" });
    const merged = within(within(rail).getByRole("group", { name: "Merged recently" })).getByRole(
      "option",
    );
    const status = merged.querySelector(".deck-rail-status");
    expect(status?.textContent).toBe("#6 Merged 2h ago · ✓alice ✓bob");
    expect(status?.querySelector(".deck-rail-approvers")?.textContent).toBe("✓alice ✓bob");
    const open = within(within(rail).getByRole("group", { name: "Open" })).getByRole("option");
    expect(open.querySelector(".deck-rail-approvers")).toBeNull();
  });

  it("lists a merged PR's approvers in its meta line, ticked", () => {
    const p = deckPR(5, {}, { merged_at: "2026-10-14T10:00:00Z", approved_by: ["alice", "bob"] });
    renderDeck({ deck: deck({ open: [ticket("CCP-5", { prs: [p] })] }) });
    const row = screen.getByRole("option", { name: /PR 5/ });
    const people = row.querySelector(".pr-participants");
    expect(people?.textContent).toBe("✓alice,✓bob");
    expect(people).toHaveAttribute("title", "alice approved\nbob approved");
  });

  it("links a note card's target in a new tab, and leaves an unlinked note plain", () => {
    const n = {
      id: 2,
      type: "github_pr",
      title: "check flags #todo",
      content: "",
      reference_id: "o/r#12",
      resolved: 0,
      pinned: 0,
      remind_at: null,
      created_at: "2026-10-10T10:00:00Z",
      updated_at: "2026-10-10T10:00:00Z",
    } as const;
    const j = { ...n, id: 3, type: "jira_ticket", reference_id: "CCP-9" } as const;
    const plain = { ...n, id: 4, type: "free_text", reference_id: null } as const;
    const tab = (note: typeof n | typeof j | typeof plain, status: string) =>
      ticket(`note:${note.id}`, { key: null, title: note.title, status, noteItem: note });
    const card = () => screen.getByRole("region", { name: n.title });

    renderDeck({ deck: deck({ open: [tab(n, "r#12")] }) });
    const pr = within(card()).getByRole("link", { name: /r#12/ });
    expect(pr).toHaveAttribute("href", "https://github.com/o/r/pull/12");
    expect(pr).toHaveAttribute("target", "_blank");
    expect(pr).toHaveAttribute("rel", "noopener noreferrer");
    cleanup();

    renderDeck({ deck: deck({ open: [tab(j, "CCP-9")] }) });
    expect(within(card()).getByRole("link", { name: /CCP-9/ })).toHaveAttribute(
      "href",
      "https://example.atlassian.net/browse/CCP-9",
    );
    cleanup();

    renderDeck({ deck: deck({ open: [tab(plain, "Note")] }) });
    expect(within(card()).queryByRole("link")).toBeNull();
    expect(within(card()).getByText(/^Note · #todo/)).toBeTruthy();
  });

  it("keeps retry outside the banner text, with an icon for the collapsed slim rail", () => {
    const onRetry = vi.fn();
    renderDeck({ deck: deck({ open: [ticket("CCP-2")] }), sourceError: "Jira down", onRetry });
    const retry = screen.getByRole("button", { name: "Retry" });
    // The slim rail hides .deck-rail-banner-text; retry must not live inside it.
    expect(retry.closest(".deck-rail-banner-text")).toBeNull();
    expect(retry.querySelector(".deck-rail-banner-retry-icon")).toBeTruthy();
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("lists unfolded Closed rows as buttons that reopen, and describes the rail keys", () => {
    const { onReopen } = renderDeck({
      closedFolded: false,
      deck: deck({ open: [ticket("CCP-2")], closed: [ticket("CCP-3")] }),
    });
    const rail = screen.getByRole("listbox", { name: "Tickets" });
    expect(rail).toHaveAccessibleDescription(/arrows move between tickets/);
    const closed = screen.getByRole("group", { name: "Closed" });
    const toggle = within(closed).getByRole("button", { name: /Closed · 1/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = within(closed).getByRole("list");
    expect(toggle).toHaveAttribute("aria-controls", list.id);
    expect(within(closed).queryAllByRole("option")).toHaveLength(0);
    // A keyboard activation (detail 0) reopens and hands focus to the listbox.
    fireEvent.click(within(list).getByRole("button", { name: /Title CCP-3/ }));
    expect(onReopen).toHaveBeenCalledWith("CCP-3");
    expect(rail).toHaveFocus();
  });

  it("labels a ticketless PR tab repo#number, in the key colour", () => {
    const p = deckPR(77, {}, { repo_full_name: "org/widgets" });
    renderDeck({
      deck: deck({
        open: [
          ticket("https://github.com/org/widgets/pull/77", {
            key: null,
            ticket: null,
            title: "PR 77",
            prs: [p],
          }),
        ],
      }),
    });
    const rail = screen.getByRole("listbox", { name: "Tickets" });
    const label = within(rail).getByText("widgets#77");
    expect(label).toHaveClass("deck-key");
    expect(label).not.toHaveClass("deck-key--none");
  });

  it("shows stripe, review chip, status line and activity dot", () => {
    renderDeck({
      deck: deck({
        open: [
          ticket("CCP-1", {
            stripe: "danger",
            reviewOnly: true,
            unseen: true,
            status: "#5 Conflict with main",
            statusTone: "danger",
          }),
          ticket("OTHER-2"),
        ],
      }),
    });
    const row = screen.getByRole("option", { name: /CCP-1/ });
    // Mixed projects: full keys.
    expect(within(row).getByText("CCP-1")).toBeTruthy();
    expect(row.querySelector(".deck-stripe--danger")).toBeTruthy();
    expect(within(row).getByText("review")).toBeTruthy();
    expect(within(row).getByText("#5 Conflict with main")).toHaveClass("deck-rail-status--danger");
    expect(within(row).getByLabelText("new activity")).toBeTruthy();
    expect(
      within(screen.getByRole("option", { name: /OTHER-2/ })).queryByLabelText("new activity"),
    ).toBeNull();
  });

  it("selects on click", () => {
    const { onSelect } = renderDeck({ deck: deck({ open: [ticket("CCP-1"), ticket("CCP-2")] }) });
    fireEvent.click(screen.getByRole("option", { name: /Title CCP-2/ }));
    expect(onSelect).toHaveBeenCalledWith("CCP-2");
  });
});

describe("DeckMode card", () => {
  it("shows the off-sprint pill, PR rows with author, chips and overflow", () => {
    const t = ticket("CCP-1", {
      ticket: {
        key: "CCP-1",
        summary: "Title CCP-1",
        statusName: "In Review",
        updated: null,
        offSprint: true,
      },
      prs: [
        deckPR(7, { current: true }, { title: "CCP-1: backend worker" }),
        deckPR(
          8,
          {
            mine: false,
            signals: [
              { label: "A", tone: "danger" },
              { label: "B", tone: "warning" },
              { label: "C", tone: "info" },
              { label: "D", tone: "success" },
              { label: "E", tone: "neutral" },
              { label: "F", tone: "neutral" },
            ],
          },
          { user: { login: "tomas", avatar_url: "" }, updated_at: "2026-10-13T12:00:00Z" },
        ),
      ],
    });
    renderDeck({ deck: deck({ open: [t] }) });
    const card = screen.getByRole("region", { name: "CCP-1 Title CCP-1" });
    expect(within(card).getByText("Off-sprint")).toBeTruthy();
    expect(within(card).getByText("In Review")).toBeTruthy();
    expect(within(card).getByText("2 PRs · 1 current · updated 2h")).toBeTruthy();

    const [mine, theirs] = within(card).getAllByRole("option");
    expect(within(mine).getByText("▶ current")).toBeTruthy();
    expect(mine).toHaveClass("deck-pr--current");
    expect(within(mine).getByText("backend worker")).toBeTruthy();
    expect(within(mine).queryByText("tomas")).toBeNull();

    expect(within(theirs).getByText("tomas")).toBeTruthy();
    expect(within(theirs).getByText("1d ago")).toBeTruthy();
    for (const l of ["A", "B", "C", "D"]) expect(within(theirs).getByText(l)).toBeTruthy();
    expect(within(theirs).queryByText("E")).toBeNull();
    expect(within(theirs).getByText("+2")).toHaveAttribute("title", "E, F");
  });

  it("renders a chip with an href as a GitHub link that doesn't open the modal", () => {
    const href = "https://github.com/o/r/pull/7";
    const t = ticket("CCP-1", {
      prs: [deckPR(7, { signals: [{ label: "2 open threads", tone: "warning", href }] })],
    });
    const { onOpen } = renderDeck({ deck: deck({ open: [t] }) });
    const link = screen.getByRole("link", { name: "2 open threads" });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    fireEvent.click(link);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("labels each PR row repo#number with the short repo name", () => {
    const t = ticket("CCP-1", {
      prs: [deckPR(42, {}, { repo_full_name: "optimizely/content-marketing-platform-api" })],
    });
    renderDeck({ deck: deck({ open: [t] }) });
    const row = within(screen.getByRole("listbox", { name: "Pull requests" })).getByRole("option");
    const ref = row.querySelector(".deck-pr-ref")!;
    expect(ref).toHaveTextContent(/^content-marketing-platform-api#42$/);
    expect(ref).toHaveAttribute("title", "content-marketing-platform-api#42");
    expect(within(row).getByText("content-marketing-platform-api")).toHaveClass("deck-pr-repo");
    expect(within(row).getByText("#42")).toHaveClass("deck-pr-number");
  });

  it("selects and opens a PR row on click", () => {
    const t = ticket("CCP-1", { prs: [deckPR(7), deckPR(8)] });
    const { onSelectPr, onOpen } = renderDeck({ deck: deck({ open: [t] }) });
    fireEvent.click(screen.getByText("#8"));
    expect(onSelectPr).toHaveBeenCalledWith("https://github.com/o/r/pull/8");
    expect(onOpen).toHaveBeenCalledWith(t.prs[1].pr);
  });

  it("renders two decorative ghost cards", () => {
    renderDeck({ deck: deck({ open: [ticket("CCP-1")] }) });
    const ghosts = document.querySelectorAll(".deck-ghost");
    expect(ghosts).toHaveLength(2);
    ghosts.forEach((g) => expect(g).toHaveAttribute("aria-hidden", "true"));
  });

  it("shows only the selected card on desktop: the carousel is the phone's", () => {
    const stops = ["CCP-1", "CCP-2", "CCP-3"].map((k) => ticket(k));
    renderDeck({ deck: deck({ open: stops }), stops });
    expect(screen.queryByTestId("deck-track")).toBeNull();
    const titles = [...document.querySelectorAll(".deck-card-title")].map((t) => t.textContent);
    expect(titles).toEqual(["Title CCP-1"]);
  });
});

describe("DeckMode carousel on a phone", () => {
  const five = () => ["CCP-1", "CCP-2", "CCP-3", "CCP-4", "CCP-5"].map((k) => ticket(k));
  const slide = (offset: number) =>
    screen.getByTestId("deck-track").querySelector<HTMLElement>(`[data-offset="${offset}"]`)!;

  it("shows the stops before and after the card, wrapping, as inert pictures", () => {
    const stops = five();
    renderDeck({
      phone: phoneDeck(),
      deck: deck({ open: stops }),
      stops,
    });
    const offsets = [...screen.getByTestId("deck-track").children].map((c) =>
      c.getAttribute("data-offset"),
    );
    expect(offsets).toEqual(["-2", "-1", "0", "1", "2"]);
    expect(slide(-1)).toHaveTextContent("Title CCP-5");
    expect(slide(2)).toHaveTextContent("Title CCP-3");
    for (const o of [-2, -1, 1, 2]) {
      const picture = slide(o).firstElementChild!;
      expect(picture).toHaveAttribute("aria-hidden", "true");
      expect(picture).toHaveAttribute("inert");
    }
    // Only the current card is a card to assistive tech.
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByRole("region")).toHaveAccessibleName(/^CCP-1/);
  });

  it("steps to a neighbour on a tap: Prev / Next beside it, a jump further out", () => {
    const stops = five();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const { onSelect } = renderDeck({
      phone: phoneDeck(),
      deck: deck({ open: stops }),
      stops,
      onPrev,
      onNext,
    });
    fireEvent.click(slide(1));
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.click(slide(-1));
    expect(onPrev).toHaveBeenCalledTimes(1);
    fireEvent.click(slide(-2));
    expect(onSelect).toHaveBeenCalledWith("CCP-4");
  });

  it("has no neighbours without other stops", () => {
    renderDeck({
      phone: phoneDeck(),
      deck: deck({ open: [ticket("CCP-1")] }),
    });
    expect(screen.getByTestId("deck-track").children).toHaveLength(1);
  });

  it("points the current card's PR list at its own rows, not a neighbour's", () => {
    const stops = ["CCP-1", "CCP-2", "CCP-3"].map((k, i) =>
      ticket(k, { prs: [deckPR(10 + i), deckPR(20 + i)] }),
    );
    renderDeck({
      phone: phoneDeck(),
      deck: deck({ open: stops }),
      stops,
      selectedId: "CCP-2",
    });
    const list = screen.getByRole("listbox", { name: "Pull requests" });
    const active = document.getElementById(list.getAttribute("aria-activedescendant")!);
    expect(list).toContainElement(active);
  });

  it("locks sideways swiping while the note composer is open", () => {
    renderDeck({
      phone: phoneDeck(),
      deck: deck({ open: five() }),
      stops: five(),
      composing: true,
      onSaveNote: vi.fn(),
    });
    expect(screen.getByTestId("deck-track")).toHaveClass("deck-track--locked");
  });
});

describe("DeckMode states and motion", () => {
  it("hides the Open group when every open ticket is current", () => {
    renderDeck({ deck: deck({ current: [ticket("CCP-1", { current: true })] }) });
    const rail = screen.getByRole("listbox", { name: "Tickets" });
    expect(within(rail).getByRole("group", { name: "Current" })).toBeTruthy();
    expect(within(rail).queryByRole("group", { name: "Open" })).toBeNull();
    expect(screen.queryByText("Nothing open. Nice.")).toBeNull();
  });

  it("marks the column with the swipe direction and adds the leaving frame", () => {
    renderDeck({ deck: deck({ open: [ticket("CCP-1")] }), swipe: "prev" });
    const column = document.querySelector(".deck-column")!;
    expect(column).toHaveAttribute("data-swipe", "prev");
    expect(column.querySelector(".deck-swipe-out")).toHaveAttribute("aria-hidden", "true");
  });

  it("has no swipe markup without a direction", () => {
    renderDeck({ deck: deck({ open: [ticket("CCP-1")] }) });
    expect(document.querySelector(".deck-column")).not.toHaveAttribute("data-swipe");
    expect(document.querySelector(".deck-swipe-out")).toBeNull();
  });

  it("marks a phone's track with the move's direction, without the desktop's swipe", () => {
    renderDeck({ deck: deck({ open: [ticket("CCP-1")] }), swipe: "prev", phone: phoneDeck() });
    expect(screen.getByTestId("deck-track")).toHaveAttribute("data-swipe", "prev");
    expect(document.querySelector(".deck-swipe-out")).toBeNull();
    expect(document.querySelector(".deck-ghost")).toBeNull();
  });

  it("has no direction on a phone's track without a move", () => {
    renderDeck({ deck: deck({ open: [ticket("CCP-1")] }), phone: phoneDeck() });
    expect(screen.getByTestId("deck-track")).not.toHaveAttribute("data-swipe");
  });
});

describe("DeckMode on a phone", () => {
  const three = () =>
    deck({
      current: [ticket("CCP-1", { current: true })],
      open: [ticket("CCP-2"), ticket("CCP-3")],
    });
  const phone = phoneDeck;
  /** A one-finger drag across `el` by (dx, dy). */
  const drag = (el: Element, dx: number, dy: number) => {
    fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
  };

  it("drops the inline rail and steps through cards with Prev / Next and a position", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    renderDeck({ deck: three(), phone: phone(), onPrev, onNext });
    expect(screen.queryByRole("listbox", { name: "Tickets" })).toBeNull();
    expect(screen.getByText("1 / 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next ticket" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Previous ticket" }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("renders the Prev / Next bar outside the deck, so the page's fade-in can't move it", () => {
    renderDeck({ deck: three(), phone: phone() });
    const bar = screen.getByRole("button", { name: "Next ticket" }).parentElement!;
    expect(screen.getByTestId("deck-mode")).not.toContainElement(bar);
    expect(bar.parentElement).toBe(document.body);
  });

  it("opens the rail in a drawer, where picking a ticket jumps to it and closes the drawer", () => {
    const p = phone({ railOpen: true });
    const { onSelect } = renderDeck({ deck: three(), phone: p });
    const drawer = screen.getByRole("dialog");
    fireEvent.click(within(drawer).getByRole("option", { name: /CCP-3/ }));
    expect(onSelect).toHaveBeenCalledWith("CCP-3");
    expect(p.onRailOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes the drawer after reopening a closed tab from it", () => {
    const p = phone({ railOpen: true });
    const { onReopen } = renderDeck({
      deck: deck({ open: [ticket("CCP-1")], closed: [ticket("CCP-9")] }),
      closedFolded: false,
      phone: p,
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /CCP-9/ }));
    expect(onReopen).toHaveBeenCalledWith("CCP-9");
    expect(p.onRailOpenChange).toHaveBeenCalledWith(false);
  });

  it("pins a deck bar with the Items button and what's on the deck", () => {
    const p = phone();
    renderDeck({ deck: three(), phone: p });
    const bar = screen.getByTestId("deck-phone-bar");
    expect(screen.getByTestId("deck-mode")).toContainElement(bar);
    expect(bar).toHaveTextContent("5 open PRs, 2 review requests");
    const button = within(bar).getByRole("button", { name: "Show items" });
    expect(button).toHaveTextContent("All Items");
    fireEvent.click(button);
    expect(p.onRailOpenChange).toHaveBeenCalledWith(true);
  });

  it("counts in the singular, and leaves the counts out while loading", () => {
    renderDeck({ deck: three(), phone: phone({ counts: { openPRs: 1, reviewRequests: 1 } }) });
    expect(screen.getByTestId("deck-phone-bar")).toHaveTextContent("1 open PR, 1 review request");
    cleanup();
    renderDeck({ deck: three(), phone: phone(), loading: true });
    expect(screen.getByTestId("deck-phone-bar")).not.toHaveTextContent(/open PR/);
  });

  it("hides every count until all sources have landed", () => {
    renderDeck({ deck: three(), phone: phone(), countsReady: false });
    const bar = screen.getByTestId("deck-phone-bar");
    expect(bar).not.toHaveTextContent(/open PR/);
    expect(within(bar).getByRole("button", { name: "Show items" })).toHaveTextContent(
      /^All Items$/,
    );
    cleanup();
    renderDeck({ deck: three(), countsReady: false });
    for (const heading of document.querySelectorAll(".deck-rail-heading")) {
      expect(heading.textContent).not.toMatch(/\d/);
    }
    expect(document.querySelectorAll(".deck-rail-heading").length).toBeGreaterThan(0);
  });

  it("closes the drawer on a left swipe", () => {
    const p = phone({ railOpen: true });
    renderDeck({ deck: three(), phone: p });
    drag(within(screen.getByRole("dialog")).getByRole("listbox", { name: "Tickets" }), -120, 0);
    expect(p.onRailOpenChange).toHaveBeenCalledWith(false);
  });
});
