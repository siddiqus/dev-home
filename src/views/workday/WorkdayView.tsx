import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import { IconCopy, IconFold, IconFoldDown, IconRefresh, IconSun } from "@tabler/icons-react";
import type { GitHubComment, GitHubPR, JiraComment, JiraIssue, Note, NoteType } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { MultiSelectDropdown } from "../../components/MultiSelectDropdown";
import { PRDetailModal } from "../../components/PRDetailModal";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { Toast } from "../../components/Toast";
import { usePersistedSet } from "../../hooks/usePersistedSet";
import { usePRCopyActions } from "../../hooks/usePRCopyActions";
import { useWorkdayExtras } from "../../hooks/useWorkdayExtras";
import { buildWorkday, filterWorkday } from "./buildWorkday";
import { buildFocus } from "./buildFocus";
import { workdayToMarkdown } from "./workdayMarkdown";
import {
  filterFocusByItems,
  filterSectionsByItems,
  itemFilterOptions,
  parseItemFilter,
} from "./itemFilter";
import { ItemFilteringContext } from "./WorkdaySection";
import { formatSinceLabel, sinceFor, type Lookback } from "./dates";
import type { SprintFilter } from "./types";
import { FocusMode } from "./FocusMode";
import { LOOKBACKS, StandupMode } from "./StandupMode";
import { CopyPRLinkContext, CopyTicketContext, PinContext } from "./CompactRow";
import { PINS_KEY } from "./pins";
import "./workday.css";

export interface WorkdayViewProps {
  configured: boolean;
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  reviewingPRs: GitHubPR[];
  assignedIssues: JiraIssue[];
  allIssues: JiraIssue[];
  githubMentions?: GitHubComment[];
  jiraMentions?: JiraComment[];
  /** True while the dashboard sources the page reuses are loading. */
  loading: boolean;
  mentionsLoading?: boolean;
  jiraBaseUrl: string;
  weekendDays: number[];
  refreshKey: number;
  onRefresh: () => void;
  notes: Note[];
  /** useNotes().loaded — today's standup note is only created once Notes have loaded. */
  notesLoaded: boolean;
  addNote: (type: NoteType, content: string, referenceId?: string, title?: string) => Promise<Note>;
  editNote: (id: number, updates: { content?: string; title?: string }) => Promise<void>;
  /** Injectable clock for tests. */
  now?: Date;
}

type Mode = "focus" | "standup";

const MODE_KEY = "workday.mode";
const MODES = ["focus", "standup"] as const satisfies readonly Mode[];
const MODE_LABELS: Record<Mode, string> = { focus: "Focus", standup: "Standup" };
/** Sections open by default; ids here are collapsed. */
const COLLAPSED_KEY = "dev-home-workday-collapsed";
/** Sections collapsed by default; ids here are expanded. */
const EXPANDED_KEY = "dev-home-workday-expanded";
export const DEFAULT_COLLAPSED = new Set(["waiting", "notStarted"]);
const MODE_SECTIONS: Record<Mode, string[]> = {
  focus: ["needs", "mentions", "working", "waiting"],
  standup: ["done", "inProgress", "blockers", "reviewing", "notStarted"],
};
const FILTER_KEY = "dev-home-workday-filter";
const LOOKBACK_KEY = "dev-home-workday-lookback";
const FILTERS = ["all", "sprint", "off"] as const satisfies readonly SprintFilter[];
const NO_MENTIONS: never[] = [];

/** A localStorage-backed string state limited to `allowed` values. */
export function useStoredState<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : initial;
  });
  const set = useCallback(
    (v: T) => {
      localStorage.setItem(key, v);
      setValue(v);
    },
    [key],
  );
  return [value, set] as const;
}

/** Typing targets where single-key shortcuts must not fire. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

/**
 * Workday: one tab, two modes over the same data. Focus answers "what needs
 * me?"; Standup answers "what do I tell the team?" and copies a Slack-ready
 * standup. Both are view-only; rows open the PR modal or Jira drawer.
 */
export function WorkdayView(props: WorkdayViewProps) {
  const {
    configured,
    openPRs,
    reviewRequests,
    reviewingPRs,
    assignedIssues,
    allIssues,
    githubMentions = NO_MENTIONS,
    jiraMentions = NO_MENTIONS,
    loading,
    mentionsLoading = false,
    jiraBaseUrl,
    weekendDays,
    refreshKey,
    onRefresh,
    notes,
    notesLoaded,
    addNote,
    editNote,
  } = props;

  // refreshKey is a deliberate dep: a refresh re-reads the clock so "since" moves on.
  const now = useMemo(() => props.now ?? new Date(), [props.now, refreshKey]);
  const [mode, setMode] = useStoredState<Mode>(MODE_KEY, "focus", MODES);
  const [filter, setFilter] = useStoredState<SprintFilter>(FILTER_KEY, "all", FILTERS);
  const [lookback, setLookback] = useStoredState<Lookback>(LOOKBACK_KEY, "workday", LOOKBACKS);
  const [collapsed, setCollapsed, toggleCollapsed] = usePersistedSet(COLLAPSED_KEY);
  const [expanded, setExpanded, toggleExpanded] = usePersistedSet(EXPANDED_KEY);
  const isCollapsed = (id: string) =>
    DEFAULT_COLLAPSED.has(id) ? !expanded.has(id) : collapsed.has(id);
  const sectionToggle = (id: string) => ({
    collapsed: isCollapsed(id),
    onToggle: () => (DEFAULT_COLLAPSED.has(id) ? toggleExpanded(id) : toggleCollapsed(id)),
  });
  const [pins, , togglePin] = usePersistedSet(PINS_KEY);
  const pinContext = useMemo(() => ({ pins, toggle: togglePin }), [pins, togglePin]);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const { copy: copyText, onCopyLink, onCopyTicket, toast } = usePRCopyActions();

  // F / S switch modes, except while typing or with a modal open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target) || selectedPR) return;
      const key = e.key.toLowerCase();
      if (key === "f") setMode("focus");
      else if (key === "s") setMode("standup");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setMode, selectedPR]);

  // Keyed on the joined string: callers often pass a fresh array each render.
  const weekendKey = weekendDays.join(",");
  const since = useMemo(
    () => sinceFor(lookback, now, weekendKey ? weekendKey.split(",").map(Number) : []),
    [lookback, now, weekendKey],
  );
  const extras = useWorkdayExtras(configured, since, refreshKey);
  const sections = useMemo(
    () =>
      buildWorkday(
        { openPRs, reviewRequests, reviewingPRs, assignedIssues, allIssues, extras },
        now,
      ),
    [openPRs, reviewRequests, reviewingPRs, assignedIssues, allIssues, extras, now],
  );
  const filtered = useMemo(() => filterWorkday(sections, filter), [sections, filter]);
  const focus = useMemo(
    () =>
      buildFocus(
        {
          openPRs,
          reviewRequests,
          reviewingPRs,
          workingOn: sections.workingOn.items,
          githubMentions,
          jiraMentions,
        },
        now,
        pins,
      ),
    [openPRs, reviewRequests, reviewingPRs, sections, githubMentions, jiraMentions, now, pins],
  );

  // Pinned only counts toward "collapse all" while it's on screen.
  const modeSections =
    mode === "focus" && focus.pinned.length > 0
      ? ["pinned", ...MODE_SECTIONS.focus]
      : MODE_SECTIONS[mode];
  const allCollapsed = modeSections.every(isCollapsed);
  const toggleCollapseAll = () => {
    const ids = modeSections.filter((id) => !DEFAULT_COLLAPSED.has(id));
    const defaults = modeSections.filter((id) => DEFAULT_COLLAPSED.has(id));
    const next = new Set(collapsed);
    const nextExpanded = new Set(expanded);
    for (const id of ids) {
      if (allCollapsed) next.delete(id);
      else next.add(id);
    }
    for (const id of defaults) {
      if (allCollapsed) nextExpanded.add(id);
      else nextExpanded.delete(id);
    }
    setCollapsed(next);
    setExpanded(nextExpanded);
  };

  const ticketTitles = useMemo(
    () => new Map([...allIssues, ...assignedIssues].map((i) => [i.key, i.summary])),
    [allIssues, assignedIssues],
  );

  // The header's item filter narrows every section in both modes; options come
  // from the unfiltered page so picks don't vanish when switching modes.
  const [pickedItems, setPickedItems] = useState<string[]>([]);
  const itemOptions = useMemo(
    () => itemFilterOptions(sections, focus, ticketTitles),
    [sections, focus, ticketTitles],
  );
  const itemFilter = useMemo(() => parseItemFilter(pickedItems), [pickedItems]);
  const shownSections = useMemo(
    () => filterSectionsByItems(filtered, itemFilter),
    [filtered, itemFilter],
  );
  const shownFocus = useMemo(() => filterFocusByItems(focus, itemFilter), [focus, itemFilter]);

  // StandupNotes seeds this on mount and keeps it in sync.
  const [noteText, setNoteText] = useState("");
  const markdown = useMemo(
    () => workdayToMarkdown(filtered, noteText, now),
    [filtered, noteText, now],
  );

  const copy = () => copyText(markdown, "Standup copied");

  if (!configured) {
    return (
      <EmptyState
        icon={<IconSun size={40} stroke={1.5} />}
        title="Connect Jira and GitHub"
        description="Add your credentials in Settings to see your workday."
      />
    );
  }

  const sinceLabel = formatSinceLabel(since);
  const needsCount = focus.needs.length;
  const subtitle =
    mode === "standup"
      ? `Since ${sinceLabel}`
      : needsCount === 0
        ? "All clear"
        : `${needsCount} ${needsCount === 1 ? "thing needs" : "things need"} you`;
  const filterLabels: Record<SprintFilter, string> = {
    all: "All",
    sprint: "Sprint only",
    off: `Off-sprint · ${sections.offSprintCount}`,
  };

  return (
    <CopyTicketContext.Provider value={onCopyTicket}>
      <CopyPRLinkContext.Provider value={onCopyLink}>
        <div className="workday-page">
          <div className="workday-header">
            <h5>Workday</h5>
            <span className="workday-date-pill">{formatSinceLabel(now)}</span>
            <SegmentedTabs
              className="inline-control workday-mode-toggle"
              tabs={MODES.map((m) => ({
                key: m,
                label: (
                  <>
                    {MODE_LABELS[m]} <kbd>{MODE_LABELS[m][0]}</kbd>
                  </>
                ),
              }))}
              activeKey={mode}
              onChange={(k) => setMode(k as Mode)}
            />
            <div className="workday-item-filter">
              <MultiSelectDropdown
                items={itemOptions}
                values={pickedItems}
                onChange={setPickedItems}
                placeholder="Search tickets and PRs..."
                allLabel="All items"
                width="100%"
                height={30}
              />
            </div>
            <div className="workday-header-spacer" />
            {mode === "standup" && (
              <SegmentedTabs
                className="inline-control"
                tabs={FILTERS.map((f) => ({ key: f, label: filterLabels[f] }))}
                activeKey={filter}
                onChange={(k) => setFilter(k as SprintFilter)}
              />
            )}
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={toggleCollapseAll}
              title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
            >
              {allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}{" "}
              {allCollapsed ? "Expand all" : "Collapse all"}
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={onRefresh}>
              <IconRefresh size={14} /> Refresh
            </Button>
            {mode === "standup" && (
              <Button variant="primary" size="sm" onClick={copy}>
                <IconCopy size={14} /> Copy standup
              </Button>
            )}
          </div>
          <div className="workday-subtitle">{subtitle}</div>

          <ItemFilteringContext.Provider value={itemFilter !== null}>
            {mode === "focus" ? (
              <PinContext.Provider value={pinContext}>
                <FocusMode
                  focus={shownFocus}
                  loading={loading}
                  mentionsLoading={mentionsLoading}
                  jiraBaseUrl={jiraBaseUrl}
                  ticketTitles={ticketTitles}
                  now={now}
                  sectionToggle={sectionToggle}
                  onOpen={setSelectedPR}
                />
              </PinContext.Provider>
            ) : (
              <StandupMode
                sections={shownSections}
                sinceLabel={sinceLabel}
                lookback={lookback}
                onLookback={setLookback}
                loading={loading}
                jiraBaseUrl={jiraBaseUrl}
                now={now}
                sectionToggle={sectionToggle}
                onOpen={setSelectedPR}
                markdown={markdown}
                onNoteChange={setNoteText}
                notes={notes}
                notesLoaded={notesLoaded}
                addNote={addNote}
                editNote={editNote}
              />
            )}
          </ItemFilteringContext.Provider>

          <PRDetailModal
            pr={selectedPR}
            onHide={() => setSelectedPR(null)}
            jiraBaseUrl={jiraBaseUrl}
          />

          <Toast message={toast.message} visible={toast.visible} />
        </div>
      </CopyPRLinkContext.Provider>
    </CopyTicketContext.Provider>
  );
}
