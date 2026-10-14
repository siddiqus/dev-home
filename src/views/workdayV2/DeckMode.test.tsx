import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { GitHubPR } from "../../types";
import { DeckMode, type DeckModeProps } from "./DeckMode";
import type { DeckData, DeckPR, DeckTicket } from "./types";

const NOW = new Date("2026-10-14T12:00:00Z");

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
    reviewOnly: false,
    unseen: false,
    current: false,
    jiraMention: null,
    note: null,
    ...o,
  };
}

function deck(o: Partial<DeckData> = {}): DeckData {
  return {
    current: [],
    open: [],
    closed: [],
    unmatched: [],
    counts: { tickets: 0, current: 0, unseen: 0 },
    ...o,
  };
}

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

  it("shows stripe, review chip, status line and activity dot", () => {
    renderDeck({
      deck: deck({
        open: [
          ticket("CCP-1", {
            stripe: "danger",
            reviewOnly: true,
            unseen: true,
            status: "#5 Conflict with main",
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
    expect(within(row).getByText("#5 Conflict with main")).toBeTruthy();
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
    expect(within(mine).getByText("▶")).toBeTruthy();
    expect(mine).toHaveClass("deck-pr--current");
    expect(within(mine).getByText("backend worker")).toBeTruthy();
    expect(within(mine).queryByText("tomas")).toBeNull();

    expect(within(theirs).getByText("tomas")).toBeTruthy();
    expect(within(theirs).getByText("1d")).toBeTruthy();
    for (const l of ["A", "B", "C", "D"]) expect(within(theirs).getByText(l)).toBeTruthy();
    expect(within(theirs).queryByText("E")).toBeNull();
    expect(within(theirs).getByText("+2")).toHaveAttribute("title", "E, F");
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
});
