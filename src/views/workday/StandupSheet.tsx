import type { ReactNode } from "react";
import { IconAlertTriangle, IconHistory, IconSun } from "@tabler/icons-react";
import { Badge } from "../../components/primitives/Badge";
import type { GitHubPR } from "../../types";
import { standupRef } from "./dates";
import { repoRef } from "./prState";
import { useStandupNote, type StandupNoteOptions } from "./StandupNotes";
import type { StandupGroup, StandupGroups, StandupItem } from "./standupModel";

export interface StandupSheetProps {
  groups: StandupGroups;
  /** Start of the lookback window, e.g. "Tue 13 Oct". */
  sinceLabel: string;
  /** Today / Blockers sources still loading. */
  loading: boolean;
  /** The Done-since fetch (Yesterday) still loading. */
  doneLoading: boolean;
  /** Some source failed, so the sheet may be incomplete. */
  incomplete: boolean;
  onOpenPR(pr: GitHubPR): void;
  onOpenTicket(key: string): void;
  /** Today's note: its lines are the Blockers you add yourself. */
  note: StandupNoteOptions;
}

/**
 * Standup as a crib sheet: Yesterday / Today / Blockers, each grouped by
 * action (Merged, Moved to Done, Reviewed…), the same groups the Copy button
 * puts on the clipboard. Rows open their PR or ticket; the note box under
 * Blockers adds your own lines.
 */
export function StandupSheet({
  groups,
  sinceLabel,
  loading,
  doneLoading,
  incomplete,
  onOpenPR,
  onOpenTicket,
  note,
}: StandupSheetProps) {
  const open = (item: StandupItem) => {
    if (item.target.kind === "pr") onOpenPR(item.target.pr);
    else onOpenTicket(item.target.key);
  };
  const body = (list: StandupGroup[], empty: string, isLoading: boolean) =>
    list.length === 0 ? (
      <p className="standup-sheet-empty">{isLoading ? "Loading…" : empty}</p>
    ) : (
      list.map((g) => <Group key={g.id} group={g} onOpen={open} />)
    );

  return (
    <div className="standup-sheet" data-testid="standup-sheet">
      <div className="standup-sheet-body">
        {incomplete && (
          <p className="standup-sheet-warning">Some data failed to load; this may be incomplete.</p>
        )}
        <Section
          id="standup-yesterday"
          tone="yesterday"
          icon={<IconHistory size={16} />}
          title="Yesterday"
          aside={`since ${sinceLabel}`}
        >
          {body(groups.yesterday, "Nothing merged, reviewed or moved", doneLoading)}
        </Section>
        <Section id="standup-today" tone="today" icon={<IconSun size={16} />} title="Today">
          {body(groups.today, "Nothing in progress", loading)}
        </Section>
        <Section
          id="standup-blockers"
          tone="blockers"
          icon={<IconAlertTriangle size={16} />}
          title="Blockers"
        >
          {groups.blockers.map((g) => (
            <Group key={g.id} group={g} onOpen={open} />
          ))}
          <StandupNoteInput key={standupRef(note.now)} {...note} />
        </Section>
      </div>
    </div>
  );
}

function Section(props: {
  id: string;
  tone: "yesterday" | "today" | "blockers";
  icon: ReactNode;
  title: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`standup-sheet-section standup-sheet-section--${props.tone}`}
      aria-labelledby={props.id}
    >
      <h3 id={props.id} className="standup-sheet-heading">
        <span className="standup-sheet-heading-icon" aria-hidden>
          {props.icon}
        </span>
        {props.title}
        {props.aside && <span className="standup-sheet-since">{props.aside}</span>}
      </h3>
      {props.children}
    </section>
  );
}

function Group({ group, onOpen }: { group: StandupGroup; onOpen(item: StandupItem): void }) {
  return (
    <div
      className={`standup-group standup-group--${group.tone}`}
      data-testid={`standup-group-${group.id}`}
    >
      <div className="standup-group-label">
        <span className="standup-group-dot" aria-hidden />
        {group.label}
        <span className="standup-group-count">{group.items.length}</span>
      </div>
      <ul className="standup-group-items">
        {group.items.map((item) => (
          <li key={item.id}>
            <button type="button" className="standup-row" onClick={() => onOpen(item)}>
              {item.ticketKey && <span className="standup-row-key">{item.ticketKey}</span>}
              <span className="standup-row-title">{item.title}</span>
              {item.prs.map((pr) => (
                <PRRef key={pr.html_url} pr={pr} />
              ))}
              {item.tag && <Badge variant={item.tag.tone}>{item.tag.text}</Badge>}
              {item.offSprint && <Badge variant="warning">off-sprint</Badge>}
              {item.detail && <span className="standup-row-detail">{item.detail}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** repo#number, the repo muted like the deck's PR rows. */
function PRRef({ pr }: { pr: GitHubPR }) {
  const ref = repoRef(pr);
  const cut = ref.lastIndexOf("#");
  return (
    <span className="standup-row-pr" title={pr.repo_full_name}>
      <span className="standup-row-repo">{ref.slice(0, cut)}</span>
      {ref.slice(cut)}
    </span>
  );
}

/** Your own Blockers lines, autosaved to today's standup note. */
function StandupNoteInput(props: StandupNoteOptions) {
  const { text, onChange, saveError } = useStandupNote(props);
  return (
    <>
      <textarea
        className="standup-sheet-note"
        aria-label="Your blockers and notes"
        placeholder="+ Add a blocker or anything to raise (one per line)"
        rows={Math.max(2, text.split("\n").length + 1)}
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
      {saveError && (
        <p className="standup-sheet-warning">Couldn't save to Notes; will retry on next edit</p>
      )}
    </>
  );
}
