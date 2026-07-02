import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EpicCards } from "./EpicCards";
import dashboardFixture from "../__fixtures__/dashboardFixture";

describe("EpicCards", () => {
  it("renders empty state when no epics", () => {
    render(<EpicCards epics={[]} />);
    expect(screen.getByText("No epics")).toBeInTheDocument();
  });

  it("renders header with epic count", () => {
    render(<EpicCards epics={dashboardFixture.epics} />);
    expect(screen.getByText(/Epics · 3/i)).toBeInTheDocument();
  });

  it("renders all epic names", () => {
    render(<EpicCards epics={dashboardFixture.epics} />);
    expect(screen.getByText("Cockpit")).toBeInTheDocument();
    expect(screen.getByText("Auth revamp")).toBeInTheDocument();
    expect(screen.getByText("No epic")).toBeInTheDocument();
  });

  it("renders done/total progress labels", () => {
    render(<EpicCards epics={dashboardFixture.epics} />);
    // Cockpit: 3/8 done
    expect(screen.getByText("3/8 done")).toBeInTheDocument();
    // Auth revamp: 4/5 done
    expect(screen.getByText("4/5 done")).toBeInTheDocument();
    // No epic: 0/3 done
    expect(screen.getByText("0/3 done")).toBeInTheDocument();
  });

  it("renders stalled chip on Cockpit epic", () => {
    render(<EpicCards epics={dashboardFixture.epics} />);
    expect(screen.getByText("2 stalled")).toBeInTheDocument();
  });

  it("does not render stalled chip on Auth revamp (0 stalled)", () => {
    render(<EpicCards epics={dashboardFixture.epics} />);
    const stalledChips = screen.queryAllByText(/stalled/i);
    // Only 2 stalled (Cockpit) and 1 stalled (No epic) should appear
    expect(stalledChips).toHaveLength(2);
  });

  it("renders No epic bucket with distinct styling", () => {
    render(<EpicCards epics={dashboardFixture.epics} />);
    // The "No epic" card has a specific title attribute
    const noEpicCard = screen.getByTitle("Synthetic bucket for tickets without an epic");
    expect(noEpicCard).toHaveClass("border-dashed");
  });

  it("calls onOpenRef with {kind:'issue', key} when clicking real epic", () => {
    const onOpenRef = vi.fn();
    render(<EpicCards epics={dashboardFixture.epics} onOpenRef={onOpenRef} />);

    const cockpitCard = screen.getByText("Cockpit");
    fireEvent.click(cockpitCard);

    expect(onOpenRef).toHaveBeenCalledWith({ kind: "issue", key: "PLAT-100" });
  });

  it("does not call onOpenRef when clicking No epic bucket", () => {
    const onOpenRef = vi.fn();
    render(<EpicCards epics={dashboardFixture.epics} onOpenRef={onOpenRef} />);

    const noEpicCard = screen.getByText("No epic");
    fireEvent.click(noEpicCard);

    expect(onOpenRef).not.toHaveBeenCalled();
  });
});
