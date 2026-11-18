import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PRTable } from "./PRTable";

describe("PRTable", () => {
  it("says the variant's empty words, or the ones it's given", () => {
    const { rerender } = render(<PRTable prs={[]} loading={false} variant="org-prs" />);
    expect(screen.getByText("No org pull requests")).toBeInTheDocument();

    rerender(
      <PRTable
        prs={[]}
        loading={false}
        variant="org-prs"
        empty={{ title: 'No open PRs match "tokn"', description: "Try Merged, or clear the box." }}
      />,
    );
    expect(screen.getByText('No open PRs match "tokn"')).toBeInTheDocument();
    expect(screen.getByText("Try Merged, or clear the box.")).toBeInTheDocument();
    expect(screen.queryByText("No org pull requests")).toBeNull();
  });
});
