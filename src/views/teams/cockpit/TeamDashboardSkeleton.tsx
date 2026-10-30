/** Line widths for a placeholder card, so the bars don't look like a ruler. */
const WIDTHS = ["92%", "78%", "86%", "64%", "88%", "72%", "80%"];

function CardSkeleton({ lines }: { lines: number }) {
  return (
    <div className="border rounded p-3">
      <div className="cockpit-skeleton cockpit-skeleton--title" />
      {WIDTHS.slice(0, lines).map((width, i) => (
        <div key={i} className="cockpit-skeleton cockpit-skeleton--line" style={{ width }} />
      ))}
    </div>
  );
}

/**
 * Pulsing placeholder in the sprint cockpit's layout (sprint strip, epics, then
 * the two columns of cards), shown while a team or sprint loads.
 */
export function TeamDashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading sprint data" data-testid="team-dashboard-skeleton">
      <div className="sprint-strip mb-3" style={{ width: 520 }}>
        <div className="cockpit-skeleton cockpit-skeleton--line mt-0" style={{ width: "100%" }} />
      </div>
      <div className="border rounded p-2 mb-3">
        <div className="d-flex gap-2 flex-wrap">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cockpit-skeleton cockpit-skeleton--epic" />
          ))}
        </div>
      </div>
      <div className="row g-3 mb-3">
        <div className="col-lg-6 d-flex flex-column gap-3">
          <CardSkeleton lines={7} />
          <CardSkeleton lines={5} />
        </div>
        <div className="col-lg-6 d-flex flex-column gap-3">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={6} />
        </div>
      </div>
    </div>
  );
}
