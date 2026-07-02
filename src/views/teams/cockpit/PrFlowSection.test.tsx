import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PrFlowSection } from "./PrFlowSection";
import dashboardFixture from "../__fixtures__/dashboardFixture";

describe("PrFlowSection", () => {
  it("renders all metric cards with correct values from fixture", () => {
    const { prFlow } = dashboardFixture;
    const { container } = render(<PrFlowSection prFlow={prFlow} />);

    // Check title
    expect(screen.getByText("PR FLOW")).toBeInTheDocument();

    // Check Open PRs
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Open PRs")).toBeInTheDocument();

    // Check Merged
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Merged")).toBeInTheDocument();

    // Check Avg First Review (18.5h)
    expect(screen.getByText("18.5h")).toBeInTheDocument();
    expect(screen.getByText("Avg First Review")).toBeInTheDocument();

    // Check Avg PR Age (2.4d)
    expect(screen.getByText("2.4d")).toBeInTheDocument();
    expect(screen.getByText("Avg PR Age")).toBeInTheDocument();

    // Check Failing Checks (1, should have danger emphasis)
    const allOnes = screen.getAllByText("1");
    const failingChecksValue = allOnes.find((el) =>
      el.parentElement?.textContent?.includes("Failing Checks")
    );
    expect(failingChecksValue).toBeInTheDocument();
    expect(failingChecksValue).toHaveClass("text-danger");
    expect(failingChecksValue).toHaveClass("fw-bold");
    expect(screen.getByText("Failing Checks")).toBeInTheDocument();

    // Check PRs w/o Jira (1, should have warning emphasis)
    const noJiraValue = allOnes.find((el) =>
      el.parentElement?.textContent?.includes("PRs w/o Jira")
    );
    expect(noJiraValue).toBeInTheDocument();
    expect(noJiraValue).toHaveClass("text-warning");
    expect(noJiraValue).toHaveClass("fw-bold");
    expect(screen.getByText("PRs w/o Jira")).toBeInTheDocument();

    // Check Jira w/o PR (1, should have warning emphasis)
    const jiraNoPRValue = allOnes.find((el) =>
      el.parentElement?.textContent?.includes("Jira w/o PR")
    );
    expect(jiraNoPRValue).toBeInTheDocument();
    expect(jiraNoPRValue).toHaveClass("text-warning");
    expect(jiraNoPRValue).toHaveClass("fw-bold");
    expect(screen.getByText("Jira w/o PR")).toBeInTheDocument();
  });

  it("renders em dash when avgFirstReviewH is null", () => {
    const prFlowWithNull = {
      ...dashboardFixture.prFlow,
      avgFirstReviewH: null,
    };
    render(<PrFlowSection prFlow={prFlowWithNull} />);

    expect(screen.getByText("—h")).toBeInTheDocument();
    expect(screen.getByText("Avg First Review")).toBeInTheDocument();
  });

  it("applies no emphasis when problem metrics are zero", () => {
    const prFlowClean = {
      open: 4,
      merged: 2,
      avgFirstReviewH: 18.5,
      avgAgeDays: 2.4,
      failingChecks: 0,
      noJira: 0,
      jiraNoPR: 0,
    };
    const { container } = render(<PrFlowSection prFlow={prFlowClean} />);

    // All zero values should be text-body (no danger or warning)
    const zeroValues = screen.getAllByText("0");
    expect(zeroValues).toHaveLength(3); // failingChecks, noJira, jiraNoPR

    // Check Failing Checks
    const failingChecksValue = zeroValues.find((el) =>
      el.parentElement?.textContent?.includes("Failing Checks")
    );
    expect(failingChecksValue).toHaveClass("text-body");
    expect(failingChecksValue).not.toHaveClass("text-danger");
    expect(failingChecksValue).not.toHaveClass("fw-bold");

    // Check PRs w/o Jira
    const noJiraValue = zeroValues.find((el) =>
      el.parentElement?.textContent?.includes("PRs w/o Jira")
    );
    expect(noJiraValue).toHaveClass("text-body");
    expect(noJiraValue).not.toHaveClass("text-warning");
    expect(noJiraValue).not.toHaveClass("fw-bold");

    // Check Jira w/o PR
    const jiraNoPRValue = zeroValues.find((el) =>
      el.parentElement?.textContent?.includes("Jira w/o PR")
    );
    expect(jiraNoPRValue).toHaveClass("text-body");
    expect(jiraNoPRValue).not.toHaveClass("text-warning");
    expect(jiraNoPRValue).not.toHaveClass("fw-bold");
  });
});
