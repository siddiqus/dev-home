import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTeam } from "../../services/teams";
import { TeamsView } from "./TeamsView";

beforeEach(() => {
  localStorage.clear();
});

describe("TeamsView", () => {
  it("tells the app when a team is deleted, so the sidebar can drop it", async () => {
    await createTeam({ name: "Platform" });
    const onTeamsChange = vi.fn();
    render(<TeamsView configured onTeamsChange={onTeamsChange} />);
    await screen.findByText("Platform");
    const callsBefore = onTeamsChange.mock.calls.length;

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));

    await waitFor(() => expect(screen.queryByText("Platform")).not.toBeInTheDocument());
    expect(onTeamsChange.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
