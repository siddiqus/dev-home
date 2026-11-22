import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTeams } from "../../services/teams";
import { TeamModal } from "./TeamModal";

beforeEach(() => {
  localStorage.clear();
});

describe("TeamModal", () => {
  it("saves on ⌘↵", async () => {
    const onSaved = vi.fn();
    render(<TeamModal team={null} show onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText("Team name…"), { target: { value: "Platform" } });

    fireEvent.keyDown(document.body, { key: "Enter", metaKey: true });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect((await fetchTeams()).map((t) => t.name)).toEqual(["Platform"]);
  });
});
