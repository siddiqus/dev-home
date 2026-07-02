import type { Insight, InsightSeverity } from "../../../types/teams";

interface Props {
  insights: Insight[];
}

const severityConfig: Record<InsightSeverity, { border: string; badge: string; text: string }> = {
  critical: {
    border: "border-danger",
    badge: "badge bg-danger",
    text: "text-danger",
  },
  warn: {
    border: "border-warning",
    badge: "badge bg-warning",
    text: "text-warning",
  },
  info: {
    border: "border-info",
    badge: "badge bg-info",
    text: "text-info",
  },
};

export function InsightCards({ insights }: Props) {
  if (insights.length === 0) {
    return null;
  }

  return (
    <div className="d-flex gap-2 flex-wrap">
      {insights.map((insight) => {
        const config = severityConfig[insight.severity];
        return (
          <div
            key={insight.key}
            className={`border ${config.border} rounded p-2`}
            style={{
              flex: "1 1 200px",
              borderLeftWidth: "4px",
              fontSize: "0.875rem",
            }}
          >
            <div className="d-flex align-items-start gap-2 mb-1">
              <span className={config.badge} style={{ fontSize: "0.6875rem", padding: "2px 6px" }}>
                {insight.severity.toUpperCase()}
              </span>
              <div className="fw-bold flex-grow-1">{insight.title}</div>
            </div>
            <div className="text-muted" style={{ fontSize: "0.8125rem" }}>
              {insight.detail}
            </div>
          </div>
        );
      })}
    </div>
  );
}
