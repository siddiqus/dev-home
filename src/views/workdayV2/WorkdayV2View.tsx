import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { IconRefresh, IconSun } from "@tabler/icons-react";
import type { GitHubPR, Note } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { PRDetailModal } from "../../components/PRDetailModal";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { Toast } from "../../components/Toast";
import { usePersistedState } from "../../hooks/usePersistedState";
import { usePRCopyActions } from "../../hooks/usePRCopyActions";
import { useWorkdayExtras } from "../../hooks/useWorkdayExtras";
import type { WorkdayViewProps } from "../workday/WorkdayView";
import { useStoredState, isTypingTarget } from "../workday/WorkdayView";
import { buildWorkday, filterWorkday } from "../workday/buildWorkday";
import { workdayToMarkdown } from "../workday/workdayMarkdown";
import { formatSinceLabel, sinceFor, type Lookback } from "../workday/dates";
import type { SprintFilter, TicketRef, WorkdaySections } from "../workday/types";
import { StandupMode, LOOKBACKS } from "../workday/StandupMode";
import { CopyPRLinkContext, CopyTicketContext } from "../workday/CompactRow";
import { prPin, ticketPin } from "../workday/pins";
import { prNoteKey } from "../../utils/prNotes";
import { buildDeck } from "./buildDeck";
import { DeckMode } from "./DeckMode";
import { useDeckKeys, type DeckKeyHandlers } from "./useDeckKeys";
import { useDeckState } from "./useDeckState";
import { useSeenTimer } from "./useSeenTimer";
import "./deck.css";

export interface WorkdayV2ViewProps extends WorkdayViewProps {
  onOpenNote?: (note: Note) => void;
  /**
   * False until every deck source has completed a fetch (cache-seeded data
   * doesn't count). Deck state updates wait for it. Defaults to true.
   */
  sourcesLoaded?: boolean;
  /** A dashboard source failed; deck state updates are held back while set. */
  sourceError?: string | null;
}

type Mode = "focus" | "standup";

const MODE_KEY = "workday-v2.mode";
const MODES = ["focus", "standup"] as const satisfies readonly Mode[];
const MODE_LABELS: Record<Mode, string> = { focus: "Focus", standup: "Standup" };
const LOOKBACK_KEY = "dev-home-workday-v2-lookback";
const FILTER_KEY = "dev-home-workday-v2-filter";
const FILTERS = ["all", "sprint", "off"] as const satisfies readonly SprintFilter[];
const CLOSED_FOLDED_KEY = "dev-home-workday-v2-closed-folded";
const ONLY_CURRENT_KEY = "dev-home-workday-v2-only-current";
const NO_MENTIONS: never[] = [];
const noop = () => {};

/** Deck keys stand down while a drawer (Jira issue) or a modal (note editor) is open. */
const drawerOpen = () => document.querySelector(".offcanvas.show, .modal.show") !== null;

/** Keys v1 flags off-sprint anywhere on the Workday page, from buildWorkday's TicketRefs. */
function offSprintKeysOf(s: WorkdaySections): Set<string> {
  const refs: (TicketRef | null)[] = [
    ...s.workingOn.items.map((i) => i.ticket),
    ...s.reviewing.items.map((i) => i.ticket),
    ...s.blockers.items.map((i) => i.ticket),
    ...s.waiting.items.map((i) => i.ticket),
    ...s.notStarted.items.map((i) => i.ticket),
    ...s.notStarted.offSprintItems.map((i) => i.ticket),
    ...s.done.items.map((i) => i.ticket),
  ];
  const keys = new Set<string>();
  for (const r of refs) if (r?.offSprint) keys.add(r.key.toUpperCase());
  return keys;
}

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
    mentionsLoading = false,
    sourcesLoaded = true,
    sourceError = null,
    jiraBaseUrl,
    weekendDays,
    refreshKey,
    onRefresh,
    notes,
    notesLoaded,
    addNote,
    editNote,
    onOpenNote,
  } = props;

  const now = useMemo(() => props.now ?? new Date(), [props.now, refreshKey]);
  const [mode, setMode] = useStoredState<Mode>(MODE_KEY, "focus", MODES);
  const [filter, setFilter] = useStoredState<SprintFilter>(FILTER_KEY, "all", FILTERS);
  const [lookback, setLookback] = useStoredState<Lookback>(LOOKBACK_KEY, "workday", LOOKBACKS);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const { onCopyLink, onCopyTicket, toast } = usePRCopyActions();
  const showToast = toast.show;
  const [closedFolded, setClosedFolded] = usePersistedState(CLOSED_FOLDED_KEY, true);
  const [onlyCurrent, setOnlyCurrent] = usePersistedState(ONLY_CURRENT_KEY, false);
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
  const offSprintKeys = useMemo(() => offSprintKeysOf(sections), [sections]);

  // Standup markdown for the Copy button.
  const [noteText, setNoteText] = useState("");
  const markdown = useMemo(
    () => workdayToMarkdown(filtered, noteText, now),
    [filtered, noteText, now],
  );

  // Deck state and composition for Focus mode.
  const { state, select, toggleCurrent, markSeen, markUnread, close, reopen, applyUpdates } =
    useDeckState();
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
          offSprintKeys,
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
      offSprintKeys,
      state,
      now,
    ],
  );

  // Apply buildDeck's patch (arrivals, reopens, pruning, first-run seeding) only
  // after a complete, error-free load, so a partial or failed fetch never drops
  // pins or seeds from incomplete data. Keyed on the patch content, not its
  // identity: once applied, the next build's patch is empty and the effect settles.
  const canApply = sourcesLoaded && !loading && !mentionsLoading && !sourceError;
  const patchKey = useMemo(
    () =>
      JSON.stringify({
        updates: deck.stateUpdates,
        present: [...deck.current, ...deck.open, ...deck.closed].map((t) => t.id),
        at: now.toISOString(),
      }),
    [deck, now],
  );
  useEffect(() => {
    if (!canApply) return;
    const { updates, present, at } = JSON.parse(patchKey);
    applyUpdates(updates, present, new Date(at));
  }, [canApply, patchKey, applyUpdates]);

  // The time stamped on closes and seen marks: the wall clock, but never before
  // the view's clock (tests inject a fixed `now`).
  const stamp = useCallback(() => new Date(Math.max(Date.now(), now.getTime())), [now]);

  // Selection: the remembered ticket if it's still in the rail, else the first one.
  // `g c` narrows the rail (and ←/→, `n`) to ▶ Current.
  const rail = useMemo(
    () => (onlyCurrent ? deck.current : [...deck.current, ...deck.open]),
    [deck, onlyCurrent],
  );
  const selectedTicket = rail.find((t) => t.id === state.selected) ?? rail[0] ?? null;
  const selectedId = selectedTicket?.id ?? null;
  // The picked PR is per card; opening a card picks its first current PR, else the top row.
  const [prPick, setPrPick] = useState<{ ticketId: string; url: string } | null>(null);
  const cardPRs = useMemo(() => selectedTicket?.prs ?? [], [selectedTicket]);
  const pickedPR =
    (prPick?.ticketId === selectedId && cardPRs.find((p) => p.pr.html_url === prPick.url)) ||
    cardPRs.find((p) => p.current) ||
    cardPRs[0] ||
    null;
  const selectedPrUrl = pickedPR?.pr.html_url ?? null;

  const selectTicket = useCallback(
    (id: string) => {
      select(id);
      setPrPick(null);
    },
    [select],
  );
  // A reopened tab lands in Open, so `g c` (only current) turns off to show it.
  const reopenTicket = useCallback(
    (id: string) => {
      reopen(id);
      setOnlyCurrent(false);
      selectTicket(id);
    },
    [reopen, selectTicket, setOnlyCurrent],
  );
  // Opening a PR (⏎ or a click) marks it seen immediately (spec §5.8).
  const openPR = useCallback(
    (pr: GitHubPR) => {
      markSeen({ [pr.html_url]: pr.updated_at });
      setSelectedPR(pr);
    },
    [markSeen],
  );

  // Dwell: after 1.5s on a card, every PR on it is seen at its updated_at, and a
  // keyed ticket's `ticket:<KEY>` at now (for Jira mentions and PR-less tickets).
  // The callback reads the latest card through a ref so it stays stable and a
  // data refresh doesn't restart the timer.
  const seenRef = useRef<() => void>(noop);
  seenRef.current = () => {
    if (!selectedTicket) return;
    const entries: Record<string, string> = {};
    for (const p of selectedTicket.prs) entries[p.pr.html_url] = p.pr.updated_at;
    if (selectedTicket.key) entries[ticketPin(selectedTicket.key)] = stamp().toISOString();
    markSeen(entries);
  };
  const onDwell = useCallback(() => seenRef.current(), []);
  useSeenTimer(configured && mode === "focus" && !selectedPR ? selectedId : null, onDwell);

  // The `.` composer: open for one card and PR (null url = a PR-less ticket).
  // It shows only while that card and PR are still the selected ones.
  const [composer, setComposer] = useState<{ ticketId: string; url: string | null } | null>(null);
  const composing =
    composer !== null &&
    composer.ticketId === selectedId &&
    composer.url === (pickedPR?.pr.html_url ?? null);
  // Moving to another card or PR drops the composer rather than leaving it parked.
  useEffect(() => {
    if (composer && !composing) setComposer(null);
  }, [composer, composing]);
  const cancelNote = useCallback(() => setComposer(null), []);
  const saveNote = useCallback(
    async (text: string) => {
      const pr = pickedPR?.pr;
      try {
        if (pr) await addNote("github_pr", text, prNoteKey(pr));
        else if (selectedTicket?.key) await addNote("jira_ticket", text, selectedTicket.key);
        else return;
      } catch (err) {
        showToast("Couldn't save the note");
        throw err;
      }
      setComposer(null);
      showToast("Note saved");
    },
    [pickedPR, selectedTicket, addNote, showToast],
  );

  const selectPr = useCallback(
    (url: string) => {
      if (selectedId) setPrPick({ ticketId: selectedId, url });
    },
    [selectedId],
  );

  // Memoised: useDeckKeys re-binds whenever the handlers object changes.
  const deckKeys = useMemo<DeckKeyHandlers>(() => {
    const guard = (fn: () => void) => () => {
      if (!drawerOpen()) fn();
    };
    const step = (delta: number) => {
      if (rail.length === 0) return;
      const i = rail.findIndex((t) => t.id === selectedId);
      selectTicket(rail[(i + delta + rail.length) % rail.length].id);
    };
    const movePr = (delta: number) => {
      const i = cardPRs.findIndex((p) => p.pr.html_url === selectedPrUrl);
      const next = cardPRs[Math.min(Math.max(i + delta, 0), cardPRs.length - 1)];
      if (next) selectPr(next.pr.html_url);
    };
    const pr = pickedPR?.pr ?? null;
    const i = rail.findIndex((t) => t.id === selectedId);
    return {
      next: guard(() => step(1)),
      prev: guard(() => step(-1)),
      down: guard(() => movePr(1)),
      up: guard(() => movePr(-1)),
      open: guard(() => pr && openPR(pr)),
      openExternal: guard(() => pr && window.open(pr.html_url, "_blank", "noopener,noreferrer")),
      // Space: the selected PR, or the ticket itself when it has no PRs.
      toggleCurrent: guard(() => {
        if (!selectedTicket) return;
        if (pr) toggleCurrent(prPin(pr), selectedTicket.id);
        else if (selectedTicket.key)
          toggleCurrent(ticketPin(selectedTicket.key), selectedTicket.id);
      }),
      // x: close into Closed; selection moves to the next ticket in rail order.
      close: guard(() => {
        if (!selectedTicket) return;
        close(selectedTicket.id, stamp());
        const rest = rail.filter((t) => t.id !== selectedTicket.id);
        const next = rail.slice(i + 1).find((t) => t.id !== selectedTicket.id) ?? rest[0];
        if (next) selectTicket(next.id);
        else select(null);
      }),
      unread: guard(() => pr && markUnread(pr.html_url)),
      // n: the next ticket after the selected one (wrapping) with unseen activity.
      nextUpdated: guard(() => {
        const after = [...rail.slice(i + 1), ...rail.slice(0, Math.max(i, 0))];
        const next = after.find((t) => t.unseen && t.id !== selectedId);
        if (next) selectTicket(next.id);
        else showToast("Nothing new");
      }),
      toggleOnlyCurrent: guard(() => setOnlyCurrent((v) => !v)),
      // .: the inline note composer under the selected PR (or the PR-less ticket).
      note: guard(() => {
        if (!selectedTicket) return;
        if (pr) setComposer({ ticketId: selectedTicket.id, url: pr.html_url });
        else if (selectedTicket.key) setComposer({ ticketId: selectedTicket.id, url: null });
      }),
      // Wired by later tasks (palette, help).
      refresh: noop,
      palette: noop,
      // F / S are handled by the mode effect above.
      focusMode: noop,
      standupMode: noop,
      help: noop,
    };
  }, [
    rail,
    selectedId,
    selectedTicket,
    cardPRs,
    selectedPrUrl,
    pickedPR,
    selectTicket,
    selectPr,
    select,
    openPR,
    toggleCurrent,
    close,
    markUnread,
    stamp,
    showToast,
    setOnlyCurrent,
  ]);
  useDeckKeys(deckKeys, { enabled: configured && mode === "focus", blocked: selectedPR !== null });

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
        <div className={`workday-page workday-v2${mode === "focus" ? " workday-v2--focus" : ""}`}>
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
            <DeckMode
              deck={deck}
              selectedId={selectedId}
              onSelect={selectTicket}
              selectedPrUrl={selectedPrUrl}
              onSelectPr={selectPr}
              onOpen={openPR}
              jiraBaseUrl={jiraBaseUrl}
              now={now}
              closedFolded={closedFolded}
              onToggleClosed={() => setClosedFolded((v) => !v)}
              onReopen={reopenTicket}
              onlyCurrent={onlyCurrent}
              onOpenNote={onOpenNote}
              composing={composing}
              onSaveNote={saveNote}
              onCancelNote={cancelNote}
            />
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
