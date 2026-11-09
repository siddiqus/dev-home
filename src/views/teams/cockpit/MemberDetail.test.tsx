import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemberDetail } from "./MemberDetail";
import dashboardFixture from "../__fixtures__/dashboardFixture";
import type { DashboardIssue } from "../../../types/teams";

const tashfia = dashboardFixture.workload.find((w) => w.accountId === "u1")!;
const nadman = dashboardFixture.workload.find((w) => w.accountId === "u2")!;
const { issues, authoredPRs } = dashboardFixture;
const plat201 = issues.find((i) => i.key === "PLAT-201")!;

const card = (text: string) => screen.getByText(text).closest<HTMLElement>(".member-card")!;
const prRow = (title: string) => screen.getByText(title).closest<HTMLElement>(".member-pr")!;

/** A plain done ticket of Nadman's, varied by `over`. */
function doneTicket(over: Partial<DashboardIssue>): DashboardIssue {
  return { ...plat201, ...over };
}

describe("MemberDetail", () => {
  it("shows the member's stat chips", () => {
    render(<MemberDetail member={tashfia} issues={issues} prs={[]} />);

    const head = screen.getByRole("heading", { name: "Tashfia" }).parentElement!;
    expect(head).toHaveTextContent("7 tickets");
    expect(head).toHaveTextContent("4 in flight");
    expect(head).toHaveTextContent("2 stalled");
    expect(head).toHaveTextContent("3 open PRs · 1 waiting on reviewers · 1 merged");
  });

  it("puts a flagged ticket on top, whatever its status, and says why without a level label", () => {
    render(<MemberDetail member={tashfia} issues={issues} prs={[]} />);

    const atRisk = screen.getByRole("region", { name: "At risk tickets" });
    expect(within(atRisk).getByText("Sprint health strip")).toBeInTheDocument();
    // Not repeated in its status group.
    expect(screen.queryByRole("region", { name: "In Progress tickets" })).not.toBeInTheDocument();

    const flagged = card("Sprint health strip");
    expect(flagged).not.toHaveTextContent("At risk");
    expect(within(flagged).getByText("No update for 4 days")).toBeInTheDocument();
    // Failing CI isn't a reason: the PR's own line says it.
    expect(flagged.querySelector(".member-why")).not.toHaveTextContent("failing CI");
    expect(
      within(flagged).getByText(/^web#12 has waited \d+ days for a first review$/),
    ).toBeInTheDocument();
  });

  it("says a ticket was added mid-sprint in plain text, not as a warning", () => {
    render(<MemberDetail member={tashfia} issues={issues} prs={[]} />);

    const flagged = card("Sprint health strip");
    const details = flagged.querySelector(".member-card__details")!;
    expect(within(details as HTMLElement).getByText("added mid-sprint").className).toBe("");
    expect(flagged).not.toHaveTextContent("Added after the sprint started");
  });

  it("tints a flagged ticket's reasons by its group", () => {
    // PLAT-101 is at risk, PLAT-301 needs a look, PLAT-201 is fine; all given to one person.
    const mine = issues.map((i) => ({ ...i, assigneeAccountId: "u2" }));
    render(<MemberDetail member={nadman} issues={mine} prs={[]} />);

    const why = (text: string) => card(text).querySelector(".member-why");
    expect(why("Sprint health strip")).toHaveClass("member-why--danger");
    expect(why("Unassigned cleanup")).toHaveClass("member-why--warning");
    expect(why("Unassigned cleanup")).toHaveTextContent("Nobody is assigned");
    expect(why("Token refresh")).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Needs a look tickets" })).getByText(
        "Unassigned cleanup",
      ),
    ).toBeInTheDocument();
  });

  it("puts the type, title and timing beside a flagged ticket's key, its status on the right, and why below", () => {
    render(<MemberDetail member={tashfia} issues={issues} prs={[]} />);

    const [head, status, details] = Array.from(card("Sprint health strip").children);
    // Type, key, title and timing share one cell, so the title follows the key directly.
    const [type, key, title, timing] = Array.from(head!.children);
    expect(type).toHaveAccessibleName("Story");
    expect(key).toHaveTextContent(/^PLAT-101$/);
    expect(title).toHaveTextContent(/^Sprint health strip$/);
    // "No update for 4 days" already says it, so no "updated 4d ago".
    expect(timing).toHaveTextContent(/^in progress 9d$/);
    expect(status).toHaveTextContent(/^In Progress$/);
    expect(details).toHaveTextContent("No update for 4 days");
    expect(details).not.toHaveTextContent(/in progress|updated/);
  });

  it("shows no type icon when Jira gave no type", () => {
    render(<MemberDetail member={nadman} issues={[doneTicket({ issueType: null })]} prs={[]} />);

    expect(
      within(card("Token refresh").querySelector<HTMLElement>(".member-card__head")!).queryByRole(
        "img",
      ),
    ).not.toBeInTheDocument();
  });

  it("says how long a ticket's been in progress and when it was updated right after its title", () => {
    const mine = [
      doneTicket({ status: "In Progress", statusCategory: "indeterminate", daysInProgress: 3 }),
    ];
    render(<MemberDetail member={nadman} issues={mine} prs={[]} />);

    const head = card("Token refresh").querySelector(".member-card__head")!;
    expect(Array.from(head.children).map((c) => c.textContent)).toEqual([
      "PLAT-201",
      "Token refresh",
      "in progress 3dupdated 1d ago",
    ]);
    // Separate items, so CSS can put a dot between them.
    const timing = head.querySelector(".member-card__timing")!;
    expect(Array.from(timing.children).map((i) => i.textContent)).toEqual([
      "in progress 3d",
      "updated 1d ago",
    ]);
  });

  it("keeps when a ticket's due and that it was added mid-sprint on the line below", () => {
    const mine = [
      doneTicket({ dueDate: "2026-07-10", flags: { ...plat201.flags, addedAfterStart: true } }),
    ];
    render(<MemberDetail member={nadman} issues={mine} prs={[]} />);

    expect(card("Token refresh").querySelector(".member-card__timing")).toHaveTextContent(
      /^updated 1d ago$/,
    );
    const details = card("Token refresh").querySelector(".member-card__details")!;
    // Separate items, so CSS can put a dot between them.
    const items = Array.from(details.querySelector(".member-card__meta")!.children);
    expect(items.map((i) => i.textContent)).toEqual([
      "due Jul 10",
      "added mid-sprint",
      "no PRs this sprint",
    ]);
  });

  it("leaves out the details line when there's nothing more to say", () => {
    const withPR = doneTicket({ linkedPRs: issues[0]!.linkedPRs });
    render(<MemberDetail member={nadman} issues={[withPR]} prs={[]} />);
    expect(card("Token refresh").querySelector(".member-card__details")).toBeNull();
  });

  it("says a ticket has no PRs this sprint when none came back, since older ones aren't fetched", () => {
    const mine = [
      doneTicket({}),
      doneTicket({ key: "PLAT-2", summary: "Has a PR", linkedPRs: issues[0]!.linkedPRs }),
    ];
    render(<MemberDetail member={nadman} issues={mine} prs={[]} />);

    expect(card("Token refresh").querySelector(".member-card__meta")).toHaveTextContent(
      /^no PRs this sprint$/,
    );
    expect(card("Has a PR")).not.toHaveTextContent("no PRs this sprint");
  });

  it("doesn't say no PRs this sprint when the reason it's flagged already says so", () => {
    const mine = [
      doneTicket({
        status: "In Progress",
        statusCategory: "indeterminate",
        flags: { ...plat201.flags, stale: true, inProgressNoPR: true },
        risk: { score: 4, level: "attention", reasons: ["stale", "inProgressNoPR"] },
      }),
    ];
    render(<MemberDetail member={nadman} issues={mine} prs={[]} />);

    expect(card("Token refresh")).toHaveTextContent("In progress, but no PR is linked yet");
    expect(card("Token refresh")).not.toHaveTextContent("no PRs this sprint");
  });

  it("groups plain tickets by their Jira status and leaves the status off their cards", () => {
    const mine = [
      doneTicket({
        key: "PLAT-1",
        summary: "Reviewing",
        status: "Code Review",
        statusCategory: "indeterminate",
      }),
      doneTicket({
        key: "PLAT-2",
        summary: "Stuck",
        status: "Blocked",
        statusCategory: "indeterminate",
      }),
      doneTicket({
        key: "PLAT-3",
        summary: "Building",
        status: "In Progress",
        statusCategory: "indeterminate",
      }),
    ];
    render(<MemberDetail member={nadman} issues={mine} prs={[]} />);

    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(regions).toEqual(["Code Review tickets", "Blocked tickets", "In Progress tickets"]);
    expect(
      within(screen.getByRole("region", { name: "Blocked tickets" })).getByText("Stuck"),
    ).toBeInTheDocument();
    expect(document.querySelector(".member-card__status")).toBeNull();
  });

  it("shows time in progress only when it's known", () => {
    render(<MemberDetail member={nadman} issues={issues} prs={[]} />);
    expect(screen.getByText("updated 1d ago")).toBeInTheDocument();
    expect(screen.queryByText(/in progress \d/)).not.toBeInTheDocument();
  });

  it("says under a day for a ticket started today", () => {
    const started = issues.map((i) => (i.key === "PLAT-101" ? { ...i, daysInProgress: 0 } : i));
    render(<MemberDetail member={tashfia} issues={started} prs={[]} />);
    expect(screen.getByText("in progress <1d")).toBeInTheDocument();
  });

  it("hangs a ticket's PRs under it: link, title, lines changed, then state and date", () => {
    render(<MemberDetail member={tashfia} issues={issues} prs={authoredPRs} />);

    // The PR title's leading "PLAT-101" would repeat the ticket it sits under.
    const row = prRow("health strip");
    expect(card("Sprint health strip")).toContainElement(row);
    const [ref, title, diff, state] = Array.from(row.children);
    expect(ref).toHaveTextContent(/^web#12$/);
    expect(title).toHaveTextContent(/^health strip$/);
    expect(title).toHaveAttribute("title", "PLAT-101 health strip");
    // The ticket's copy lacks lines changed (older cache); the member's own copy fills it.
    expect(diff).toHaveTextContent(/^\+12−3$/);
    expect(state).toHaveTextContent(/^failing CI\s*· opened \w{3} \d+$/);
  });

  it("names the author of a teammate's PR on the ticket", () => {
    const withTeammatePR = issues.map((i) =>
      i.key === "PLAT-101"
        ? { ...i, linkedPRs: [{ ...i.linkedPRs[0]!, author: "mchen", title: "Helper PR" }] }
        : i,
    );
    render(<MemberDetail member={tashfia} issues={withTeammatePR} prs={[]} />);
    expect(prRow("Helper PR")).toHaveTextContent("Helper PR by mchen");
  });

  it("lists the member's other PRs, saying when each merged and who merged it", () => {
    render(<MemberDetail member={tashfia} issues={issues} prs={authoredPRs} />);

    const other = screen.getByRole("region", { name: "Other PRs" });
    // web#12 sits under its ticket; nadman's hotfix isn't Tashfia's.
    expect(
      within(other)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["api#40"]);
    const [, , diff, state] = Array.from(prRow("PLAT-201 rotate refresh tokens").children);
    expect(diff).toHaveTextContent(/^\+120−30$/);
    expect(state).toHaveTextContent(/^merged\s*Jun 27 by nadman$/);
  });

  it("names a teammate's ticket that one of the member's PRs is linked to", () => {
    const onOpenRef = vi.fn();
    const linked = issues.map((i) =>
      i.key === "PLAT-201"
        ? {
            ...i,
            linkedPRs: [{ ...issues[0]!.linkedPRs[0]!, repo_full_name: "acme/api", number: 40 }],
          }
        : i,
    );
    render(
      <MemberDetail member={tashfia} issues={linked} prs={authoredPRs} onOpenRef={onOpenRef} />,
    );

    // "for PLAT-201" names the ticket, so the title drops its leading key.
    const row = prRow("rotate refresh tokens");
    expect(row).toHaveTextContent(/^api#40rotate refresh tokens for PLAT-201/);
    fireEvent.click(within(row).getByRole("button", { name: "PLAT-201" }));
    expect(onOpenRef).toHaveBeenLastCalledWith({ kind: "issue", key: "PLAT-201" });
  });

  it("shows every done ticket, with nothing folded away", () => {
    const done = [1, 2, 3, 4, 5].map((n) =>
      doneTicket({ key: `PLAT-90${n}`, summary: `Done thing ${n}`, daysSinceUpdate: n }),
    );
    render(<MemberDetail member={nadman} issues={done} prs={[]} />);

    const group = screen.getByRole("region", { name: "Done tickets" });
    expect(within(group).getAllByText(/^Done thing/)).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /more/i })).not.toBeInTheDocument();
  });

  it("opens the ticket from its key and the PR from its link, and nothing else", () => {
    const onOpenRef = vi.fn();
    render(<MemberDetail member={tashfia} issues={issues} prs={[]} onOpenRef={onOpenRef} />);

    fireEvent.click(screen.getByText("Sprint health strip"));
    fireEvent.click(screen.getByText("health strip"));
    expect(onOpenRef).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "PLAT-101" }));
    expect(onOpenRef).toHaveBeenLastCalledWith({ kind: "issue", key: "PLAT-101" });
    fireEvent.click(screen.getByRole("button", { name: "web#12" }));
    expect(onOpenRef).toHaveBeenLastCalledWith({ kind: "pr", repo: "acme/web", number: 12 });
  });

  it("says when the member has nothing in the sprint", () => {
    render(<MemberDetail member={nadman} issues={[]} prs={[]} />);
    expect(screen.getByText("No tickets or PRs in this sprint.")).toBeInTheDocument();
  });
});
