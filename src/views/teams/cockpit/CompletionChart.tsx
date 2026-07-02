import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from "recharts";
import type { Burnup } from "../../../types/teams";

interface Props {
  burnup: Burnup;
}

export function CompletionChart({ burnup }: Props) {
  const { trackingSince, points } = burnup;

  // Empty state
  if (!trackingSince || points.length === 0) {
    return (
      <div>
        <div className="fw-semibold mb-1">Completion over time</div>
        <div className="text-muted small">Burn-up starts tracking from the next sync.</div>
      </div>
    );
  }

  // Scope reference (last totalCount)
  const scope = points.length > 0 ? points[points.length - 1].totalCount : 0;

  return (
    <div>
      <div className="fw-semibold mb-1">Completion over time</div>
      <div className="text-muted small mb-2">tracking since {trackingSince}</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(val) => {
              // Show MM/DD format
              const d = new Date(val);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              fontSize: "0.8125rem",
              border: "1px solid rgba(125,125,125,0.3)",
              borderRadius: 4,
            }}
            labelFormatter={(val) => `Date: ${val}`}
          />
          <Legend
            wrapperStyle={{ fontSize: "0.75rem" }}
            iconType="line"
          />
          {/* Scope reference line */}
          {scope > 0 && (
            <ReferenceLine
              y={scope}
              stroke="rgba(125,125,125,0.3)"
              strokeDasharray="3 3"
              label={{
                value: `Scope (${scope})`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "rgba(125,125,125,0.6)",
              }}
            />
          )}
          {/* Ideal line (dashed, muted) */}
          <Line
            type="monotone"
            dataKey="ideal"
            stroke="rgba(125,125,125,0.5)"
            strokeDasharray="5 5"
            strokeWidth={1.5}
            dot={false}
            name="Ideal"
          />
          {/* Actual line (solid, prominent) */}
          <Line
            type="monotone"
            dataKey="doneCount"
            stroke="#50c878"
            strokeWidth={2}
            dot={{ fill: "#50c878", r: 3 }}
            name="Done"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
