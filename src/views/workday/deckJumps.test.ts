import { describe, it, expect } from "vitest";
import type { DeckTicket } from "./deckTypes";
import { deckJumps, deckKind } from "./deckJumps";

const ticket = (id: string, o: Partial<DeckTicket> = {}): DeckTicket =>
  ({ id, reviewOnly: false, noteItem: null, ...o }) as DeckTicket;

const review = (id: string) => ticket(id, { reviewOnly: true });
const merged = (key: string) => ticket(`merged:${key}`);
const noteTab = (id: string) =>
  ticket(id, { noteItem: { id } as unknown as DeckTicket["noteItem"] });

describe("deckKind", () => {
  it("sorts a tab under Authored or To Review, and a merged or note tab under none", () => {
    expect(deckKind(ticket("CCP-1"))).toBe("authored");
    expect(deckKind(review("CCP-2"))).toBe("review");
    expect(deckKind(merged("CCP-3"))).toBeNull();
    expect(deckKind(noteTab("note:1"))).toBeNull();
  });
});

describe("deckJumps", () => {
  it("counts each kind and points at its first tab in rail order", () => {
    const jumps = deckJumps([
      review("CCP-2"),
      merged("CCP-9"),
      ticket("CCP-1"),
      review("CCP-4"),
      ticket("CCP-5"),
      merged("CCP-8"),
    ]);
    expect(jumps).toEqual([
      { kind: "authored", label: "Authored", count: 2, firstId: "CCP-1" },
      { kind: "review", label: "To Review", count: 2, firstId: "CCP-2" },
    ]);
  });

  it("leaves out a kind with no tabs", () => {
    expect(deckJumps([ticket("CCP-1"), ticket("CCP-2")])).toEqual([
      { kind: "authored", label: "Authored", count: 2, firstId: "CCP-1" },
    ]);
    expect(deckJumps([])).toEqual([]);
  });

  it("doesn't count merged or note tabs", () => {
    expect(deckJumps([merged("CCP-9"), noteTab("note:1"), review("CCP-2")])).toEqual([
      { kind: "review", label: "To Review", count: 1, firstId: "CCP-2" },
    ]);
  });
});
