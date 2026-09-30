import React, { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { IconChevronRight, IconChevronDown, IconMessageCircle, IconEye } from "@tabler/icons-react";
import { GitHubPR, JiraIssue } from "../../types";
import { PRTable } from "../../components/PRTable";
import "../../components/PRSections.css";

interface ReviewsViewProps {
  /** Open PRs where the user's review is currently requested (with `viewer_engaged`). */
  reviewRequests: GitHubPR[];
  /** Open PRs the user has already reviewed or commented on. */
  reviewingPRs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  jiraBaseUrl?: string;
}

type ReviewSection = "reviewing" | "requested";

const SECTIONS: { id: ReviewSection; label: string; icon: ElementType; colorVar: string }[] = [
  {
    id: "reviewing",
    label: "Currently reviewing",
    icon: IconMessageCircle,
    colorVar: "--color-status-info",
  },
  { id: "requested", label: "Review requested", icon: IconEye, colorVar: "--color-text-secondary" },
];

const STORAGE_KEY = "dev-home-reviews-section-collapsed";

/**
 * Reviews tab: open PRs split into "Currently reviewing" (you've reviewed or
 * commented) on top and "Review requested" (requested, not yet touched) below.
 * A re-requested PR you've already engaged with lands in "Currently reviewing".
 */
export const ReviewsView: React.FC<ReviewsViewProps> = ({
  reviewRequests,
  reviewingPRs,
  loading,
  jiraIssues,
  jiraBaseUrl,
}) => {
  const [collapsed, setCollapsed] = useState<Set<ReviewSection>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
    } catch {
      /* quota exceeded */
    }
  }, [collapsed]);

  const grouped = useMemo<Record<ReviewSection, GitHubPR[]>>(
    () => ({
      reviewing: reviewingPRs,
      requested: reviewRequests.filter((pr) => !pr.viewer_engaged),
    }),
    [reviewRequests, reviewingPRs],
  );

  const toggleSection = (id: ReviewSection) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Nothing in either section: delegate to a single PRTable for spinner / empty state.
  if (grouped.reviewing.length === 0 && grouped.requested.length === 0) {
    return (
      <PRTable
        prs={[]}
        loading={loading}
        variant="review-requests"
        jiraIssues={jiraIssues}
        jiraBaseUrl={jiraBaseUrl}
      />
    );
  }

  return (
    <div className="pr-sections">
      {SECTIONS.filter((s) => grouped[s.id].length > 0).map((section) => {
        const bucket = grouped[section.id];
        const isCollapsed = collapsed.has(section.id);
        const Icon = section.icon;
        return (
          <section
            className="pr-section"
            key={section.id}
            style={
              { ["--section-accent" as string]: `var(${section.colorVar})` } as React.CSSProperties
            }
          >
            <button
              type="button"
              className="pr-section-header"
              onClick={() => toggleSection(section.id)}
              aria-expanded={!isCollapsed}
            >
              <span className="pr-section-chevron">
                {isCollapsed ? (
                  <IconChevronRight size={16} stroke={2} />
                ) : (
                  <IconChevronDown size={16} stroke={2} />
                )}
              </span>
              <Icon size={16} stroke={1.8} className="pr-section-icon" />
              <span className="pr-section-label">{section.label}</span>
              <span className="pr-section-count">{bucket.length}</span>
            </button>
            {!isCollapsed && (
              <PRTable
                prs={bucket}
                loading={false}
                variant="review-requests"
                jiraIssues={jiraIssues}
                jiraBaseUrl={jiraBaseUrl}
                embedded
                showGroupToolbar={false}
                storageKeyScope={section.id}
              />
            )}
          </section>
        );
      })}
    </div>
  );
};
