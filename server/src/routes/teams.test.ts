import { describe, it, expect } from "vitest";
import { mapAgileIssues } from "./teams";

// Shapes below mirror what Jira's Agile API actually returns for the `epic`
// field object (verified against live boards): `name` is the deprecated
// "Epic Name" field and is often empty, while `summary` carries the real title.
describe("mapAgileIssues — epic name resolution", () => {
  const agileIssue = (epic: unknown) => ({
    key: "CCP-1",
    fields: {
      summary: "child ticket",
      status: { name: "To Do", statusCategory: { key: "new" } },
      epic,
    },
  });

  it("falls back to epic.summary when epic.name is empty", () => {
    // CCP-16210 on board 1372: name="", summary="MWR Logic V2"
    const [mapped] = mapAgileIssues([
      agileIssue({ key: "CCP-16210", name: "", summary: "MWR Logic V2" }),
    ]);
    expect(mapped.epicKey).toBe("CCP-16210");
    expect(mapped.epicName).toBe("MWR Logic V2");
  });

  it("uses epic.name when it is populated", () => {
    const [mapped] = mapAgileIssues([
      agileIssue({ key: "OPAL-4339", name: "RAG tech debt", summary: "RAG tech debt" }),
    ]);
    expect(mapped.epicName).toBe("RAG tech debt");
  });

  it("leaves epic fields null when the issue has no epic", () => {
    const [mapped] = mapAgileIssues([agileIssue(undefined)]);
    expect(mapped.epicKey).toBeNull();
    expect(mapped.epicName).toBeNull();
  });
});
