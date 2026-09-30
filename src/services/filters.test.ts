import { beforeEach, describe, expect, it } from "vitest";
import {
  createSavedFilter,
  deleteSavedFilter,
  fetchSavedFilters,
  updateSavedFilter,
} from "./filters";

describe("saved filters (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("creates, lists newest first, updates and deletes", async () => {
    const a = await createSavedFilter("A", { authors: ["x"], repos: [] });
    await createSavedFilter("B", { authors: [], repos: ["r"] });
    expect((await fetchSavedFilters()).map((f) => f.name)).toEqual(["B", "A"]);
    const u = await updateSavedFilter(a.id, { name: "A2" });
    expect(u).toMatchObject({ name: "A2", filter_config: { authors: ["x"], repos: [] } });
    await deleteSavedFilter(a.id);
    expect((await fetchSavedFilters()).map((f) => f.name)).toEqual(["B"]);
  });

  it("validates and reports unknown ids", async () => {
    await expect(createSavedFilter("  ", { authors: [], repos: [] })).rejects.toThrow();
    await expect(updateSavedFilter(42, { name: "x" })).rejects.toThrow("Filter not found");
    await expect(deleteSavedFilter(42)).rejects.toThrow("Filter not found");
  });
});
