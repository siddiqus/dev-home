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

    // The flagged ticket's card: key, title, and each warning sign in words.
    const atRisk = screen.getByRole("region", { name: "At risk tickets" });
    expect(within(atRisk).getByText("PLAT-101")).toBeInTheDocument();
    expect(within(atRisk).getByText("Sprint health strip")).toBeInTheDocument();
    // Staleness shows as the card's last update, not as a signal line.
    expect(within(atRisk).getByText("updated 4d ago")).toBeInTheDocument();
    expect(within(atRisk).queryByText(/^No update for/)).not.toBeInTheDocument();
    expect(within(atRisk).getByText("PR #12 is failing CI")).toBeInTheDocument();
    expect(
      within(atRisk).getByText(/^PR #12 has waited \d+ days for a first review$/),
    ).toBeInTheDocument();
    expect(within(atRisk).getByText("Added after the sprint started")).toBeInTheDocument();
  });

  it("lists every ticket of the member grouped by status", () => {
    render(<MemberDetail member={tashfia} issues={dashboardFixture.issues} />);

    const inProgress = screen.getByRole("region", { name: "In Progress tickets" });
    expect(within(inProgress).getByText("Sprint health strip")).toBeInTheDocument();
    // Other members' tickets stay out.
    expect(screen.queryByText("Token refresh")).not.toBeInTheDocument();
  });

  it("says a member is on track when no ticket is flagged", () => {
    render(<MemberDetail member={nadman} issues={dashboardFixture.issues} />);

    // No level label beside the name.
    expect(screen.queryByText("On track")).not.toBeInTheDocument();
    expect(screen.getByText(/nothing needs a look/)).toBeInTheDocument();
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

  it("opens a ticket and stays in place", () => {
    const onOpenRef = vi.fn();
    render(
      <MemberDetail member={tashfia} issues={dashboardFixture.issues} onOpenRef={onOpenRef} />,
    );

    const atRisk = screen.getByRole("region", { name: "At risk tickets" });
    fireEvent.click(within(atRisk).getByText("Sprint health strip"));

    expect(onOpenRef).toHaveBeenCalledWith({ kind: "issue", key: "PLAT-101" });
    expect(screen.getByRole("heading", { name: "Tashfia" })).toBeInTheDocument();
  });
});
