import type { ReactNode } from "react";
import type { Ref } from "../../../types/teams";
import { refLabel } from "./refLookup";

interface Props {
  item: Ref;
  title?: string | null;
  /** Right-aligned detail: who, and for how long. */
  meta?: ReactNode;
  onOpen?: (ref: Ref) => void;
}

/** One clickable cockpit item: key · title · meta, on a single line. */
export function RefRow({ item, title, meta, onOpen }: Props) {
  return (
    <button type="button" className="cockpit-ref-row" onClick={() => onOpen?.(item)}>
      <span className="cockpit-ref-row__key">{refLabel(item)}</span>
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
