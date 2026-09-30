import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalJqlFilter,
  deleteLocalJqlFilter,
  fetchLocalJqlFilters,
  updateLocalJqlFilter,
} from "./jiraFilters";

describe("local JQL filters", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("CRUD ordered by updated_at desc", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const a = await createLocalJqlFilter("Mine", "assignee = currentUser()");
    vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
    await createLocalJqlFilter("Bugs", "type = Bug");
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    await updateLocalJqlFilter(a.id, { jql: "assignee = currentUser() AND status != Done" });
    const list = await fetchLocalJqlFilters();
    expect(list[0].name).toBe("Mine");
    await deleteLocalJqlFilter(a.id);
    expect((await fetchLocalJqlFilters()).map((f) => f.name)).toEqual(["Bugs"]);
  });

  it("requires name and jql", async () => {
    await expect(createLocalJqlFilter("", "x")).rejects.toThrow();
    await expect(createLocalJqlFilter("x", "")).rejects.toThrow();
  });
});
