import { IconChartBar } from "@tabler/icons-react";
import type { RecentTeam } from "./recentTeams";

interface Props {
  /** Every known team; recent ids without a team (deleted) are skipped. */
  teams: { id: number; name: string }[];
  recent: RecentTeam[];
  /** The team on the open dashboard, or null when the dashboard isn't showing. */
  activeTeamId: number | null;
  onOpen: (teamId: number) => void;
}

/** Sidebar links straight to the dashboards of recently visited teams. */
export function RecentTeamsNav({ teams, recent, activeTeamId, onOpen }: Props) {
  const names = new Map(teams.map((t) => [t.id, t.name]));
  return (
    <>
      {recent
        .filter((r) => names.has(r.id))
        .map((r) => {
          const name = names.get(r.id)!;
          return (
            <button
              key={r.id}
              type="button"
              className={`sidebar-tab${activeTeamId === r.id ? " active" : ""}`}
              onClick={() => onOpen(r.id)}
              title={`${name} dashboard`}
            >
              <IconChartBar size={18} />
              <span className="sidebar-tab-label">{name}</span>
            </button>
          );
        })}
    </>
  );
}
