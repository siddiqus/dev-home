import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Modal from "react-bootstrap/Modal";
import { Badge } from "../../components/primitives/Badge";
import type { MentionItem } from "../workday/types";
import { searchDeck, type SearchResult } from "./deckSearch";
import type { DeckData, DeckTicket } from "./types";

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

/** A command in the empty-query "Commands" group. */
export interface PaletteCommand {
  id: string;
  label: string;
  /** The deck shortcut shown beside it, e.g. "g c". */
  keys?: string;
  run(): void;
}

type Entry =
  | { kind: "result"; id: string; result: SearchResult }
  | { kind: "mention"; id: string; mention: MentionItem }
  | { kind: "command"; id: string; command: PaletteCommand };

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
 * lists what's new plus commands; typing searches the deck (and pasted links).
 * Each result lists its actions underneath, each with a shortcut.
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
  const closeThen = (fn: () => void) => {
    pending.current = fn;
    setRestoreFocus(false);
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
          if (CLOSES.has(action)) closeThen(() => onAction(action, result));
          else onAction(action, result);
        }}
        onCommand={(command) => closeThen(command.run)}
        onOpenMention={(mention) => closeThen(() => onOpenMention(mention))}
      />
    </Modal>
  );
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** "Updated since you looked": unseen PRs and tickets, plus unmatched mentions, newest first. */
function updatedEntries(deck: DeckData): Entry[] {
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
            label: `#${p.pr.number} ${p.pr.title}`,
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
  return dated.sort((a, b) => b.at - a.at).map((d) => d.entry);
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
  const [active, setActive] = useState(0);
  // Tab moves between the results and the selected result's actions.
  const [zone, setZone] = useState<"results" | "actions">("results");
  const [actionIndex, setActionIndex] = useState(0);
  const queryEmpty = query.trim() === "";

  const sections = useMemo<Section[]>(() => {
    if (queryEmpty) {
      return [
        {
          label: "Updated since you looked",
          entries: updatedEntries(deck),
          empty: "Nothing new since you looked",
        },
        {
          label: "Commands",
          entries: commands.map((c) => ({ kind: "command", id: `c:${c.id}`, command: c })),
        },
      ];
    }
    const results = searchDeck(query, deck).map<Entry>((r, i) => ({
      kind: "result",
      id: `r:${i}`,
      result: r,
    }));
    return [{ label: "Results", entries: results, empty: "No matches" }];
  }, [query, queryEmpty, deck, commands]);

  const entries = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
  const index = Math.min(active, Math.max(entries.length - 1, 0));
  const current = entries[index] ?? null;
  const actions = current?.kind === "result" ? actionsFor(current.result, queryEmpty) : [];
  const inActions = zone === "actions" && actions.length > 0;
  const actionAt = Math.min(actionIndex, Math.max(actions.length - 1, 0));

  // Live lookups so badges follow toggles made while the palette is open.
  const tickets = useMemo(() => {
    const map = new Map<string, DeckTicket>();
    for (const t of [...deck.current, ...deck.open, ...deck.closed]) map.set(t.id, t);
    return map;
  }, [deck]);
  const closedIds = useMemo(() => new Set(deck.closed.map((t) => t.id)), [deck]);

  const optionId = (i: number) => `${uid}-opt-${i}`;
  const actionId = (i: number) => `${uid}-act-${i}`;
  const activeId = current ? (inActions ? actionId(actionAt) : optionId(index)) : undefined;

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  const moveTo = (i: number) => {
    setActive(i);
    setZone("results");
    setActionIndex(0);
  };

  const runPrimary = (entry: Entry) => {
    if (entry.kind === "command") onCommand(entry.command);
    else if (entry.kind === "mention") onOpenMention(entry.mention);
    else if (actionsFor(entry.result, queryEmpty).some((a) => a.action === "jump"))
      onAction("jump", entry.result);
  };
  const runAction = (action: PaletteAction) => {
    if (current?.kind !== "result") return;
    if (!actions.some((a) => a.action === action)) return;
    onAction(action, current.result);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const key = e.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      e.preventDefault();
      const delta = key === "ArrowDown" ? 1 : -1;
      if (inActions) {
        setActionIndex(Math.min(Math.max(actionAt + delta, 0), actions.length - 1));
      } else if (entries.length > 0) {
        moveTo((index + delta + entries.length) % entries.length);
      }
      return;
    }
    if (key === "Tab") {
      e.preventDefault();
      if (inActions) setZone("results");
      else if (actions.length > 0) {
        setZone("actions");
        setActionIndex(0);
      }
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
      if (inActions) runAction(actions[actionAt].action);
      else if (current) runPrimary(current);
      return;
    }
    if (inActions && key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Plain b / l in the actions row: a fallback for browsers that reserve
      // ⌘B / ⌘L (spec §11). Any other key goes back to typing the query.
      const lower = key.toLowerCase();
      if (lower === "b" || lower === "l") {
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
          moveTo(0);
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
                <div key={entry.id} role="presentation">
                  <div
                    role="option"
                    id={optionId(i)}
                    aria-selected={selected && !inActions}
                    className={`deck-palette-option${selected ? " deck-palette-option--active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => !selected && moveTo(i)}
                    onClick={() => runPrimary(entry)}
                  >
                    {renderEntry(entry, tickets, closedIds)}
                  </div>
                  {selected && actions.length > 0 && (
                    <div className="deck-palette-actions" role="presentation">
                      {actions.map((a, j) => (
                        <div
                          key={a.action}
                          role="option"
                          id={actionId(j)}
                          aria-selected={inActions && j === actionAt}
                          className={`deck-palette-action${inActions && j === actionAt ? " deck-palette-action--active" : ""}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => runAction(a.action)}
                        >
                          <span>{a.label}</span>
                          <kbd>{a.keys}</kbd>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="deck-palette-footer">↑↓ move · ⏎ jump · Tab actions · esc close</div>
    </div>
  );
}

function renderEntry(
  entry: Entry,
  tickets: Map<string, DeckTicket>,
  closedIds: Set<string>,
): ReactNode {
  if (entry.kind === "command") {
    return (
      <>
        <span className="deck-palette-label">{entry.command.label}</span>
        {entry.command.keys && <kbd>{entry.command.keys}</kbd>}
      </>
    );
  }
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
