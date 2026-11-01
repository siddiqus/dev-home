import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemberDetail } from "./MemberDetail";
import dashboardFixture from "../__fixtures__/dashboardFixture";

const tashfia = dashboardFixture.workload.find((w) => w.accountId === "u1")!;
const nadman = dashboardFixture.workload.find((w) => w.accountId === "u2")!;

describe("MemberDetail", () => {
  it("shows stat chips, ticket titles and plain-language signals", () => {
    render(<MemberDetail member={tashfia} issues={dashboardFixture.issues} />);

    const head = screen.getByRole("heading", { name: "Tashfia" }).parentElement!;
    expect(head).toHaveTextContent("7 tickets");
    expect(head).toHaveTextContent("4 in flight");
    expect(head).toHaveTextContent("2 stalled");
    expect(head).toHaveTextContent("3 open PRs · 1 waiting on reviewers · 1 merged");

    // Flagged tickets stay in the full list; the header counts them.
    expect(screen.queryByRole("region", { name: "At risk tickets" })).not.toBeInTheDocument();
    expect(screen.getByText("1 at risk")).toBeInTheDocument();

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
    render(<MemberDetail member={nadman} issues={issues} />);

    const callout = (text: string) =>
      screen.getByText(text).closest(".member-ticket")!.querySelector(".member-callout");
    expect(callout("Sprint health strip")).toHaveClass("member-callout--danger");
    expect(callout("Sprint health strip")).toHaveTextContent(/^At risk.*web#12 is failing CI/);
    expect(callout("Unassigned cleanup")).toHaveClass("member-callout--warning");
    expect(callout("Unassigned cleanup")).toHaveTextContent(/^Needs a look.*Nobody is assigned/);
    expect(callout("Token refresh")).toBeNull();
  });

  it("lists every ticket of the member grouped by status", () => {
    render(<MemberDetail member={tashfia} issues={dashboardFixture.issues} />);

    const inProgress = screen.getByRole("region", { name: "In Progress tickets" });
    expect(within(inProgress).getByText("Sprint health strip")).toBeInTheDocument();
    // Other members' tickets stay out.
    expect(screen.queryByText("Token refresh")).not.toBeInTheDocument();
  });

  it("says all clear when no ticket is flagged", () => {
    render(<MemberDetail member={nadman} issues={dashboardFixture.issues} />);

    // No level label beside the name.
    expect(screen.queryByText("On track")).not.toBeInTheDocument();
    expect(screen.getByText("All clear")).toBeInTheDocument();
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
    render(<MemberDetail member={nadman} issues={done} />);

    const group = screen.getByRole("region", { name: "Done tickets" });
    expect(within(group).getAllByText(/^Done thing/)).toHaveLength(3);
    fireEvent.click(within(group).getByRole("button", { name: "Show 2 more" }));
    expect(within(group).getAllByText(/^Done thing/)).toHaveLength(5);
  });

  it("opens the ticket from its key and the PR from its link, and stays in place", () => {
    const onOpenRef = vi.fn();
    render(
      <MemberDetail member={tashfia} issues={dashboardFixture.issues} onOpenRef={onOpenRef} />,
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
});
