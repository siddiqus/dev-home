import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JiraIssue } from "../types";

const fetchIssueDetail = vi.hoisted(() => vi.fn());
vi.mock("../services/jira", () => ({ fetchIssueDetail }));
vi.mock("../hooks/useIssueDescription", () => ({
  useIssueDescription: () => ({ description: "", loading: false }),
}));

import { JiraDrawerProvider, useOptionalJiraDrawer } from "./JiraDrawerContext";

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

function Opener() {
  const open = useOptionalJiraDrawer();
  return (
    <button type="button" onClick={() => open?.("CCP-1")}>
      open
    </button>
  );
}

function renderProvider() {
  render(
    <JiraDrawerProvider baseUrl="https://example.atlassian.net">
      <Opener />
    </JiraDrawerProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "open" }));
}

const issue = { key: "CCP-1", summary: "Queue worker", project: { name: "CCP" } } as JiraIssue;

describe("JiraDrawerProvider", () => {
  beforeEach(() => fetchIssueDetail.mockReset());

  it("stays open and says why when the issue fails to load, instead of vanishing", async () => {
    fetchIssueDetail.mockRejectedValueOnce(new Error("Request failed with status code 401"));
    renderProvider();
    const drawer = await screen.findByRole("dialog");
    expect(
      await within(drawer).findByText(/Request failed with status code 401/),
    ).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: /Open in Jira/ })).toHaveAttribute(
      "href",
      "https://example.atlassian.net/browse/CCP-1",
    );
  });

  it("says so when Jira has no such issue", async () => {
    fetchIssueDetail.mockResolvedValue(null);
    renderProvider();
    expect(await screen.findByText(/CCP-1 wasn't found in Jira/)).toBeInTheDocument();
  });

  it("retries from the Reload button after a failure", async () => {
    fetchIssueDetail.mockRejectedValueOnce(new Error("Failed to fetch"));
    fetchIssueDetail.mockResolvedValueOnce(issue);
    renderProvider();
    await screen.findByText(/Failed to fetch/);
    fireEvent.click(screen.getByRole("button", { name: /Reload/ }));
    expect(await screen.findByText("CCP-1: Queue worker")).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });
});
