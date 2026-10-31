import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PhoneMenu } from "./PhoneMenu";

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

function renderMenu(props: Partial<Parameters<typeof PhoneMenu>[0]> = {}) {
  const onNavigate = vi.fn();
  const onHide = vi.fn();
  render(
    <PhoneMenu
      show
      onHide={onHide}
      activeTab="workday"
      prSearchAvailable
      onNavigate={onNavigate}
      {...props}
    />,
  );
  return { onNavigate, onHide, menu: screen.getByRole("dialog", { name: "Dev Home" }) };
}

describe("PhoneMenu", () => {
  it("lists Workday, PR search and Settings, marking the current page", () => {
    const { menu } = renderMenu({ activeTab: "org-prs" });
    const items = within(menu)
      .getAllByRole("button")
      .filter((b) => b.textContent);
    expect(items.map((b) => b.textContent)).toEqual(["Workday", "PR search", "Settings"]);
    expect(within(menu).getByRole("button", { name: "PR search" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(menu).getByRole("button", { name: "Workday" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("leaves PR search out when it isn't available", () => {
    const { menu } = renderMenu({ prSearchAvailable: false });
    expect(within(menu).queryByRole("button", { name: "PR search" })).toBeNull();
  });

  it("goes to the picked page and closes", () => {
    const { menu, onNavigate, onHide } = renderMenu();
    fireEvent.click(within(menu).getByRole("button", { name: "PR search" }));
    expect(onNavigate).toHaveBeenCalledWith("org-prs");
    expect(onHide).toHaveBeenCalled();
  });
});
