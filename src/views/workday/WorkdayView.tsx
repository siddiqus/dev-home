import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { IconCopy, IconFold, IconFoldDown, IconRefresh, IconSun } from "@tabler/icons-react";
import type { GitHubComment, GitHubPR, JiraComment, JiraIssue, Note, NoteType } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { PRDetailModal } from "../../components/PRDetailModal";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { Toast } from "../../components/Toast";
import { usePersistedSet } from "../../hooks/usePersistedSet";
import { usePersistedState } from "../../hooks/usePersistedState";
import { usePRCopyActions } from "../../hooks/usePRCopyActions";
import { useWorkdayExtras } from "../../hooks/useWorkdayExtras";
import { useStoredState } from "../../hooks/useStoredState";
import { isTypingTarget } from "../../utils/dom";
import { buildWorkday } from "./buildWorkday";
import { buildFocus } from "./buildFocus";
import { formatSinceLabel, LOOKBACKS, sinceFor, type Lookback } from "./dates";
import type { TicketRef, WorkdaySections } from "./types";
import {
  CopyBranchContext,
  CopyPRLinkContext,
  CopyTicketContext,
  PinContext,
  ViewerLoginContext,
} from "./CompactRow";
import { FocusMode } from "./FocusMode";
import { PINS_KEY, prPin, ticketPin } from "./pins";
import { prNoteKey } from "../../utils/prNotes";
import { jiraBrowseUrl } from "../../utils/tickets";
import { useOptionalJiraDrawer } from "../../context/JiraDrawerContext";
import { fetchPR } from "../../services/github";
import type { MentionItem } from "./types";
import { CommandPalette, type PaletteAction, type PaletteCommand } from "./CommandPalette";
import type { SearchResult } from "./deckSearch";
import { buildDeck } from "./buildDeck";
import { jiraCommentUrl } from "./DeckContext";
import type { DeckPR } from "./deckTypes";
import { DeckMode, type SwipeDirection } from "./DeckMode";
import { ShortcutSheet } from "./ShortcutSheet";
import { StandupSheet } from "./StandupSheet";
import { standupGroups, standupGroupsToMarkdown } from "./standupModel";
import { useDeckKeys, type DeckKeyHandlers } from "./useDeckKeys";
import { useDeckState } from "./useDeckState";
import { useSeenTimer } from "./useSeenTimer";
import "./workday.css";
import "./deck.css";

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
  /** My GitHub login; the deck hides the author on my own PRs. */
  githubUsername?: string;
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
  onOpenNote?: (note: Note) => void;
  /**
   * False until every deck source has completed a fetch (cache-seeded data
   * doesn't count). Deck state updates wait for it. Defaults to true.
   */
  sourcesLoaded?: boolean;
  /** A dashboard source failed; deck state updates are held back while set. */
  sourceError?: string | null;
}

type Mode = "focus" | "list" | "standup";

const MODE_KEY = "workday-v2.mode";
const MODES = ["focus", "list", "standup"] as const satisfies readonly Mode[];
const MODE_LABELS: Record<Mode, string> = {
  focus: "Focus",
  list: "List View",
  standup: "Standup Sheet",
};
const MODE_KEYS: Record<Mode, string> = { focus: "F", list: "L", standup: "S" };
/** List View sections open by default; ids here are collapsed. */
const COLLAPSED_KEY = "dev-home-workday-collapsed";
/** List View sections collapsed by default; ids here are expanded. */
const EXPANDED_KEY = "dev-home-workday-expanded";
const DEFAULT_COLLAPSED = new Set(["waiting"]);
const LIST_SECTIONS = ["needs", "mentions", "working", "waiting"];
const LOOKBACK_KEY = "dev-home-workday-v2-lookback";
const CLOSED_FOLDED_KEY = "dev-home-workday-v2-closed-folded";
const ONLY_CURRENT_KEY = "dev-home-workday-v2-only-current";
const HIDE_HINTS_KEY = "dev-home-workday-v2-hide-hints";
const LOOKBACK_LABELS: Record<Lookback, string> = {
  workday: "Last workday",
  "3d": "3 days",
  "7d": "7 days",
};
const NO_MENTIONS: never[] = [];
const noop = () => {};

/** Deck keys stand down while a drawer (Jira issue) or a modal (note editor) is open. */
const drawerOpen = () => document.querySelector(".offcanvas.show, .modal.show") !== null;

const openTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

/** useDashboard's per-source prefixes. Only the first three feed the deck's tickets. */
const SOURCE_PREFIX =
  /(?:^|; )(GitHub PRs|GitHub Reviews|GitHub Mentions|JIRA Issues|JIRA Mentions): /g;
const DECK_SOURCES = new Set(["GitHub PRs", "GitHub Reviews", "JIRA Issues"]);

/** The sources named in a useDashboard error message. */
const errorSources = (error: string) =>
  new Set([...error.matchAll(SOURCE_PREFIX)].map((m) => m[1]));

/**
 * True when an error could have hidden tickets: a deck source failed, or the
 * error names no known source. A mentions-only failure only loses quotes, so
 * deck state updates still apply.
 */
export function blocksDeckUpdates(error: string | null): boolean {
  if (!error) return false;
  const sources = errorSources(error);
  return sources.size === 0 || [...sources].some((s) => DECK_SOURCES.has(s));
}

/**
 * The rail banner for a failed source. useDashboard joins per-source messages
 * with "; ", each prefixed with its source ("GitHub PRs: …", "JIRA Issues: …").
 * GitHub PRs / Reviews and JIRA Issues are deck sources: losing one hides tickets.
 * GitHub / JIRA Mentions only feed the quotes, so they get their own line.
 */
export function sourceErrorText(error: string | null): string | null {
  if (!error) return null;
  const sources = errorSources(error);
  const github = sources.has("GitHub PRs") || sources.has("GitHub Reviews");
  const jira = sources.has("JIRA Issues");
  if (github && jira) return "GitHub and Jira unavailable";
  if (jira) return "Jira unavailable, showing PRs only";
  if (github) return "GitHub unavailable, showing Jira tickets only";
  if (sources.has("GitHub Mentions") || sources.has("JIRA Mentions")) return "Mentions unavailable";
  return "Some data failed to load";
}

/**
 * Swipe direction from rail order: later = "next". Uses the current rail when
 * both tickets are in it, else the rail as it was at the last selection change
 * (the old ticket may have just been closed). Defaults to "next".
 */
function railDirection(
  from: string,
  to: string,
  rail: string[],
  previousRail: string[],
): SwipeDirection {
  for (const order of [rail, previousRail]) {
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a !== -1 && b !== -1) return b > a ? "next" : "prev";
  }
  return "next";
}

/** Keys flagged off-sprint anywhere on the Workday page, from buildWorkday's TicketRefs. */
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
 * Workday: three tabs over the same data. Focus is the ticket deck (rail +
 * card) that stays stable across refreshes; List View is the needs-you /
 * mentions / working-on / waiting lists; Standup Sheet is the grouped crib
 * sheet with a Copy button.
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
  const [lookback, setLookback] = useStoredState<Lookback>(LOOKBACK_KEY, "workday", LOOKBACKS);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const { copy, onCopyLink, onCopyTicket, onCopyBranch, toast } = usePRCopyActions();
  const showToast = toast.show;
  const [closedFolded, setClosedFolded] = usePersistedState(CLOSED_FOLDED_KEY, true);
  const [onlyCurrent, setOnlyCurrent] = usePersistedState(ONLY_CURRENT_KEY, false);
  const [hideHints, setHideHints] = usePersistedState(HIDE_HINTS_KEY, false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const openIssue = useOptionalJiraDrawer();
  // Track if we've finished at least one load, so the refresh spinner skips the first load.
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
      if (isTypingTarget(e.target) || selectedPR || paletteOpen || helpOpen || drawerOpen()) return;
      const key = e.key.toLowerCase();
      const next = MODES.find((m) => MODE_KEYS[m].toLowerCase() === key);
      if (next) setMode(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setMode, selectedPR, paletteOpen, helpOpen]);

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
  const offSprintKeys = useMemo(() => offSprintKeysOf(sections), [sections]);

  // List View: v1's Focus lists (needs you, mentions, working on, waiting).
  const [pins, , togglePin] = usePersistedSet(PINS_KEY);
  const pinContext = useMemo(() => ({ pins, toggle: togglePin }), [pins, togglePin]);
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
  const ticketTitles = useMemo(
    () => new Map([...allIssues, ...assignedIssues].map((i) => [i.key, i.summary])),
    [allIssues, assignedIssues],
  );
  const [collapsed, setCollapsed, toggleCollapsed] = usePersistedSet(COLLAPSED_KEY);
  const [expanded, setExpanded, toggleExpanded] = usePersistedSet(EXPANDED_KEY);
  const isCollapsed = (id: string) =>
    DEFAULT_COLLAPSED.has(id) ? !expanded.has(id) : collapsed.has(id);
  const sectionToggle = (id: string) => ({
    collapsed: isCollapsed(id),
    onToggle: () => (DEFAULT_COLLAPSED.has(id) ? toggleExpanded(id) : toggleCollapsed(id)),
  });
  // Pinned only counts toward "collapse all" while it's on screen.
  const listSections = focus.pinned.length > 0 ? ["pinned", ...LIST_SECTIONS] : LIST_SECTIONS;
  const allCollapsed = listSections.every(isCollapsed);
  const toggleCollapseAll = () => {
    const nextCollapsed = new Set(collapsed);
    const nextExpanded = new Set(expanded);
    for (const id of listSections) {
      const set = DEFAULT_COLLAPSED.has(id) ? nextExpanded : nextCollapsed;
      // Default-collapsed ids are stored when expanded; the rest when collapsed.
      if (allCollapsed === DEFAULT_COLLAPSED.has(id)) set.add(id);
      else set.delete(id);
    }
    setCollapsed(nextCollapsed);
    setExpanded(nextExpanded);
  };

  // Standup markdown for the Copy button.
  const [noteText, setNoteText] = useState("");
  const groups = useMemo(() => standupGroups(sections, now), [sections, now]);
  const markdown = useMemo(() => standupGroupsToMarkdown(groups, noteText), [groups, noteText]);

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
  // Mentions only feed quotes: their loading or failing doesn't hold the patch back.
  const canApply = sourcesLoaded && !loading && !blocksDeckUpdates(sourceError);
  const patchKey = useMemo(() => {
    const tabs = [...deck.current, ...deck.open, ...deck.closed];
    return JSON.stringify({
      updates: deck.stateUpdates,
      present: tabs.map((t) => t.id),
      // `seen` ids still on the deck, so stale entries can be pruned.
      seen: tabs.flatMap((t) => [
        ...t.prs.map((p) => p.pr.html_url),
        ...(t.key ? [ticketPin(t.key)] : []),
      ]),
      at: now.toISOString(),
    });
  }, [deck, now]);
  useEffect(() => {
    if (!canApply) return;
    const { updates, present, seen, at } = JSON.parse(patchKey);
    applyUpdates(updates, present, new Date(at), seen);
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

  // Card swipe (spec §5.4): only explicit navigation swipes: ←/→, n, x, a ⌘K
  // jump or a rail click record a `navIntent` alongside the selection change.
  // ←/→ and n carry their own direction, so a wrap-around still swipes the way
  // the key points; the rest go by rail order. Selection changes without an
  // intent (a refresh dropping the ticket, `g c` narrowing) and mode switches
  // don't swipe. The direction is derived during render so the new card mounts
  // already animating.
  const railIds = useMemo(() => rail.map((t) => t.id), [rail]);
  const [navIntent, setNavIntent] = useState<{ to: string; dir: SwipeDirection | "rail" } | null>(
    null,
  );
  const [swipe, setSwipe] = useState<{
    id: string | null;
    mode: Mode;
    dir: SwipeDirection | null;
    rail: string[];
  }>(() => ({ id: selectedId, mode, dir: null, rail: railIds }));
  if (swipe.id !== selectedId || swipe.mode !== mode) {
    let dir: SwipeDirection | null = null;
    if (swipe.mode === mode && swipe.id && selectedId && navIntent?.to === selectedId) {
      dir =
        navIntent.dir === "rail"
          ? railDirection(swipe.id, selectedId, railIds, swipe.rail)
          : navIntent.dir;
    }
    setSwipe({ id: selectedId, mode, dir, rail: railIds });
    if (navIntent) setNavIntent(null);
  }
  /** Records an explicit move to `to` so the selection change swipes. */
  const intendNav = useCallback(
    (to: string, dir: SwipeDirection | "rail" = "rail") => {
      if (to !== selectedId) setNavIntent({ to, dir });
    },
    [selectedId],
  );
  // The picked PR is per card; opening a card picks its first current PR, else the top row.
  const [prPick, setPrPick] = useState<{ ticketId: string; url: string } | null>(null);
  // The card's PR order is frozen for a card visit: captured when the card
  // opens, with PRs that arrive later appended. Marking PRs seen (the dwell)
  // re-sorts equal-priority PRs, which would otherwise move the highlight
  // under the user and drop an open `.` composer. Adjusted during render, so
  // the card never paints in the live order first.
  const livePRs = selectedTicket?.prs;
  const [prOrder, setPrOrder] = useState<{ ticketId: string | null; urls: string[] }>(() => ({
    ticketId: selectedId,
    urls: (livePRs ?? []).map((p) => p.pr.html_url),
  }));
  let order = prOrder;
  if (order.ticketId !== selectedId) {
    order = { ticketId: selectedId, urls: (livePRs ?? []).map((p) => p.pr.html_url) };
    setPrOrder(order);
  } else {
    const added = (livePRs ?? []).filter((p) => !order.urls.includes(p.pr.html_url));
    if (added.length > 0) {
      order = { ticketId: selectedId, urls: [...order.urls, ...added.map((p) => p.pr.html_url)] };
      setPrOrder(order);
    }
  }
  // Pin the default pick for the visit too (unless a jump already picked one),
  // so a PR turning current mid-visit doesn't move the highlight either.
  if (selectedId && prPick?.ticketId !== selectedId) {
    const first = livePRs?.find((p) => p.current) ?? livePRs?.[0];
    if (first) setPrPick({ ticketId: selectedId, url: first.pr.html_url });
  }
  const orderUrls = order.urls;
  const cardPRs = useMemo<DeckPR[]>(() => {
    const prs = livePRs ?? [];
    const at = (p: DeckPR) => orderUrls.indexOf(p.pr.html_url);
    return [...prs].sort((a, b) => at(a) - at(b));
  }, [livePRs, orderUrls]);
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
  // A rail click: an explicit move, swiped by rail order.
  const clickTicket = useCallback(
    (id: string) => {
      intendNav(id);
      selectTicket(id);
    },
    [intendNav, selectTicket],
  );
  // A reopened tab lands in Open, so `g c` (only current) turns off to show it.
  const reopenTicket = useCallback(
    (id: string) => {
      reopen(id);
      setOnlyCurrent(false);
      intendNav(id);
      selectTicket(id);
    },
    [reopen, selectTicket, setOnlyCurrent, intendNav],
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

  // x (or ⌘⌫ in ⌘K): close into Closed; if it was the selected ticket, selection
  // moves to the next ticket in rail order.
  const closeTicket = useCallback(
    (id: string) => {
      // Never before the ticket's newest PR update: a PR clock ahead of ours
      // would otherwise reopen the tab on the next build.
      const t = [...deck.current, ...deck.open].find((x) => x.id === id);
      const newest = Math.max(0, ...(t?.prs ?? []).map((p) => Date.parse(p.pr.updated_at) || 0));
      close(id, new Date(Math.max(stamp().getTime(), newest)));
      if (id !== selectedId) return;
      const i = rail.findIndex((t) => t.id === id);
      const rest = rail.filter((t) => t.id !== id);
      const next = rail.slice(i + 1).find((t) => t.id !== id) ?? rest[0];
      if (next) {
        intendNav(next.id, "next");
        selectTicket(next.id);
      } else select(null);
    },
    [close, stamp, deck, selectedId, rail, selectTicket, select, intendNav],
  );

  // Read through a ref so a new onRefresh identity doesn't re-bind the deck keys.
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const refresh = useCallback(() => refreshRef.current(), []);

  // The ⌘K outside-PR fetch in flight: opening the palette again (or a newer
  // fetch) supersedes it, so a late result never lands a modal on the palette.
  const prFetchSeq = useRef(0);
  const openPalette = useCallback(() => {
    prFetchSeq.current++;
    setPaletteOpen(true);
  }, []);
  // ⌘K: ignored while another modal or drawer is open (two focus traps would fight).
  const togglePalette = useCallback(() => {
    if (paletteOpen) setPaletteOpen(false);
    else if (!drawerOpen() && selectedPR === null) openPalette();
  }, [paletteOpen, selectedPR, openPalette]);
  const deckKeys = useMemo<DeckKeyHandlers>(() => {
    // The drawer/modal check lives in useDeckKeys (isBlocked), before any
    // preventDefault; this guard covers ⌘K's palette commands calling handlers.
    const guard = (fn: () => void) => () => {
      if (!drawerOpen()) fn();
    };
    const step = (delta: number) => {
      if (rail.length === 0) return;
      const i = rail.findIndex((t) => t.id === selectedId);
      const target = rail[(i + delta + rail.length) % rail.length].id;
      intendNav(target, delta > 0 ? "next" : "prev");
      selectTicket(target);
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
      close: guard(() => selectedTicket && closeTicket(selectedTicket.id)),
      unread: guard(() => pr && markUnread(pr.html_url)),
      // n: the next ticket after the selected one (wrapping) with unseen activity.
      nextUpdated: guard(() => {
        const after = [...rail.slice(i + 1), ...rail.slice(0, Math.max(i, 0))];
        const next = after.find((t) => t.unseen && t.id !== selectedId);
        if (next) {
          // "Next updated" always swipes forward, even when it wraps.
          intendNav(next.id, "next");
          selectTicket(next.id);
        } else showToast("Nothing new");
      }),
      toggleOnlyCurrent: guard(() => setOnlyCurrent((v) => !v)),
      // .: the inline note composer under the selected PR (or the PR-less ticket).
      note: guard(() => {
        if (!selectedTicket) return;
        if (pr) setComposer({ ticketId: selectedTicket.id, url: pr.html_url });
        else if (selectedTicket.key) setComposer({ ticketId: selectedTicket.id, url: null });
      }),
      refresh: guard(refresh),
      palette: togglePalette,
      // F / S are handled by the mode effect above.
      focusMode: noop,
      standupMode: noop,
      help: guard(() => setHelpOpen(true)),
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
    openPR,
    toggleCurrent,
    closeTicket,
    markUnread,
    showToast,
    setOnlyCurrent,
    refresh,
    togglePalette,
    intendNav,
  ]);
  useDeckKeys(deckKeys, {
    enabled: configured && mode === "focus",
    blocked: selectedPR !== null || helpOpen,
    isBlocked: drawerOpen,
  });

  // ⌘K in List View and Standup too ("from anywhere on the page"); Focus gets it from useDeckKeys.
  useEffect(() => {
    if (!configured || mode === "focus") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      togglePalette();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [configured, mode, togglePalette]);

  // ⌘K jump: reopens a closed tab, and clears `g c` if the target isn't current.
  const jumpTo = useCallback(
    (ticketId: string, prUrl: string | null) => {
      if (deck.closed.some((t) => t.id === ticketId)) {
        reopen(ticketId);
        setOnlyCurrent(false);
      } else if (onlyCurrent && !deck.current.some((t) => t.id === ticketId)) {
        setOnlyCurrent(false);
      }
      intendNav(ticketId);
      select(ticketId);
      setPrPick(prUrl ? { ticketId, url: prUrl } : null);
      setMode("focus");
    },
    [deck, onlyCurrent, reopen, select, setOnlyCurrent, setMode, intendNav],
  );

  const onPaletteAction = useCallback(
    (action: PaletteAction, r: SearchResult) => {
      const ext = r.external;
      if (ext?.kind === "ticket") {
        if (openIssue) openIssue(ext.key);
        else {
          const url = jiraBrowseUrl(jiraBaseUrl, ext.key);
          if (url) openTab(url);
        }
        return;
      }
      if (ext?.kind === "pr") {
        // Not in the deck: the one on-demand fetch the deck makes (spec §5.11).
        if (action === "jump" || action === "openModal") {
          const [owner, repo] = ext.repo.split("/");
          const seq = ++prFetchSeq.current;
          fetchPR(owner, repo, ext.number).then(
            (pr) => {
              if (seq === prFetchSeq.current) setSelectedPR(pr);
            },
            () => {
              if (seq === prFetchSeq.current) showToast("Couldn't load that PR");
            },
          );
        } else if (action === "openGitHub") openTab(ext.url);
        else if (action === "copyLink") onCopyLink(ext.url);
        return;
      }
      const id = r.ticketId;
      if (!id) return;
      const pr = r.pr;
      switch (action) {
        case "jump":
          jumpTo(id, pr?.html_url ?? null);
          break;
        case "toggleCurrent":
          if (pr) toggleCurrent(prPin(pr), id);
          else if (r.ticketKey) toggleCurrent(ticketPin(r.ticketKey), id);
          break;
        case "openModal":
          if (!pr) break;
          jumpTo(id, pr.html_url);
          openPR(pr);
          break;
        case "openGitHub":
          if (pr) openTab(pr.html_url);
          break;
        case "copyBranch":
          if (pr?.head?.ref) onCopyBranch(pr.head.ref);
          break;
        case "copyLink":
          if (pr) onCopyLink(pr.html_url);
          break;
        case "note": {
          // Jump to the card, then open the composer under that PR (or the PR-less ticket).
          const t = [...deck.current, ...deck.open, ...deck.closed].find((x) => x.id === id);
          if (!t) break;
          const url = pr?.html_url ?? (t.prs.find((p) => p.current) ?? t.prs[0])?.pr.html_url;
          if (!url && !t.key) break;
          jumpTo(id, url ?? null);
          setComposer({ ticketId: id, url: url ?? null });
          break;
        }
        case "closeReopen":
          if (deck.closed.some((t) => t.id === id)) reopenTicket(id);
          else closeTicket(id);
          break;
        case "unread":
          if (!pr) break;
          markUnread(pr.html_url);
          showToast("Marked unread");
          break;
      }
    },
    [
      deck,
      openIssue,
      jiraBaseUrl,
      showToast,
      onCopyLink,
      onCopyBranch,
      jumpTo,
      toggleCurrent,
      openPR,
      reopenTicket,
      closeTicket,
      markUnread,
    ],
  );
  // Jira mentions carry no url: show the issue in the drawer, else link to the
  // comment, else (no Jira base URL) there is nothing to open.
  const onOpenMention = useCallback(
    (m: MentionItem) => {
      if (m.source !== "Jira") {
        if (m.url) openTab(m.url);
        return;
      }
      if (m.ticketKey && openIssue) openIssue(m.ticketKey);
      else if (m.url) openTab(m.url);
      else if (m.ticketKey) {
        const url = jiraCommentUrl(jiraBaseUrl, m.ticketKey, m.id);
        if (url) openTab(url);
      }
    },
    [openIssue, jiraBaseUrl],
  );

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "next",
        label: "Next updated ticket",
        keys: "n",
        run: () => {
          setMode("focus");
          deckKeys.nextUpdated();
        },
      },
      {
        id: "only-current",
        label: onlyCurrent ? "Show all tickets" : "Show only current",
        keys: "g c",
        run: () => {
          setMode("focus");
          setOnlyCurrent((v) => !v);
        },
      },
      {
        id: "closed",
        label: closedFolded ? "Show closed" : "Hide closed",
        run: () => {
          setMode("focus");
          setClosedFolded((v) => !v);
        },
      },
      { id: "refresh", label: "Refresh", keys: "r", run: refresh },
      ...MODES.filter((m) => m !== mode).map((m) => ({
        id: m,
        label: `Switch to ${MODE_LABELS[m]}`,
        keys: MODE_KEYS[m],
        run: () => setMode(m),
      })),
      {
        id: "hints",
        label: hideHints ? "Show key hints" : "Hide key hints",
        run: () => setHideHints((v) => !v),
      },
    ],
    [
      deckKeys,
      onlyCurrent,
      closedFolded,
      hideHints,
      mode,
      refresh,
      setMode,
      setOnlyCurrent,
      setClosedFolded,
      setHideHints,
    ],
  );
  const hidePalette = useCallback(() => setPaletteOpen(false), []);
  const hideHelp = useCallback(() => setHelpOpen(false), []);
  const showClosed = useCallback(() => setClosedFolded(false), [setClosedFolded]);
  const toStandup = useCallback(() => setMode("standup"), [setMode]);
  const copyStandup = useCallback(
    () => copy(markdown, "Copied standup to clipboard"),
    [copy, markdown],
  );
  // Standup ticket lines: the Jira drawer, else the issue in a new tab.
  const openTicketKey = useCallback(
    (key: string) => {
      if (openIssue) openIssue(key);
      else {
        const url = jiraBrowseUrl(jiraBaseUrl, key);
        if (url) openTab(url);
      }
    },
    [openIssue, jiraBaseUrl],
  );

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
  // First load with nothing to show yet: skeletons instead of the empty deck.
  const firstLoad =
    !sourcesLoaded && deck.current.length + deck.open.length + deck.closed.length === 0;
  const notStartedCount =
    sections.notStarted.items.length + sections.notStarted.offSprintItems.length;
  const summary = `${deck.counts.tickets} tickets · ${deck.counts.current} current · ${deck.counts.unseen} updated`;
  const { done, workingOn, reviewing, blockers, waiting } = sections;
  const standupIncomplete =
    sourceError !== null ||
    [done, workingOn, reviewing, blockers, waiting].some((sec) => sec.error !== null);

  return (
    <CopyTicketContext.Provider value={onCopyTicket}>
      <CopyPRLinkContext.Provider value={onCopyLink}>
        <CopyBranchContext.Provider value={onCopyBranch}>
          <ViewerLoginContext.Provider value={props.githubUsername ?? ""}>
            <div className="workday-page">
              <div className="workday-header">
                <SegmentedTabs
                  className="inline-control workday-mode-toggle"
                  tabs={MODES.map((m) => ({
                    key: m,
                    label: (
                      <>
                        {MODE_LABELS[m]} <kbd>{MODE_KEYS[m]}</kbd>
                      </>
                    ),
                  }))}
                  activeKey={mode}
                  onChange={(k) => setMode(k as Mode)}
                />
                <span className="workday-date-pill">{formatSinceLabel(now)}</span>
                <span className="workday-summary">{summary}</span>
                <Button
                  variant="link"
                  size="sm"
                  className="workday-cmd-k-hint"
                  title="Find and act (⌘K)"
                  onClick={openPalette}
                >
                  ⌘K find &amp; act
                </Button>
                <div className="workday-header-spacer" />
                {mode === "list" && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={toggleCollapseAll}
                    title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
                  >
                    {allCollapsed ? <IconFoldDown size={14} /> : <IconFold size={14} />}{" "}
                    {allCollapsed ? "Expand all" : "Collapse all"}
                  </Button>
                )}
                {mode === "standup" && (
                  <>
                    <SegmentedTabs
                      className="inline-control"
                      tabs={LOOKBACKS.map((l) => ({ key: l, label: LOOKBACK_LABELS[l] }))}
                      activeKey={lookback}
                      onChange={(k) => setLookback(k as Lookback)}
                    />
                    <Button variant="primary" size="sm" onClick={copyStandup}>
                      <IconCopy size={14} /> Copy
                    </Button>
                  </>
                )}
                {/* The spinner takes the icon's place, so nothing in the row moves. */}
                <Button variant="outline-secondary" size="sm" onClick={onRefresh}>
                  {loading && hasLoadedOnce ? (
                    <Spinner
                      animation="border"
                      size="sm"
                      role="status"
                      aria-label="Refreshing"
                      className="workday-refresh-spinner"
                    />
                  ) : (
                    <IconRefresh size={14} />
                  )}{" "}
                  Refresh
                </Button>
              </div>

              {mode === "focus" ? (
                <DeckMode
                  deck={deck}
                  selectedId={selectedId}
                  onSelect={clickTicket}
                  selectedPrUrl={selectedPrUrl}
                  cardPRs={cardPRs}
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
                  swipe={swipe.dir}
                  loading={firstLoad}
                  sourceError={sourceErrorText(sourceError)}
                  onRetry={refresh}
                  notStartedCount={notStartedCount}
                  onShowClosed={showClosed}
                  onSwitchToStandup={toStandup}
                />
              ) : mode === "list" ? (
                <div className="workday-list" data-testid="workday-list">
                  <PinContext.Provider value={pinContext}>
                    <FocusMode
                      focus={focus}
                      loading={loading}
                      mentionsLoading={mentionsLoading}
                      jiraBaseUrl={jiraBaseUrl}
                      ticketTitles={ticketTitles}
                      now={now}
                      sectionToggle={sectionToggle}
                      onOpen={setSelectedPR}
                    />
                  </PinContext.Provider>
                </div>
              ) : (
                <StandupSheet
                  groups={groups}
                  sinceLabel={sinceLabel}
                  loading={loading}
                  doneLoading={done.loading}
                  incomplete={standupIncomplete}
                  onOpenPR={setSelectedPR}
                  onOpenTicket={openTicketKey}
                  note={{
                    now,
                    notes,
                    notesLoaded,
                    addNote,
                    editNote,
                    onChange: setNoteText,
                  }}
                />
              )}

              {mode === "focus" && !hideHints && (
                // "? all keys" leads: the bar clips on the right, so it must never be the one cut.
                <div className="deck-hints" data-testid="deck-hints">
                  <span>
                    <kbd>?</kbd> all keys
                  </span>
                  <span>
                    <kbd>←→</kbd> back/skip
                  </span>
                  <span>
                    <kbd>↑↓</kbd> pick PR
                  </span>
                  <span>
                    <kbd>Space</kbd> current
                  </span>
                  <span>
                    <kbd>⏎</kbd> open
                  </span>
                  <span>
                    <kbd>.</kbd> note
                  </span>
                  <span>
                    <kbd>x</kbd> close
                  </span>
                  <span>
                    <kbd>n</kbd> next updated
                  </span>
                  <span>
                    <kbd>⌘K</kbd> find
                  </span>
                </div>
              )}

              <ShortcutSheet show={helpOpen} onHide={hideHelp} />

              <PRDetailModal
                pr={selectedPR}
                onHide={() => setSelectedPR(null)}
                jiraBaseUrl={jiraBaseUrl}
              />

              <CommandPalette
                show={paletteOpen}
                onHide={hidePalette}
                deck={deck}
                commands={paletteCommands}
                onAction={onPaletteAction}
                onOpenMention={onOpenMention}
              />

              <Toast message={toast.message} visible={toast.visible} />
            </div>
          </ViewerLoginContext.Provider>
        </CopyBranchContext.Provider>
      </CopyPRLinkContext.Provider>
    </CopyTicketContext.Provider>
  );
}
