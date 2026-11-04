import { useCallback, useState } from "react";
import { visitRecentTeam, type RecentTeam } from "../views/teams/recentTeams";

const KEY = "dev-home-recent-teams";

function isRecentTeam(v: unknown): v is RecentTeam {
  const t = v as RecentTeam | null;
  return !!t && typeof t.id === "number" && typeof t.at === "number";
}

function read(): RecentTeam[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter(isRecentTeam) : [];
  } catch {
    return [];
  }
}

/**
 * The teams whose dashboards were opened most recently (the sidebar's Teams
 * links), kept in localStorage so they survive a reload. `visit` records a
 * team being shown; see visitRecentTeam for the ordering rules.
 */
export function useRecentTeams() {
  const [recent, setRecent] = useState<RecentTeam[]>(read);

  const visit = useCallback((id: number) => {
    setRecent((list) => {
      const next = visitRecentTeam(list, id, Date.now());
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* quota exceeded */
      }
      return next;
    });
  }, []);

  return { recent, visit };
}
