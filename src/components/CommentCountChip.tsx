import { useContext, type ReactNode } from "react";
import { IconMessageCircle } from "@tabler/icons-react";
import type { GitHubPR } from "../types";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { useCommentsReadAt } from "../services/commentsRead";
import { commentCounts, type CommentCounts } from "../utils/commentCounts";
import { Badge } from "./primitives/Badge";
import "./CommentCountChip.css";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "12", or "30+" when some threads weren't fetched. */
export function totalLabel({ total, totalAtLeast }: CommentCounts): string {
  return `${total}${totalAtLeast ? "+" : ""}`;
}

/** "3 new", or "20+ new" when older comments weren't fetched. */
export function newLabel({ unread, unreadAtLeast }: CommentCounts): string {
  return `${unread}${unreadAtLeast ? "+" : ""} new`;
}

/** The accent pill on what's new: the phone Comments chip, and comments and threads in the tab. */
export function NewPill({ children = "New" }: { children?: ReactNode }) {
  return <span className="comment-new-pill">{children}</span>;
}

/**
 * A PR's comment counts from its list data, against the viewer's read marker
 * (which re-renders when the Comments tab marks it read). Null when there's
 * nothing to show: no comment data (merged PRs) or no comments.
 */
export function useCommentCounts(pr: GitHubPR): CommentCounts | null {
  const readAt = useCommentsReadAt(pr);
  const viewer = useContext(ViewerLoginContext);
  const counts = readAt === null ? null : commentCounts(pr, readAt, viewer || null);
  return counts && counts.total > 0 ? counts : null;
}

/**
 * "💬 12 · 3 new" in a PR's signals row: a quiet neutral chip with only the
 * new part in the accent, so unread feedback shows without opening the PR.
 * Takes the row's useCommentCounts, which also decides whether the row shows;
 * renders nothing without counts.
 */
export function CommentCountChip({ counts }: { counts: CommentCounts | null }) {
  if (!counts) return null;
  const title =
    (counts.totalAtLeast ? `${totalLabel(counts)} comments` : plural(counts.total, "comment")) +
    (counts.unread ? ` · ${newLabel(counts)} since you last opened them` : "");
  return (
    <Badge variant="neutral" className="comment-count-chip" title={title}>
      <IconMessageCircle size={12} stroke={1.8} aria-hidden="true" />
      <span>
        {totalLabel(counts)}
        {counts.unread > 0 && (
          <>
            {" · "}
            <span className="comment-count-new">{newLabel(counts)}</span>
          </>
        )}
      </span>
    </Badge>
  );
}
