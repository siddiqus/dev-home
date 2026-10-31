import { describe, it, expect } from "vitest";
import { issuesToTsv } from "./tsvExport";
import { JiraIssue } from "../types";

const HEADER = [
  "key",
  "summary",
  "description",
  "status",
  "assignee",
  "reporter",
  "created",
  "updated",
].join("\t");

function makeIssue(overrides: Record<string, unknown> = {}): JiraIssue {
  return {
    key: "PROJ-1",
    summary: "Fix the login bug",
    description: "Users can't log in after the session expires.",
    status: { name: "In Progress", statusCategory: { colorName: "yellow" } },
    priority: { name: "High", iconUrl: "" },
    assignee: {
      displayName: "Ada Lovelace",
      avatarUrls: { "48x48": "" },
    },
    reporter: {
      displayName: "Grace Hopper",
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
      "description",
      "status",
      "assignee",
      "reporter",
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
    expect(cells[2]).toBe(issue.description);
    expect(cells[3]).toBe(issue.status.name);
    expect(cells[4]).toBe(issue.assignee!.displayName);
    expect(cells[5]).toBe(issue.reporter!.displayName);
    expect(cells[6]).toBe(new Date(issue.created).toLocaleDateString());
    expect(cells[7]).toBe(new Date(issue.updated).toLocaleDateString());
  });

  it("uses 'Unassigned' when assignee is null", () => {
    const tsv = issuesToTsv([makeIssue({ assignee: null })]);
    const cells = tsv.split("\n")[1].split("\t");
    expect(cells[4]).toBe("Unassigned");
  });

  it("leaves the reporter cell empty when reporter is null", () => {
    const tsv = issuesToTsv([makeIssue({ reporter: null })]);
    const cells = tsv.split("\n")[1].split("\t");
    expect(cells[5]).toBe("");
  });

  it("leaves the description cell empty when description is missing", () => {
    const tsv = issuesToTsv([makeIssue({ description: undefined })]);
    const cells = tsv.split("\n")[1].split("\t");
    expect(cells).toHaveLength(8);
    expect(cells[2]).toBe("");
  });

  it("truncates the description to 2000 characters", () => {
    const tsv = issuesToTsv([makeIssue({ description: "x".repeat(2500) })]);
    const cells = tsv.split("\n")[1].split("\t");
    expect(cells[2]).toBe("x".repeat(2000));
  });

  it("collapses tab/newline/carriage-return runs in a cell to single spaces", () => {
    const tsv = issuesToTsv([makeIssue({ summary: "a\tb\nc\rd\t\n\re" })]);
    const row = tsv.split("\n")[1];
    // Exactly 7 separators for 8 columns; no stray tabs from the cell content.
    expect(row.split("\t")).toHaveLength(8);
    const summaryCell = row.split("\t")[1];
    expect(summaryCell).not.toMatch(/[\t\n\r]/);
    expect(summaryCell).toBe("a b c d e");
  });

  it("keeps a multi-line markdown description on one row", () => {
    const description = "## Steps\n\n1. Log in\n2. Wait\r\n\n| a\t| b |";
    const tsv = issuesToTsv([makeIssue({ description })]);
    const lines = tsv.split("\n");
    expect(lines).toHaveLength(2);
    const cells = lines[1].split("\t");
    expect(cells).toHaveLength(8);
    expect(cells[2]).toBe("## Steps 1. Log in 2. Wait | a | b |");
  });

  it("renders created/updated as local dates and empties invalid dates", () => {
    const iso = "2026-07-01T10:00:00Z";
    const tsv = issuesToTsv([makeIssue({ created: "", updated: iso })]);
    const cells = tsv.split("\n")[1].split("\t");
    expect(cells[6]).toBe("");
    expect(cells[7]).toBe(new Date(iso).toLocaleDateString());
  });

  it("returns exactly the header row for an empty issues array", () => {
    const tsv = issuesToTsv([]);
    expect(tsv).toBe(HEADER);
    expect(tsv.split("\n")).toHaveLength(1);
  });
});
