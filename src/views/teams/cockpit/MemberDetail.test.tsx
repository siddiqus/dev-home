import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemberDetail } from "./MemberDetail";
import dashboardFixture from "../__fixtures__/dashboardFixture";

const tashfia = dashboardFixture.workload.find((w) => w.accountId === "u1")!;
const nadman = dashboardFixture.workload.find((w) => w.accountId === "u2")!;

describe("MemberDetail", () => {
  it("shows stat chips, ticket titles and plain-language signals", () => {
    render(<MemberDetail member={tashfia} issues={dashboardFixture.issues} prs={[]} />);

    const head = screen.getByRole("heading", { name: "Tashfia" }).parentElement!;
    expect(head).toHaveTextContent("7 tickets");
    expect(head).toHaveTextContent("4 in flight");
    expect(head).toHaveTextContent("2 stalled");
    expect(head).toHaveTextContent("3 open PRs · 1 waiting on reviewers · 1 merged");

    // Flagged tickets stay in the full list; the header shows only the count.
    expect(screen.queryByRole("region", { name: "At risk tickets" })).not.toBeInTheDocument();
    expect(screen.getByText("All tickets")).toHaveTextContent(/^All tickets\s*1$/);

    // The flagged ticket says why, in its own row: level, status line, each warning sign.
    const inProgress = screen.getByRole("region", { name: "In Progress tickets" });
    expect(within(inProgress).getByText("At risk")).toBeInTheDocument();
    expect(within(inProgress).getByText("updated 4d ago")).toBeInTheDocument();
    expect(within(inProgress).getByText("No update for 4 days")).toBeInTheDocument();
    expect(within(inProgress).getByText("web#12 is failing CI")).toBeInTheDocument();
    expect(
      within(inProgress).getByText(/^web#12 has waited \d+ days for a first review$/),
    ).toBeInTheDocument();
    expect(within(inProgress).getByText("Added after the sprint started")).toBeInTheDocument();
    expect(
      within(inProgress).getByRole("button", { name: "web#12 failing CI" }),
    ).toBeInTheDocument();
  });

  it("puts a flagged ticket's reasons in a callout led by its level", () => {
    // PLAT-101 is at risk, PLAT-301 needs a look, PLAT-201 is fine; all given to one person.
    const issues = dashboardFixture.issues.map((i) => ({ ...i, assigneeAccountId: "u2" }));
    render(<MemberDetail member={nadman} issues={issues} prs={[]} />);

    const callout = (text: string) =>
      screen.getByText(text).closest(".member-ticket")!.querySelector(".member-callout");
    expect(callout("Sprint health strip")).toHaveClass("member-callout--danger");
    expect(callout("Sprint health strip")).toHaveTextContent(/^At risk.*web#12 is failing CI/);
    expect(callout("Unassigned cleanup")).toHaveClass("member-callout--warning");
    expect(callout("Unassigned cleanup")).toHaveTextContent(/^Needs a look.*Nobody is assigned/);
    expect(callout("Token refresh")).toBeNull();
  });

  it("lists every ticket of the member grouped by status", () => {
    render(<MemberDetail member={tashfia} issues={dashboardFixture.issues} prs={[]} />);

    const inProgress = screen.getByRole("region", { name: "In Progress tickets" });
    expect(within(inProgress).getByText("Sprint health strip")).toBeInTheDocument();
    // Other members' tickets stay out.
    expect(screen.queryByText("Token refresh")).not.toBeInTheDocument();
  });

  it("gives an unflagged ticket no level label", () => {
    render(<MemberDetail member={nadman} issues={dashboardFixture.issues} prs={[]} />);

    expect(screen.queryByText("On track")).not.toBeInTheDocument();
    const done = screen.getByRole("region", { name: "Done tickets" });
    expect(within(done).getByText("Token refresh")).toBeInTheDocument();
  });

  it("shows three done tickets and folds the rest behind a button", () => {
    const base = dashboardFixture.issues.find((i) => i.key === "PLAT-201")!;
    const done = [1, 2, 3, 4, 5].map((n) => ({
      ...base,
      key: `PLAT-90${n}`,
      summary: `Done thing ${n}`,
      daysSinceUpdate: n,
    }));
    render(<MemberDetail member={nadman} issues={done} prs={[]} />);

    const group = screen.getByRole("region", { name: "Done tickets" });
    expect(within(group).getAllByText(/^Done thing/)).toHaveLength(3);
    fireEvent.click(within(group).getByRole("button", { name: "Show 2 more" }));
    expect(within(group).getAllByText(/^Done thing/)).toHaveLength(5);
  });

  it("opens the ticket from its key and the PR from its link, and stays in place", () => {
    const onOpenRef = vi.fn();
    render(
      <MemberDetail
        member={tashfia}
        issues={dashboardFixture.issues}
        prs={[]}
        onOpenRef={onOpenRef}
      />,
    );

    // The row itself isn't a link.
    fireEvent.click(screen.getByText("Sprint health strip"));
    expect(onOpenRef).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "PLAT-101" }));
    expect(onOpenRef).toHaveBeenLastCalledWith({ kind: "issue", key: "PLAT-101" });

    fireEvent.click(screen.getByRole("button", { name: "web#12 failing CI" }));
    expect(onOpenRef).toHaveBeenLastCalledWith({ kind: "pr", repo: "acme/web", number: 12 });
    expect(screen.getByRole("heading", { name: "Tashfia" })).toBeInTheDocument();
  });

  it("lists the member's PRs, newest first, with lines changed, dates and who merged", () => {
    render(
      <MemberDetail
        member={tashfia}
        issues={dashboardFixture.issues}
        prs={dashboardFixture.authoredPRs}
      />,
    );

    expect(screen.getByText("All PRs")).toHaveTextContent(/^All PRs\s*2$/);
    const list = screen.getByRole("region", { name: "PRs" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["web#12", "api#40"]);
    // Other members' PRs stay out.
    expect(within(list).queryByText("hotfix: logging")).not.toBeInTheDocument();

    const row = (title: string) => within(list).getByText(title).closest(".member-ticket")!;
    const open = row("PLAT-101 health strip");
    expect(open).toHaveTextContent("open");
    expect(open).toHaveTextContent("+12−3");
    expect(open).toHaveTextContent("opened Jun 30");
    expect(open).not.toHaveTextContent("merged");

    const merged = row("PLAT-201 rotate refresh tokens");
    expect(merged).toHaveTextContent("+120−30");
    expect(merged).toHaveTextContent("opened Jun 24");
    expect(merged).toHaveTextContent("merged Jun 27 by nadman");
  });

  it("calls a PR closed without merging closed", () => {
    const [pr] = dashboardFixture.authoredPRs;
    render(
      <MemberDetail
        member={tashfia}
        issues={[]}
        prs={[{ ...pr!, state: "closed", additions: null, deletions: null }]}
      />,
    );
    const list = screen.getByRole("region", { name: "PRs" });
    expect(within(list).getByText("closed")).toBeInTheDocument();
    expect(list).not.toHaveTextContent("+");
  });

  it("opens a PR from its link", () => {
    const onOpenRef = vi.fn();
    render(
      <MemberDetail
        member={tashfia}
        issues={[]}
        prs={dashboardFixture.authoredPRs}
        onOpenRef={onOpenRef}
      />,
    );
    fireEvent.click(screen.getByText("PLAT-201 rotate refresh tokens"));
    expect(onOpenRef).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "api#40" }));
    expect(onOpenRef).toHaveBeenLastCalledWith({ kind: "pr", repo: "acme/api", number: 40 });
  });

  it("says when the member has no PRs in the sprint", () => {
    render(<MemberDetail member={nadman} issues={[]} prs={[]} />);
    expect(screen.getByText("No PRs in this sprint.")).toBeInTheDocument();
  });
});
