import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentTeamsNav } from "./RecentTeamsNav";

const teams = [
  { id: 1, name: "Platform" },
  { id: 2, name: "CMP Core" },
  { id: 3, name: "Growth" },
];

describe("RecentTeamsNav", () => {
  it("lists recent teams by name in their saved order", () => {
    render(
      <RecentTeamsNav
        teams={teams}
        recent={[
          { id: 3, at: 1 },
          { id: 1, at: 2 },
        ]}
        activeTeamId={null}
        onOpen={() => {}}
      />,
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Growth", "Platform"]);
  });

  it("leaves out teams that no longer exist", () => {
    render(
      <RecentTeamsNav
        teams={teams}
        recent={[
          { id: 99, at: 1 },
          { id: 2, at: 2 },
        ]}
        activeTeamId={null}
        onOpen={() => {}}
      />,
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["CMP Core"]);
  });

  it("marks the team being shown as active", () => {
    render(
      <RecentTeamsNav
        teams={teams}
        recent={[
          { id: 1, at: 1 },
          { id: 2, at: 2 },
        ]}
        activeTeamId={2}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "CMP Core" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Platform" })).not.toHaveClass("active");
  });

  it("opens the clicked team", () => {
    const onOpen = vi.fn();
    render(
      <RecentTeamsNav
        teams={teams}
        recent={[{ id: 1, at: 1 }]}
        activeTeamId={null}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Platform" }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });
});
