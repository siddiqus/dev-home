import {
  IconBolt,
  IconBookmark,
  IconBug,
  IconCheck,
  IconCircleDot,
  IconSubtask,
  type Icon,
} from "@tabler/icons-react";
import "./IssueTypeIcon.css";

interface Props {
  type: { name: string | null } | null | undefined;
  size?: number;
  className?: string;
}

interface Look {
  color: string;
  Glyph: Icon;
}

const SUBTASK: Look = { color: "#4bade8", Glyph: IconSubtask };

/** Jira's colour for each common type, keyed by lowercased name. */
const LOOKS: Record<string, Look> = {
  bug: { color: "#e5493a", Glyph: IconBug },
  story: { color: "#63ba3c", Glyph: IconBookmark },
  task: { color: "#4bade8", Glyph: IconCheck },
  "sub-task": SUBTASK,
  subtask: SUBTASK,
  epic: { color: "#904ee2", Glyph: IconBolt },
};

const OTHER: Look = { color: "#8993a4", Glyph: IconCircleDot };

/**
 * An issue type (Bug, Task, Story…) as a small coloured tile with a white
 * glyph, as in Jira. Drawn here because Jira's own icon images need a Jira
 * login the browser doesn't have. Other types get a grey tile; hover names it.
 */
export function IssueTypeIcon({ type, size = 16, className }: Props) {
  const name = type?.name;
  if (!name) return null;
  const { color, Glyph } = LOOKS[name.toLowerCase()] ?? OTHER;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={className ? `issue-type-icon ${className}` : "issue-type-icon"}
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Glyph size={Math.round(size * 0.75)} stroke={2.25} aria-hidden />
    </span>
  );
}
