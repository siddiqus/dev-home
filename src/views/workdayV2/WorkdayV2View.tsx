import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { IconRefresh, IconSun } from "@tabler/icons-react";
import type { GitHubPR, Note } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { PRDetailModal } from "../../components/PRDetailModal";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { Toast } from "../../components/Toast";
import { usePRCopyActions } from "../../hooks/usePRCopyActions";
import { useWorkdayExtras } from "../../hooks/useWorkdayExtras";
import type { WorkdayViewProps } from "../workday/WorkdayView";
import { useStoredState, isTypingTarget } from "../workday/WorkdayView";
import { buildWorkday, filterWorkday } from "../workday/buildWorkday";
import { workdayToMarkdown } from "../workday/workdayMarkdown";
import { formatSinceLabel, sinceFor, type Lookback } from "../workday/dates";
import type { SprintFilter } from "../workday/types";
import { StandupMode, LOOKBACKS } from "../workday/StandupMode";
import { CopyPRLinkContext, CopyTicketContext } from "../workday/CompactRow";
import { buildDeck } from "./buildDeck";
import { useDeckState } from "./useDeckState";
import "./deck.css";

export interface WorkdayV2ViewProps extends WorkdayViewProps {
  onOpenNote?: (note: Note) => void;
}

type Mode = "focus" | "standup";

const MODE_KEY = "workday-v2.mode";
const MODES = ["focus", "standup"] as const satisfies readonly Mode[];
const MODE_LABELS: Record<Mode, string> = { focus: "Focus", standup: "Standup" };
const LOOKBACK_KEY = "dev-home-workday-v2-lookback";
const FILTER_KEY = "dev-home-workday-v2-filter";
const FILTERS = ["all", "sprint", "off"] as const satisfies readonly SprintFilter[];
const NO_MENTIONS: never[] = [];

/**
 * Workday V2: the ticket deck. Focus mode is a deck (rail + card) that stays
 * stable across refreshes. Standup mode reuses v1's StandupMode as-is.
 */
export function WorkdayV2View(props: WorkdayV2ViewProps) {
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
    jiraBaseUrl,
    weekendDays,
    refreshKey,
    onRefresh,
    notes,
    notesLoaded,
    addNote,
    editNote,
  } = props;

  const now = useMemo(() => props.now ?? new Date(), [props.now, refreshKey]);
  const [mode, setMode] = useStoredState<Mode>(MODE_KEY, "focus", MODES);
  const [filter, setFilter] = useStoredState<SprintFilter>(FILTER_KEY, "all", FILTERS);
  const [lookback, setLookback] = useStoredState<Lookback>(LOOKBACK_KEY, "workday", LOOKBACKS);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const { onCopyLink, onCopyTicket, toast } = usePRCopyActions();
  // Track if we've finished at least one load, so the spinner shows on refreshes but not first load.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!loading && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [loading, hasLoadedOnce]);

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

  const weekendKey = weekendDays.join(",");
  const since = useMemo(
    () => sinceFor(lookback, now, weekendKey ? weekendKey.split(",").map(Number) : []),
    [lookback, now, weekendKey],
  );
  const extras = useWorkdayExtras(configured, since, refreshKey);

  // Standup sections: built the same way as v1.
  const sections = useMemo(
    () =>
      buildWorkday(
        { openPRs, reviewRequests, reviewingPRs, assignedIssues, allIssues, extras },
        now,
      ),
    [openPRs, reviewRequests, reviewingPRs, assignedIssues, allIssues, extras, now],
  );
  const filtered = useMemo(() => filterWorkday(sections, filter), [sections, filter]);

  // Standup markdown for the Copy button.
  const [noteText, setNoteText] = useState("");
  const markdown = useMemo(
    () => workdayToMarkdown(filtered, noteText, now),
    [filtered, noteText, now],
  );

  // Deck state and composition for Focus mode.
  const { state } = useDeckState();
  const deck = useMemo(
    () =>
      buildDeck(
        {
          openPRs,
          reviewRequests,
          reviewingPRs,
          assignedIssues,
          allIssues,
          githubMentions,
          jiraMentions,
          notes,
        },
        state,
        now,
      ),
    [
      openPRs,
      reviewRequests,
      reviewingPRs,
      assignedIssues,
      allIssues,
      githubMentions,
      jiraMentions,
      notes,
      state,
      now,
    ],
  );

  // Section toggle stubs for Standup (not implemented yet; Task 8 does state management).
  const sectionToggle = useCallback(() => ({ collapsed: false, onToggle: () => {} }), []);

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
  const summary = `${deck.counts.tickets} tickets · ${deck.counts.current} current · ${deck.counts.unseen} updated`;

  const filterLabels: Record<SprintFilter, string> = {
    all: "All",
    sprint: "Sprint only",
    off: `Off-sprint · ${sections.offSprintCount}`,
  };

  return (
    <CopyTicketContext.Provider value={onCopyTicket}>
      <CopyPRLinkContext.Provider value={onCopyLink}>
        <div className="workday-page workday-v2">
          <div className="workday-header">
            <h5>Workday V2</h5>
            {mode === "focus" && <span className="workday-date-pill">{summary}</span>}
            {mode === "standup" && <span className="workday-date-pill">{sinceLabel}</span>}
            <Button
              variant="link"
              size="sm"
              className="workday-v2-cmd-k-hint"
              title="Find and act"
              disabled
            >
              ⌘K find &amp; act
            </Button>
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
            <div className="workday-header-spacer" />
            {mode === "standup" && (
              <SegmentedTabs
                className="inline-control"
                tabs={FILTERS.map((f) => ({ key: f, label: filterLabels[f] }))}
                activeKey={filter}
                onChange={(k) => setFilter(k as SprintFilter)}
              />
            )}
            {loading && hasLoadedOnce && (
              <Spinner animation="border" size="sm" role="status" aria-label="Refreshing" />
            )}
            <Button variant="outline-secondary" size="sm" onClick={onRefresh}>
              <IconRefresh size={14} /> Refresh
            </Button>
          </div>

          {mode === "focus" ? (
            <div data-testid="deck-mode">{/* Task 7: DeckMode goes here */}</div>
          ) : (
            <StandupMode
              sections={filtered}
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
