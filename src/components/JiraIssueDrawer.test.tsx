import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../hooks/useIssueDescription", () => ({
  useIssueDescription: () => ({ description: null, loading: false }),
}));

import { JiraIssueDrawer } from "./JiraIssueDrawer";

// Offcanvas checks a responsive breakpoint; jsdom has no matchMedia.
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

describe("JiraIssueDrawer", () => {
  it("closes when the backdrop outside the drawer is clicked", async () => {
    const onHide = vi.fn();
    render(<JiraIssueDrawer issue={null} show={false} loadingKey="CCP-1" onHide={onHide} />);
    await screen.findByText("CCP-1");
    const backdrop = document.querySelector(".offcanvas-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("takes the full screen width on a phone, and its side-panel width elsewhere", async () => {
    const desktop = window.matchMedia;
    render(<JiraIssueDrawer issue={null} show={false} loadingKey="CCP-1" onHide={() => {}} />);
    await screen.findByText("CCP-1");
    expect(document.querySelector(".offcanvas")).not.toHaveClass("jira-issue-drawer--phone");
    cleanup();

    window.matchMedia = ((query: string) => ({
      ...desktop(query),
      matches: true,
    })) as typeof window.matchMedia;
    try {
      render(<JiraIssueDrawer issue={null} show={false} loadingKey="CCP-1" onHide={() => {}} />);
      await screen.findByText("CCP-1");
      expect(document.querySelector(".offcanvas")).toHaveClass("jira-issue-drawer--phone");
    } finally {
      window.matchMedia = desktop;
    }
  });

  it("stays open on clicks inside the drawer", async () => {
    const onHide = vi.fn();
    render(<JiraIssueDrawer issue={null} show={false} loadingKey="CCP-1" onHide={onHide} />);
    fireEvent.click(await screen.findByText("CCP-1"));
    expect(onHide).not.toHaveBeenCalled();
  });
});
