import { describe, it, expect } from "vitest";
import { issuesToTsv } from "./tsvExport";
import { JiraIssue } from "../types";

const HEADER = ["key", "summary", "status", "assignee", "created", "updated"].join("\t");

function makeIssue(overrides: Record<string, unknown> = {}): JiraIssue {
  return {
    key: "PROJ-1",
    summary: "Fix the login bug",
    status: { name: "In Progress", statusCategory: { colorName: "yellow" } },
    priority: { name: "High", iconUrl: "" },
    assignee: {
      displayName: "Ada Lovelace",
      avatarUrls: { "48x48": "" },
    },
    project: { key: "PROJ", name: "Project" },
    created: "2026-07-01T10:00:00Z",
    updated: "2026-07-02T12:30:00Z",
    ...overrides,
  } as JiraIssue;
}

describe("issuesToTsv", () => {
  it("puts the header row first with the exact column order", () => {
    const tsv = issuesToTsv([makeIssue()]);
    const lines = tsv.split("\n");
    expect(lines[0]).toBe(HEADER);
    expect(lines[0].split("\t")).toEqual([
      "key",
      "summary",
      "status",
      "assignee",
      "created",
      "updated",
    ]);
  });

  it("renders a normal issue with an assignee in the right column order", () => {
    const issue = makeIssue();
    const tsv = issuesToTsv([issue]);
    const row = tsv.split("\n")[1];
    const cells = row.split("\t");
    expect(cells[0]).toBe(issue.key);
    expect(cells[1]).toBe(issue.summary);
    expect(cells[2]).toBe(issue.status.name);
    expect(cells[3]).toBe(issue.assignee!.displayName);
    expect(cells[4]).toBe(new Date(issue.created).toLocaleDateString());
    expect(cells[5]).toBe(new Date(issue.updated).toLocaleDateString());
  });

  it("uses 'Unassigned' when assignee is null", () => {
    const tsv = issuesToTsv([makeIssue({ assignee: null })]);
    const cells = tsv.split("\n")[1].split("\t");
    expect(cells[3]).toBe("Unassigned");
  });

  it("collapses tab/newline/carriage-return runs in a cell to single spaces", () => {
    const tsv = issuesToTsv([makeIssue({ summary: "a\tb\nc\rd\t\n\re" })]);
    const row = tsv.split("\n")[1];
    // Exactly 5 separators for 6 columns; no stray tabs from the cell content.
    expect(row.split("\t")).toHaveLength(6);
    const summaryCell = row.split("\t")[1];
    expect(summaryCell).not.toMatch(/[\t\n\r]/);
    expect(summaryCell).toBe("a b c d e");
  });

  it("renders created/updated as local dates and empties invalid dates", () => {
    const iso = "2026-07-01T10:00:00Z";
    const tsv = issuesToTsv([makeIssue({ created: "", updated: iso })]);
    const cells = tsv.split("\n")[1].split("\t");
    expect(cells[4]).toBe("");
    expect(cells[5]).toBe(new Date(iso).toLocaleDateString());
  });

  it("returns exactly the header row for an empty issues array", () => {
    const tsv = issuesToTsv([]);
    expect(tsv).toBe(HEADER);
    expect(tsv.split("\n")).toHaveLength(1);
  });
});
