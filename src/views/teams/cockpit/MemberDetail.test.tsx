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
    expect(within(flagged).getByText("web#12 is failing CI")).toBeInTheDocument();
    expect(
      within(flagged).getByText(/^web#12 has waited \d+ days for a first review$/),
    ).toBeInTheDocument();
  });

  it("labels a ticket added mid-sprint instead of warning about it", () => {
    render(<MemberDetail member={tashfia} issues={issues} prs={[]} />);

    const flagged = card("Sprint health strip");
    expect(within(flagged).getByText("added mid-sprint")).toHaveClass("member-label");
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

  it("puts the title beside the key, the status on the right, and the timing below", () => {
    render(<MemberDetail member={tashfia} issues={issues} prs={[]} />);

    const [key, title, status, details] = Array.from(card("Sprint health strip").children);
    expect(key).toHaveTextContent(/^PLAT-101$/);
    expect(title).toHaveTextContent(/^Sprint health strip$/);
    expect(status).toHaveTextContent(/^In Progress$/);
    // "No update for 4 days" already says it, so no "updated 4d ago".
    expect(details).toHaveTextContent("in progress 9d");
    expect(details).not.toHaveTextContent("updated");
  });

  it("says when an unflagged ticket was updated and when it's due", () => {
    const mine = [doneTicket({ dueDate: "2026-07-10" })];
    render(<MemberDetail member={nadman} issues={mine} prs={[]} />);

    const details = card("Token refresh").querySelector(".member-card__details")!;
    expect(details).toHaveTextContent(/^updated 1d ago\s*due Jul 10$/);
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

    const row = prRow("PLAT-101 health strip");
    expect(card("Sprint health strip")).toContainElement(row);
    const [ref, title, diff, state] = Array.from(row.children);
    expect(ref).toHaveTextContent(/^web#12$/);
    expect(title).toHaveTextContent(/^PLAT-101 health strip$/);
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

    const row = prRow("PLAT-201 rotate refresh tokens");
    expect(row).toHaveTextContent("for PLAT-201");
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
    fireEvent.click(screen.getByText("PLAT-101 health strip"));
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
