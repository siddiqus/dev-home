import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { JiraIssue } from "../types";

vi.mock("../services/jiraFilters", () => ({
  fetchLocalJqlFilters: vi.fn(async () => []),
  fetchRemoteJiraFilters: vi.fn(async () => []),
  createLocalJqlFilter: vi.fn(),
  deleteLocalJqlFilter: vi.fn(),
  searchJql: vi.fn(),
}));

// The real table mounts the issue drawer, which isn't under test here.
vi.mock("./JiraIssueTable", () => ({ JiraIssueTable: () => null }));

vi.mock("../utils/tsvExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/tsvExport")>()),
  downloadTextFile: vi.fn(),
}));

import { JiraIssueSearch } from "./JiraIssueSearch";
import { searchJql } from "../services/jiraFilters";
import { downloadTextFile } from "../utils/tsvExport";

function makeIssue(key: string, description?: string): JiraIssue {
  return {
    key,
    summary: `Summary ${key}`,
    description,
    status: { name: "To Do", statusCategory: { colorName: "blue-gray" } },
    priority: { name: "Medium", iconUrl: "" },
    assignee: { displayName: "Ada Lovelace", avatarUrls: { "48x48": "" } },
    project: { key: "PROJ", name: "Project" },
    created: "2026-07-01T10:00:00Z",
    updated: "2026-07-02T12:30:00Z",
    codeReviewers: [],
  };
}

describe("JiraIssueSearch export", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(searchJql).mockReset();
    vi.mocked(downloadTextFile).mockReset();
  });

  it("refetches every page with descriptions instead of reusing the on-screen results", async () => {
    // Detail pages carry descriptions; the plain search used for the screen does not.
    vi.mocked(searchJql).mockImplementation(async (_jql, token, opts) => {
      const withDetail = !!opts?.withDetail;
      if (!token) {
        return {
          issues: [makeIssue("PROJ-1", withDetail ? "First body" : undefined)],
          nextPageToken: "page-2",
        };
      }
      return {
        issues: [makeIssue("PROJ-2", withDetail ? "Second body" : undefined)],
        nextPageToken: null,
      };
    });

    render(<JiraIssueSearch />);
    fireEvent.change(screen.getByPlaceholderText(/Enter JQL query/), {
      target: { value: "project = PROJ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    fireEvent.click(await screen.findByRole("button", { name: "Export" }));
    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1));

    expect(searchJql).toHaveBeenCalledTimes(3);
    expect(searchJql).toHaveBeenNthCalledWith(1, "project = PROJ", null);
    expect(searchJql).toHaveBeenNthCalledWith(2, "project = PROJ", null, { withDetail: true });
    expect(searchJql).toHaveBeenNthCalledWith(3, "project = PROJ", "page-2", {
      withDetail: true,
    });

    const tsv = vi.mocked(downloadTextFile).mock.calls[0][1];
    const rows = tsv.split("\n").slice(1);
    expect(rows.map((row) => row.split("\t").slice(0, 3))).toEqual([
      ["PROJ-1", "Summary PROJ-1", "First body"],
      ["PROJ-2", "Summary PROJ-2", "Second body"],
    ]);
  });
});
