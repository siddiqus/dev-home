import { useState } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import type { Hygiene, Ref } from "../../../types/teams";
import { RefRow, Who } from "./RefRow";
import { refKey, type RefLookup } from "./refLookup";

interface Props {
  hygiene: Hygiene;
  lookup: RefLookup;
  onOpenRef?: (ref: Ref) => void;
}

const ROWS: { key: keyof Hygiene; label: string }[] = [
  { key: "failingCI", label: "Failing CI" },
  { key: "unassigned", label: "Unassigned" },
  { key: "jiraNoPR", label: "In progress without a PR" },
  { key: "prNoJira", label: "PRs without Jira" },
  { key: "mergedNotDone", label: "Merged but not done" },
  { key: "doneNoMerged", label: "Done without merged PR" },
  { key: "noEpic", label: "No epic" },
  { key: "addedMidSprint", label: "Added mid-sprint" },
];

export function DeliveryHygiene({ hygiene, lookup, onOpenRef }: Props) {
  const [expanded, setExpanded] = useState<Set<keyof Hygiene>>(new Set());

  const rows = ROWS.filter((r) => hygiene[r.key].length > 0);

  const toggle = (key: keyof Hygiene) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Issues show their assignee (or status when nobody has it), PRs their author.
  const describe = (ref: Ref) => {
    if (ref.kind === "pr") {
      const pr = lookup.pr(ref.repo, ref.number);
      return pr ? { title: pr.title, meta: <Who name={`@${pr.author}`} /> } : {};
    }
    const issue = lookup.issue(ref.key);
    if (!issue) return {};
    return {
      title: issue.summary,
      meta: issue.assigneeName ? <Who name={issue.assigneeName} /> : issue.status,
    };
  };

  return (
    <div className="border rounded p-3">
      <div className="h6 mb-3">Delivery Hygiene</div>
      {rows.length === 0 ? (
        <div className="text-muted small">All linked up — no hygiene issues.</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {rows.map((row) => {
            const refs = hygiene[row.key];
            const isOpen = expanded.has(row.key);
            return (
              <div key={row.key}>
                <button
                  type="button"
                  className="cockpit-hygiene-toggle"
                  aria-expanded={isOpen}
                  onClick={() => toggle(row.key)}
                >
                  {isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  <span className="flex-fill">{row.label}</span>
                  <span className="badge rounded-pill bg-secondary">{refs.length}</span>
                </button>
                {isOpen && (
                  <div className="cockpit-hygiene-items">
                    {refs.map((ref) => (
                      <RefRow key={refKey(ref)} item={ref} {...describe(ref)} onOpen={onOpenRef} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
