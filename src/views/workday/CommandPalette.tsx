import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Modal from "react-bootstrap/Modal";
import { Badge } from "../../components/primitives/Badge";
import { repoRef } from "./prState";
import type { MentionItem } from "./types";
import { searchDeck, type SearchResult } from "./deckSearch";
import type { DeckData, DeckTicket } from "./deckTypes";

/** Actions on a selected result (spec §5.11 table). */
export type PaletteAction =
  | "jump"
  | "toggleCurrent"
  | "openModal"
  | "openGitHub"
  | "copyBranch"
  | "copyLink"
  | "note"
  | "closeReopen"
  | "unread";

/** A command in the palette's always-visible Commands row. */
export interface PaletteCommand {
  id: string;
  label: string;
  /** The deck shortcut shown beside it, e.g. "g c". */
  keys?: string;
  run(): void;
}

type Entry =
  | { kind: "result"; id: string; result: SearchResult }
  | { kind: "mention"; id: string; mention: MentionItem };

/** A chip in the bottom tray: an action on the selected row, or a command. */
interface Chip {
  id: string;
  label: string;
  keys?: string;
  run(): void;
}

type Zone = "results" | "actions" | "commands";

interface Section {
  label: string;
  entries: Entry[];
  empty?: string;
}

/** Unmatched mentions shown in "Updated since you looked", newest first. */
export const UNMATCHED_CAP = 10;

/** Actions that hand off to the deck (or a modal) and so close the palette first. */
const CLOSES: ReadonlySet<PaletteAction> = new Set([
  "jump",
  "openModal",
  "openGitHub",
  "copyBranch",
  "copyLink",
  "note",
]);

/**
 * Whether closing for this action should restore focus. Opening the PR modal,
 * the note composer, or an outside PR / ticket (modal or Jira drawer) moves
 * focus on its own, so restoring would fight it.
 */
function restoresFocus(action: PaletteAction, result: SearchResult): boolean {
  if (action === "openModal" || action === "note") return false;
  if (action === "jump" && result.external) return false;
  return true;
}

export interface CommandPaletteProps {
  show: boolean;
  onHide(): void;
  deck: DeckData;
  commands: PaletteCommand[];
  /** Runs an action on a result. Closing actions run after the palette has gone. */
  onAction(action: PaletteAction, result: SearchResult): void;
  onOpenMention(mention: MentionItem): void;
}

/**
 * ⌘K: find and act (spec §5.11). A combobox over the deck: the empty query
 * lists what's new; typing searches the deck (and pasted links). A tray at the
 * bottom always shows the selected row's actions and the commands as chips.
 */
export function CommandPalette({
  show,
  onHide,
  deck,
  commands,
  onAction,
  onOpenMention,
}: CommandPaletteProps) {
  // Work that needs the palette gone first (opening a modal, focusing the note
  // composer) waits for the modal to exit, so focus traps never fight.
  const pending = useRef<(() => void) | null>(null);
  const [restoreFocus, setRestoreFocus] = useState(true);
  useEffect(() => {
    if (show) setRestoreFocus(true);
  }, [show]);
  // `restore`: hand focus back to where it was when the palette opened. Off
  // only when the follow-up takes focus itself (a modal, the drawer, the note
  // composer); copy, GitHub, commands and mentions leave the user where they were.
  const closeThen = (fn: () => void, restore = true) => {
    pending.current = fn;
    setRestoreFocus(restore);
    onHide();
  };
  const onExited = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      onExited={onExited}
      animation={false}
      restoreFocus={restoreFocus}
      className="deck-palette"
      dialogClassName="deck-palette-dialog"
      aria-label="Find and act"
    >
      <PaletteBody
        deck={deck}
        commands={commands}
        onAction={(action, result) => {
          if (CLOSES.has(action))
            closeThen(() => onAction(action, result), restoresFocus(action, result));
          else onAction(action, result);
        }}
        onCommand={(command) => closeThen(command.run)}
        onOpenMention={(mention) => closeThen(() => onOpenMention(mention))}
      />
    </Modal>
  );
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

interface Dated {
  at: number;
  entry: Entry;
}

/** "Updated since you looked": unseen PRs and tickets, plus unmatched mentions, newest first. */
function updatedEntries(deck: DeckData): Dated[] {
  const dated: { at: number; entry: Entry }[] = [];
  for (const t of [...deck.current, ...deck.open]) {
    const unseen = t.prs.filter((p) => p.unseen);
    for (const p of unseen) {
      dated.push({
        at: time(p.pr.updated_at),
        entry: {
          kind: "result",
          id: `u:${p.pr.html_url}`,
          result: {
            ticketId: t.id,
            pr: p.pr,
            ticketKey: t.key,
            label: `${repoRef(p.pr)} ${p.pr.title}`,
            sub: t.key ? `${t.key} · ${t.title}` : "",
            closed: false,
            score: 0,
          },
        },
      });
    }
    // A ticket lit only by a Jira mention.
    if (t.unseen && unseen.length === 0) {
      dated.push({
        at: time(t.jiraMention?.at),
        entry: {
          kind: "result",
          id: `u:${t.id}`,
          result: {
            ticketId: t.id,
            pr: null,
            ticketKey: t.key,
            label: t.key ? `${t.key} ${t.title}` : t.title,
            sub: t.jiraMention ? `${t.jiraMention.who}: ${t.jiraMention.snippet}` : "",
            closed: false,
            score: 0,
          },
        },
      });
    }
  }
  const mentions = [...deck.unmatched].sort((a, b) => time(b.at) - time(a.at));
  for (const m of mentions.slice(0, UNMATCHED_CAP)) {
    dated.push({ at: time(m.at), entry: { kind: "mention", id: `m:${m.id}`, mention: m } });
  }
  return dated.sort((a, b) => b.at - a.at);
}

interface ActionDef {
  action: PaletteAction;
  label: string;
  keys: string;
}

/** The actions a result supports, in the spec table's order. */
function actionsFor(r: SearchResult, queryEmpty: boolean): ActionDef[] {
  const ext = r.external;
  if (ext) {
    if (ext.kind === "ticket") return [{ action: "jump", label: "Open in Jira drawer", keys: "⏎" }];
    return [
      { action: "jump", label: "Open PR", keys: "⏎" },
      { action: "openModal", label: "Open PR (modal)", keys: "⌥⏎" },
      { action: "openGitHub", label: "Open on GitHub", keys: "⌘⏎" },
      { action: "copyLink", label: "Copy PR link", keys: "⌘L" },
    ];
  }
  if (!r.ticketId) return [];
  const canPin = !r.closed && (r.pr !== null || r.ticketKey !== null);
  const list: (ActionDef | false)[] = [
    { action: "jump", label: "Jump to card", keys: "⏎" },
    canPin && {
      action: "toggleCurrent",
      label: "Toggle “I'm on it”",
      keys: queryEmpty ? "Space" : "⌘⇧Space",
    },
    r.pr !== null && { action: "openModal", label: "Open PR (modal)", keys: "⌥⏎" },
    r.pr !== null && { action: "openGitHub", label: "Open on GitHub", keys: "⌘⏎" },
    !!r.pr?.head?.ref && { action: "copyBranch", label: "Copy branch name", keys: "⌘B" },
    r.pr !== null && { action: "copyLink", label: "Copy PR link", keys: "⌘L" },
    (r.pr !== null || r.ticketKey !== null) && { action: "note", label: "Add note…", keys: "⌘." },
    {
      action: "closeReopen",
      label: r.closed ? "Reopen tab" : "Close tab",
      keys: "⌘⌫",
    },
    r.pr !== null && { action: "unread", label: "Mark unread", keys: "⌘U" },
  ];
  return list.filter((a): a is ActionDef => a !== false);
}

/** The ⌘/Ctrl shortcut (or ⌥⏎) for an action, from a keydown. */
function shortcutOf(e: KeyboardEvent, queryEmpty: boolean): PaletteAction | null {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === "Enter" && e.altKey && !mod) return "openModal";
  if (key === "Enter" && mod && !e.altKey) return "openGitHub";
  if (key === " " && mod && e.shiftKey) return "toggleCurrent";
  if (key === " " && !mod && !e.altKey && !e.shiftKey && queryEmpty) return "toggleCurrent";
  if (!mod || e.altKey || e.shiftKey) return null;
  if (key === "b") return "copyBranch";
  if (key === "l") return "copyLink";
  if (key === ".") return "note";
  if (key === "Backspace") return "closeReopen";
  if (key === "u") return "unread";
  return null;
}

let paletteSeq = 0;

function PaletteBody({
  deck,
  commands,
  onAction,
  onCommand,
  onOpenMention,
}: {
  deck: DeckData;
  commands: PaletteCommand[];
  onAction(action: PaletteAction, result: SearchResult): void;
  onCommand(command: PaletteCommand): void;
  onOpenMention(mention: MentionItem): void;
}) {
  const [uid] = useState(() => `deck-palette-${++paletteSeq}`);
  const [query, setQuery] = useState("");
  // Selection follows the entry id, so a row that moves keeps it; the index
  // is the fallback when that entry is gone.
  const [active, setActive] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Tab cycles the results, the selected row's actions and the commands.
  const [zone, setZone] = useState<Zone>("results");
  const [chipIndex, setChipIndex] = useState(0);
  const queryEmpty = query.trim() === "";

  // Rows closed (⌘⌫) from "Updated since you looked" stay listed, in place,
  // until the query changes or the palette closes: otherwise the selection
  // would slide to the neighbour and a second ⌘⌫ would close that instead.
  const shown = useRef(new Map<string, Dated>());
  const sections = useMemo<Section[]>(() => {
    if (queryEmpty) {
      const fresh = updatedEntries(deck);
      const freshIds = new Set(fresh.map((d) => d.entry.id));
      const closedNow = new Set(deck.closed.map((t) => t.id));
      const kept = [...shown.current.values()].filter(
        (d) =>
          !freshIds.has(d.entry.id) &&
          d.entry.kind === "result" &&
          d.entry.result.ticketId !== null &&
          closedNow.has(d.entry.result.ticketId),
      );
      const updated = [...fresh, ...kept].sort((a, b) => b.at - a.at);
      shown.current = new Map(updated.map((d) => [d.entry.id, d]));
      return [
        {
          label: "Updated since you looked",
          entries: updated.map((d) => d.entry),
          empty: "Nothing new since you looked",
        },
      ];
    }
    shown.current = new Map();
    const results = searchDeck(query, deck).map<Entry>((r, i) => ({
      kind: "result",
      id: `r:${i}`,
      result: r,
    }));
    return [{ label: "Results", entries: results, empty: "No matches" }];
  }, [query, queryEmpty, deck]);

  const entries = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
  const keyed = activeKey === null ? -1 : entries.findIndex((e) => e.id === activeKey);
  const index = keyed !== -1 ? keyed : Math.min(active, Math.max(entries.length - 1, 0));
  const current = entries[index] ?? null;
  const closedIds = useMemo(() => new Set(deck.closed.map((t) => t.id)), [deck]);
  // Closed state is read live, so a row closed or reopened here offers the other action.
  const currentResult =
    current?.kind === "result"
      ? {
          ...current.result,
          closed: current.result.ticketId ? closedIds.has(current.result.ticketId) : false,
        }
      : null;
  const actions = currentResult ? actionsFor(currentResult, queryEmpty) : [];
  const runAction = (action: PaletteAction) => {
    if (!currentResult) return;
    if (!actions.some((a) => a.action === action)) return;
    onAction(action, currentResult);
  };
  const actionChips: Chip[] =
    current?.kind === "mention"
      ? [
          {
            id: "open",
            label: "Open comment",
            keys: "⏎",
            run: () => onOpenMention(current.mention),
          },
        ]
      : actions.map((a) => ({ id: a.action, ...a, run: () => runAction(a.action) }));
  const commandChips: Chip[] = commands.map((c) => ({ ...c, run: () => onCommand(c) }));
  const zones: Zone[] = ["results"];
  if (actionChips.length > 0) zones.push("actions");
  if (commandChips.length > 0) zones.push("commands");
  const zoneNow: Zone = zones.includes(zone) ? zone : "results";
  const chips = zoneNow === "actions" ? actionChips : zoneNow === "commands" ? commandChips : [];
  const chipAt = Math.min(chipIndex, Math.max(chips.length - 1, 0));

  // Live lookups so badges follow toggles made while the palette is open.
  const tickets = useMemo(() => {
    const map = new Map<string, DeckTicket>();
    for (const t of [...deck.current, ...deck.open, ...deck.closed]) map.set(t.id, t);
    return map;
  }, [deck]);

  const optionId = (i: number) => `${uid}-opt-${i}`;
  const chipId = (z: Zone, i: number) => `${uid}-${z}-${i}`;
  const activeId =
    zoneNow !== "results" ? chipId(zoneNow, chipAt) : current ? optionId(index) : undefined;

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  const moveTo = (i: number, key: string | null = entries[i]?.id ?? null) => {
    setActive(i);
    setActiveKey(key);
    setZone("results");
    setChipIndex(0);
  };

  const runPrimary = (entry: Entry) => {
    if (entry.kind === "mention") onOpenMention(entry.mention);
    else if (actionsFor(entry.result, queryEmpty).some((a) => a.action === "jump"))
      onAction("jump", entry.result);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const key = e.key;
    const inChips = zoneNow !== "results";
    // ←→ (and ↑↓) walk a chip row; in the results, ←→ stay with the input.
    if (
      inChips &&
      (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown")
    ) {
      e.preventDefault();
      const delta = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
      setChipIndex((chipAt + delta + chips.length) % chips.length);
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      e.preventDefault();
      const delta = key === "ArrowDown" ? 1 : -1;
      if (entries.length > 0) moveTo((index + delta + entries.length) % entries.length);
      return;
    }
    if (key === "Tab") {
      e.preventDefault();
      const step = e.shiftKey ? -1 : 1;
      setZone(zones[(zones.indexOf(zoneNow) + step + zones.length) % zones.length]);
      setChipIndex(0);
      return;
    }
    const shortcut = shortcutOf(e, queryEmpty);
    if (shortcut) {
      // ⌘⌫ only steals the key when there's a tab to close; otherwise it edits the query.
      if (shortcut === "closeReopen" && !actions.some((a) => a.action === "closeReopen")) return;
      e.preventDefault();
      runAction(shortcut);
      return;
    }
    if (key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (inChips) chips[chipAt]?.run();
      else if (current) runPrimary(current);
      return;
    }
    if (inChips && key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Plain b / l in the actions row: a fallback for browsers that reserve
      // ⌘B / ⌘L (spec §11). Any other key goes back to typing the query.
      const lower = key.toLowerCase();
      if (zoneNow === "actions" && (lower === "b" || lower === "l")) {
        e.preventDefault();
        runAction(lower === "b" ? "copyBranch" : "copyLink");
        return;
      }
      setZone("results");
    }
  };

  let flat = 0;
  const listId = `${uid}-list`;
  return (
    <div className="deck-palette-body">
      <input
        type="text"
        className="form-control deck-palette-input"
        role="combobox"
        aria-label="Find a ticket, PR or command"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        placeholder="Find a ticket, PR, person or paste a link…"
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          moveTo(0, null);
        }}
        onKeyDown={onKeyDown}
      />
      <div className="deck-palette-list" role="listbox" id={listId} aria-label="Results">
        {sections.map((section) => (
          <div key={section.label} role="group" aria-label={section.label}>
            <div className="deck-palette-heading" aria-hidden="true">
              {section.label}
            </div>
            {section.entries.length === 0 && section.empty && (
              <div className="deck-palette-empty">{section.empty}</div>
            )}
            {section.entries.map((entry) => {
              const i = flat++;
              const selected = i === index;
              return (
                <div
                  key={entry.id}
                  role="option"
                  id={optionId(i)}
                  aria-selected={selected && zoneNow === "results"}
                  className={`deck-palette-option${selected ? " deck-palette-option--active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runPrimary(entry)}
                >
                  {renderEntry(entry, tickets, closedIds)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="deck-palette-tray">
        <ChipRow
          label="Actions"
          className="deck-palette-action"
          chips={actionChips}
          empty="Select a result to act on it"
          activeIndex={zoneNow === "actions" ? chipAt : -1}
          chipId={(j) => chipId("actions", j)}
        />
        <ChipRow
          label="Commands"
          className="deck-palette-command"
          chips={commandChips}
          activeIndex={zoneNow === "commands" ? chipAt : -1}
          chipId={(j) => chipId("commands", j)}
        />
      </div>
      <div className="deck-palette-footer">
        ↑↓ move · ⏎ open · Tab actions, commands · esc close
      </div>
    </div>
  );
}

/**
 * One tray row: a flat, wrapping run of chips. Always rendered (even empty) so
 * the tray keeps its height as the selection moves.
 */
function ChipRow({
  label,
  className,
  chips,
  empty,
  activeIndex,
  chipId,
}: {
  label: string;
  className: string;
  chips: Chip[];
  /** Muted text while there are no chips. */
  empty?: string;
  activeIndex: number;
  chipId(i: number): string;
}) {
  return (
    <div className="deck-palette-chips" role="listbox" aria-label={label}>
      <span className="deck-palette-chips-label" aria-hidden="true">
        {label}
      </span>
      <div className="deck-palette-chip-list" role="presentation">
        {chips.length === 0 && <span className="deck-palette-chips-empty">{empty}</span>}
        {chips.map((c, j) => (
          <div
            key={c.id}
            role="option"
            id={chipId(j)}
            aria-selected={j === activeIndex}
            className={`deck-palette-chip ${className}${j === activeIndex ? " deck-palette-chip--active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={c.run}
          >
            <span>{c.label}</span>
            {c.keys && <kbd>{c.keys}</kbd>}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderEntry(
  entry: Entry,
  tickets: Map<string, DeckTicket>,
  closedIds: Set<string>,
): ReactNode {
  if (entry.kind === "mention") {
    const m = entry.mention;
    return (
      <>
        <span className="deck-palette-text">
          <span className="deck-palette-label">
            {m.who} on {m.where}
          </span>
          <span className="deck-palette-sub">{m.snippet}</span>
        </span>
        <Badge variant="neutral">{m.source}</Badge>
      </>
    );
  }
  const r = entry.result;
  const ticket = r.ticketId ? tickets.get(r.ticketId) : undefined;
  const closed = r.ticketId ? closedIds.has(r.ticketId) : false;
  const current = r.pr
    ? (ticket?.prs.find((p) => p.pr.html_url === r.pr?.html_url)?.current ?? false)
    : (ticket?.current ?? false);
  return (
    <>
      <span className="deck-palette-text">
        <span className="deck-palette-label">{r.label}</span>
        {r.sub && <span className="deck-palette-sub">{r.sub}</span>}
      </span>
      {current && !closed && <Badge variant="warning">current</Badge>}
      {closed && <Badge variant="neutral">closed</Badge>}
      {r.external && <Badge variant="info">not in deck</Badge>}
    </>
  );
}
