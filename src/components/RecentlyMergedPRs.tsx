import React, { useState, useEffect, useCallback } from "react";
import { IconChevronRight, IconChevronDown, IconGitMerge } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { fetchRecentlyMergedPRs } from "../services/github";
import { formatRelativeTime } from "../utils/time";
import { Badge } from "./primitives/Badge";
import { Avatar } from "./primitives/Avatar";
import "./RecentlyMergedPRs.css";

interface RecentlyMergedPRsProps {
  scope: "user" | "org";
  authors?: string[];
  repos?: string[];
}

export const RecentlyMergedPRs: React.FC<RecentlyMergedPRsProps> = ({ scope, authors, repos }) => {
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const authorsKey = JSON.stringify(authors ?? []);
  const reposKey = JSON.stringify(repos ?? []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRecentlyMergedPRs(scope, authors, repos);
      setPrs(data);
    } catch (err) {
      console.error("Failed to fetch recently merged PRs:", err);
    } finally {
      setLoading(false);
    }
  }, [scope, authorsKey, reposKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && prs.length === 0) return null;
  if (!loading && prs.length === 0) return null;

  return (
    <div className="recently-merged">
      <div className="recently-merged__header" onClick={() => setCollapsed((c) => !c)}>
        <span className="recently-merged__chevron">
          {collapsed ? (
            <IconChevronRight size={14} stroke={2} />
          ) : (
            <IconChevronDown size={14} stroke={2} />
          )}
        </span>
        <IconGitMerge size={14} stroke={2} className="recently-merged__icon" />
        <span className="recently-merged__title">Recently merged</span>
        <span className="recently-merged__count">{prs.length}</span>
      </div>

      {!collapsed && (
        <div className="recently-merged__list">
          {prs.map((pr) => (
            <a
              key={pr.id}
              className="recently-merged__item"
              href={pr.html_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Badge variant="purple">Merged</Badge>
              <span className="recently-merged__item-title">{pr.title}</span>
              <Badge variant="neutral" className="fw-bold">
                {pr.repo_full_name}
              </Badge>
              {scope === "org" && (
                <div className="recently-merged__item-author">
                  <Avatar src={pr.user.avatar_url} alt={pr.user.login} size="sm" />
                  <span>{pr.user.login}</span>
                </div>
              )}
              <span className="recently-merged__item-time">
                {formatRelativeTime(pr.merged_at || pr.updated_at)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
