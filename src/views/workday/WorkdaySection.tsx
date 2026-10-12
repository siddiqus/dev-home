import React, { createContext, useContext } from "react";
import { IconChevronDown, IconChevronRight, type Icon } from "@tabler/icons-react";
import Card from "react-bootstrap/Card";
import { Badge } from "../../components/primitives/Badge";
import { SectionHeader } from "../../components/primitives/SectionHeader";

/** True while the header's item filter is narrowing the page. */
export const ItemFilteringContext = createContext(false);

interface WorkdaySectionProps {
  title: string;
  /** Small outline icon before the title (muted; tinted by attention sections). */
  icon?: Icon;
  count: number;
  loading: boolean;
  error: string | null;
  /** Muted one-liner shown when there's nothing to list. */
  empty: React.ReactNode;
  /** Muted text after the count. */
  hint?: string;
  actions?: React.ReactNode;
  /** Small inline control right after the title (hidden while collapsed). */
  titleExtra?: React.ReactNode;
  className?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * One card on the Workday page. Shows skeleton bars only while loading with
 * nothing to show yet; an error is an inline line that keeps any items visible.
 * The header toggles the body; the parent owns (and persists) collapsed state.
 */
export function WorkdaySection({
  title,
  icon: TitleIcon,
  count,
  loading,
  error,
  empty,
  hint,
  actions,
  titleExtra,
  className = "",
  collapsed,
  onToggle,
  children,
}: WorkdaySectionProps) {
  const filtering = useContext(ItemFilteringContext);
  const Chevron = collapsed ? IconChevronRight : IconChevronDown;

  return (
    <Card className={`workday-section ${className}`.trim()}>
      <Card.Body className="p-0">
        <SectionHeader
          className={`workday-section-header${collapsed ? " workday-section-header--collapsed" : ""}`}
          action={actions}
        >
          <button
            type="button"
            className="workday-section-toggle"
            onClick={onToggle}
            aria-expanded={!collapsed}
          >
            <Chevron size={16} stroke={2} className="workday-section-chevron" />
            {TitleIcon && <TitleIcon size={14} stroke={1.8} className="workday-section-icon" />}
            <span>{title}</span>
            <Badge variant="neutral" className="workday-section-count">
              {count}
            </Badge>
            {hint && <span className="workday-section-hint">{hint}</span>}
          </button>
          {!collapsed && titleExtra}
        </SectionHeader>
        {!collapsed && (
          <>
            {error && <div className="workday-section-error">{error}</div>}
            {loading && count === 0 ? (
              <div className="workday-skeletons" aria-hidden="true">
                <div className="workday-skeleton" />
                <div className="workday-skeleton" />
                <div className="workday-skeleton" />
              </div>
            ) : count === 0 ? (
              // With an error, "nothing to show" would be misleading.
              !error && (
                <div className="workday-empty">{filtering ? "No matching items" : empty}</div>
              )
            ) : (
              <div className="workday-rows">{children}</div>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
