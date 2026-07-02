import type { PrFlow } from "../../../types/teams";

interface Props {
  prFlow: PrFlow;
}

interface MetricCardProps {
  value: string | number;
  label: string;
  emphasis?: "danger" | "warning" | null;
}

function MetricCard({ value, label, emphasis }: MetricCardProps) {
  const valueClass = emphasis === "danger"
    ? "text-danger fw-bold"
    : emphasis === "warning"
    ? "text-warning fw-bold"
    : "text-body";

  return (
    <div className="border rounded p-2 text-center" style={{ flex: "1 1 0", minWidth: 0 }}>
      <div className={`fs-4 ${valueClass}`}>{value}</div>
      <div className="small text-muted">{label}</div>
    </div>
  );
}

export function PrFlowSection({ prFlow }: Props) {
  const avgFirstReview = prFlow.avgFirstReviewH !== null
    ? prFlow.avgFirstReviewH.toFixed(1)
    : "—";

  const failingEmphasis = prFlow.failingChecks > 0 ? "danger" : null;
  const noJiraEmphasis = prFlow.noJira > 0 ? "warning" : null;
  const jiraNoPREmphasis = prFlow.jiraNoPR > 0 ? "warning" : null;

  return (
    <div>
      <div className="small text-muted mb-2">PR FLOW</div>
      <div className="d-flex gap-2">
        <MetricCard value={prFlow.open} label="Open PRs" />
        <MetricCard value={prFlow.merged} label="Merged" />
        <MetricCard value={`${avgFirstReview}h`} label="Avg First Review" />
        <MetricCard value={`${prFlow.avgAgeDays.toFixed(1)}d`} label="Avg PR Age" />
        <MetricCard
          value={prFlow.failingChecks}
          label="Failing Checks"
          emphasis={failingEmphasis}
        />
        <MetricCard
          value={prFlow.noJira}
          label="PRs w/o Jira"
          emphasis={noJiraEmphasis}
        />
        <MetricCard
          value={prFlow.jiraNoPR}
          label="Jira w/o PR"
          emphasis={jiraNoPREmphasis}
        />
      </div>
    </div>
  );
}
