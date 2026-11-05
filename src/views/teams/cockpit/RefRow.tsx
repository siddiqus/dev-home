import type { ReactNode } from "react";
import type { IssueTypeInfo, Ref } from "../../../types/teams";
import { IssueTypeIcon } from "../../../components/IssueTypeIcon";
import { refLabel } from "./refLookup";

interface Props {
  item: Ref;
  title?: string | null;
  /** Ticket rows: Jira's Bug/Task/Story icon, shown before the key. */
  issueType?: IssueTypeInfo | null;
  /** Right-aligned detail: who, and for how long. */
  meta?: ReactNode;
  onOpen?: (ref: Ref) => void;
}

/** One clickable cockpit item: [type icon] key · title · meta, on a single line. */
export function RefRow({ item, title, issueType, meta, onOpen }: Props) {
  return (
    <button type="button" className="cockpit-ref-row" onClick={() => onOpen?.(item)}>
      <span className="cockpit-ref-row__key">
        <IssueTypeIcon type={issueType} className="cockpit-ref-row__type" />
        {refLabel(item)}
      </span>
      <span className="cockpit-ref-row__title" title={title ?? undefined}>
        {title}
      </span>
      {meta != null && <span className="cockpit-ref-row__meta">{meta}</span>}
    </button>
  );
}

/** A name in a row's meta, truncated so long names don't squeeze the title. */
export function Who({ name }: { name: string }) {
  return (
    <span className="cockpit-ref-row__who" title={name}>
      {name}
    </span>
  );
}
