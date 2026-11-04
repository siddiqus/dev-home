import { forwardRef } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardFixture } from "./__fixtures__/dashboardFixture";

vi.mock("../../hooks/useTeams", () => ({
  useTeams: () => ({
    teams: [
      { id: 1, name: "Platform", members: [] },
      { id: 2, name: "CMP Core", members: [] },
    ],
    loading: false,
    error: null,
    refresh: () => {},
  }),
}));
vi.mock("../../hooks/useTeamDashboard", () => ({ useTeamDashboard: vi.fn() }));
vi.mock("../../services/jira", () => ({ fetchIssueDetail: vi.fn() }));
vi.mock("../../services/github", () => ({ fetchPR: vi.fn() }));
vi.mock("./TeamPRsTab", () => ({
  TeamPRsTab: forwardRef(function TeamPRsTabStub() {
    return <div>team prs</div>;
  }),
}));

import { useTeamDashboard } from "../../hooks/useTeamDashboard";
import { TeamDashboardView } from "./TeamDashboardView";

// The Jira drawer's Offcanvas checks a responsive breakpoint; jsdom has no matchMedia.
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

const pressed = (name: RegExp) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

beforeEach(() => {
  localStorage.clear();
  vi.mocked(useTeamDashboard).mockReturnValue({
    dashboard: dashboardFixture,
    loading: false,
    error: null,
    refresh: () => {},
  });
  // Left mid-browse: team 1, a past sprint, the People view.
  localStorage.setItem("dev-home-team-id", "1");
  localStorage.setItem("dev-home-team-sprint", "1000");
  localStorage.setItem("dev-home-team-tab", "sprint");
  localStorage.setItem("dev-home-team-sprint-view", "people");
});

describe("TeamDashboardView opening a team", () => {
  it("lands on the clicked team's current sprint, on Overview", () => {
    localStorage.setItem("dev-home-team-tab", "prs");
    const onOpenHandled = vi.fn();
    render(
      <TeamDashboardView configured openRequest={{ teamId: 2 }} onOpenHandled={onOpenHandled} />,
    );
    expect(vi.mocked(useTeamDashboard)).toHaveBeenLastCalledWith(2, null);
    expect(pressed(/^\s*Sprint\s*$/)).toBe("true");
    expect(pressed(/Overview/)).toBe("true");
    expect(onOpenHandled).toHaveBeenCalledTimes(1);
  });

  it("returns to Overview when the team already showing is clicked again", () => {
    const { rerender } = render(<TeamDashboardView configured />);
    expect(pressed(/People/)).toBe("true");

    rerender(<TeamDashboardView configured openRequest={{ teamId: 1 }} />);
    expect(pressed(/Overview/)).toBe("true");
    expect(vi.mocked(useTeamDashboard)).toHaveBeenLastCalledWith(1, null);
  });

  it("leaves the saved team, sprint and view alone when there's no click (a reload)", () => {
    render(<TeamDashboardView configured />);
    expect(vi.mocked(useTeamDashboard)).toHaveBeenLastCalledWith(1, 1000);
    expect(pressed(/People/)).toBe("true");
  });
});

describe("TeamDashboardView reporting the team shown", () => {
  it("reports the saved team on a reload", () => {
    const onTeamShown = vi.fn();
    render(<TeamDashboardView configured onTeamShown={onTeamShown} />);
    expect(onTeamShown).toHaveBeenLastCalledWith(1);
  });

  it("reports only the clicked team, not the one showing before the click", () => {
    const onTeamShown = vi.fn();
    render(<TeamDashboardView configured openRequest={{ teamId: 2 }} onTeamShown={onTeamShown} />);
    expect(onTeamShown).toHaveBeenCalledWith(2);
    expect(onTeamShown).not.toHaveBeenCalledWith(1);
  });
});
