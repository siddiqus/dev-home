import { describe, it, expect } from "vitest";
import { effectiveAuthors } from "./teamPrsFilters";

const roster = [
  { github_username: "alice-chen" },
  { github_username: "bob-martinez" },
  { github_username: "carol-wu" },
];

describe("effectiveAuthors", () => {
  it("returns the full roster when no members are selected", () => {
    expect(effectiveAuthors(roster, [])).toEqual(["alice-chen", "bob-martinez", "carol-wu"]);
  });

  it("narrows to the selected members", () => {
    expect(effectiveAuthors(roster, ["bob-martinez"])).toEqual(["bob-martinez"]);
  });

  it("keeps only selected members that are actually on the roster", () => {
    expect(effectiveAuthors(roster, ["bob-martinez", "someone-else"])).toEqual(["bob-martinez"]);
  });

  it("drops blank / missing github usernames from the roster", () => {
    const withBlanks = [
      { github_username: "alice-chen" },
      { github_username: "" },
      { github_username: "  " },
      { github_username: null as unknown as string },
    ];
    expect(effectiveAuthors(withBlanks, [])).toEqual(["alice-chen"]);
  });

  it("dedupes repeated usernames on the roster", () => {
    const dupes = [{ github_username: "alice-chen" }, { github_username: "alice-chen" }];
    expect(effectiveAuthors(dupes, [])).toEqual(["alice-chen"]);
  });

  it("returns an empty list when the roster has no usable usernames", () => {
    expect(effectiveAuthors([{ github_username: "" }], [])).toEqual([]);
  });
});
