import { Fragment, useContext, useRef, useState } from "react";
import Spinner from "react-bootstrap/Spinner";
import {
  IconArrowBackUp,
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconExternalLink,
} from "@tabler/icons-react";
import type {
  DiffHunkLine,
  GitHubPR,
  PRCommentAuthor,
  PRComments as PRCommentsData,
  PRConversationItem,
  PRReviewThread,
  PRReviewVerdict,
  PRThreadState,
} from "../types";
import { ViewerLoginContext } from "../context/ViewerLoginContext";
import { usePRCopyActions } from "../hooks/usePRCopyActions";
import { isUnreadComment, loadedCommentCounts } from "../utils/commentCounts";
import { HUNK_MARKER, formatFeedbackForClaude, previewLine } from "../utils/prFeedback";
import { formatRelativeTime } from "../utils/time";
import { NewPill } from "./CommentCountChip";
import { Avatar } from "./primitives/Avatar";
import { Markdown } from "./Markdown";
import { Toast, toastProps, type ToastState } from "./Toast";
import "./PRComments.css";

type Tone = "success" | "warning" | "danger" | "neutral";

/** Outdated threads are still unresolved, so they keep the open color; a tag says outdated. */
const THREAD_TONE: Record<PRThreadState, Tone> = {
  open: "warning",
  outdated: "warning",
  resolved: "success",
};

const VERDICTS: Record<PRReviewVerdict, { label: string; tone: Tone }> = {
  APPROVED: { label: "Approved", tone: "success" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "danger" },
  COMMENTED: { label: "Commented", tone: "neutral" },
  DISMISSED: { label: "Dismissed", tone: "neutral" },
};

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Whether a comment arrived since the viewer's last look at the tab. */
type IsNew = (author: PRCommentAuthor, createdAt: string) => boolean;

const newInThread = (thread: PRReviewThread, isNew: IsNew) =>
  thread.comments.filter((c) => isNew(c.author, c.created_at)).length;

/** Unresolved threads by file, files in order of their first thread. */
function groupByPath(threads: PRReviewThread[]): [string, PRReviewThread[]][] {
  const groups = new Map<string, PRReviewThread[]>();
  for (const t of threads) groups.set(t.path, [...(groups.get(t.path) ?? []), t]);
  return [...groups];
}

/** Status color lives on the dot only: no tinted headers or rails. */
function Dot({ tone }: { tone: Tone }) {
  return <span className={`pr-comments-dot pr-comments-dot--${tone}`} aria-hidden="true" />;
}

/**
 * Avatar, login (tagged New if it arrived since the last look), optional
 * review verdict, a relative time linking to GitHub, then the body.
 */
function Entry({
  author,
  createdAt,
  url,
  body,
  verdict,
  isNew,
  className,
}: {
  author: PRCommentAuthor;
  createdAt: string;
  url: string;
  body: string;
  verdict?: PRReviewVerdict;
  isNew?: boolean;
  className: string;
}) {
  return (
    <div className={`pr-comments-entry ${className}`}>
      <Avatar src={author.avatar_url} alt={author.login} size="sm" />
      <div className="pr-comments-entry-main">
        <div className="pr-comments-entry-head">
          <span className="pr-comments-who">{author.login}</span>
          {isNew && <NewPill />}
          {verdict && (
            <span className="pr-comments-verdict">
              <Dot tone={VERDICTS[verdict].tone} />
              {VERDICTS[verdict].label}
            </span>
          )}
          <a
            className="pr-comments-time"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on GitHub"
          >
            {formatRelativeTime(createdAt)}
          </a>
        </div>
        {body.trim() && <Markdown>{body}</Markdown>}
      </div>
    </div>
  );
}

/**
 * The tail of the diff hunk, ending on the commented line. It scrolls sideways
 * rather than wrapping; the gutter numbers can't be selected, so copying the
 * code skips them.
 */
function Hunk({ lines }: { lines: DiffHunkLine[] }) {
  return (
    <pre className="pr-hunk">
      <code className="pr-hunk-code">
        {lines.map((l, i) => (
          <span
            key={i}
            className={`pr-hunk-line pr-hunk-line--${l.kind}${i === lines.length - 1 ? " is-commented" : ""}`}
          >
            <span className="pr-hunk-num">{l.line ?? ""}</span>
            {HUNK_MARKER[l.kind] + l.text}
          </span>
        ))}
      </code>
    </pre>
  );
}

/**
 * One thread: its line (and how many replies are new), then the hunk and
 * comments. Resolve (or Unresolve, once resolved) shows only where GitHub
 * allows it and the modal can write.
 */
function ThreadCard({
  thread,
  isNew,
  onCopy,
  onSetResolved,
}: {
  thread: PRReviewThread;
  isNew: IsNew;
  onCopy: () => void;
  onSetResolved?: (resolved: boolean, viaKeyboard: boolean) => void;
}) {
  const resolved = thread.state === "resolved";
  const canToggle = !!onSetResolved && (resolved ? thread.can_unresolve : thread.can_resolve);
  const newCount = newInThread(thread, isNew);
  return (
    <div className="pr-thread">
      <div className="pr-thread-header">
        <Dot tone={THREAD_TONE[thread.state]} />
        <span className="pr-thread-loc">
          {thread.line === null ? "file" : `line ${thread.line}`}
        </span>
        {/* Its line and hunk are from the diff the comment was left on. */}
        {thread.state === "outdated" && <span className="pr-thread-tag">Outdated</span>}
        {newCount > 0 && <NewPill>{newCount} new</NewPill>}
        <span className="pr-thread-actions">
          {canToggle && (
            <button
              type="button"
              className="pr-thread-resolve-btn"
              // A keyboard press reports no clicks (detail 0); the button is about to go away.
              onClick={(e) => onSetResolved!(!resolved, e.detail === 0)}
            >
              {resolved ? (
                <IconArrowBackUp size={14} stroke={1.75} aria-hidden="true" />
              ) : (
                <IconCheck size={14} stroke={1.75} aria-hidden="true" />
              )}
              {resolved ? "Unresolve" : "Resolve"}
            </button>
          )}
          <button
            type="button"
            className="pr-comments-icon-btn"
            aria-label="Copy thread"
            title="Copy thread"
            onClick={onCopy}
          >
            <IconCopy size={14} stroke={1.5} aria-hidden="true" />
          </button>
          <a
            className="pr-comments-icon-btn"
            href={thread.html_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open on GitHub"
            title="Open on GitHub"
          >
            <IconExternalLink size={14} stroke={1.5} aria-hidden="true" />
          </a>
        </span>
      </div>
      {thread.hunk.length > 0 && <Hunk lines={thread.hunk} />}
      {thread.comments.map((c) => (
        <Entry
          key={c.id}
          className="pr-thread-comment"
          author={c.author}
          createdAt={c.created_at}
          url={c.html_url}
          body={c.body}
          isNew={isNew(c.author, c.created_at)}
        />
      ))}
    </div>
  );
}

/** A disclosure toggle: chevron + label. */
function Fold({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="pr-comments-fold" aria-expanded={open} onClick={onToggle}>
      <IconChevronRight size={14} aria-hidden="true" className="pr-comments-fold-chevron" />
      {children}
    </button>
  );
}

/**
 * Resolved threads, folded into one line; open, each is a one-liner that
 * expands into the full card. The fold and one-liners count new replies, so
 * one the tab's label counted can't hide in here.
 */
function ResolvedThreads({
  threads,
  isNew,
  onCopy,
  onSetResolved,
}: {
  threads: PRReviewThread[];
  isNew: IsNew;
  onCopy: (threadId: string) => void;
  onSetResolved?: (threadId: string, resolved: boolean, viaKeyboard: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const toggle = (id: string) =>
    setExpanded((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const newCount = threads.reduce((n, t) => n + newInThread(t, isNew), 0);

  return (
    <>
      <Fold open={open} onToggle={() => setOpen((v) => !v)}>
        {threads.length} resolved
        {newCount > 0 && <NewPill>{newCount} new</NewPill>}
      </Fold>
      {open &&
        threads.map((t) => {
          const isExpanded = expanded.includes(t.id);
          const first = t.comments[0];
          const name = basename(t.path);
          const threadNew = newInThread(t, isNew);
          return (
            <div key={t.id} className="pr-comments-closed">
              <button
                type="button"
                className="pr-comments-oneline"
                aria-expanded={isExpanded}
                onClick={() => toggle(t.id)}
              >
                <Dot tone={THREAD_TONE[t.state]} />
                <span className="pr-comments-oneline-loc" title={t.path}>
                  {t.line === null ? name : `${name}:${t.line}`}
                </span>
                <span className="pr-comments-oneline-text">
                  {first ? `${first.author.login}: ${previewLine(first.body)}` : ""}
                </span>
                <span className="pr-comments-oneline-count">
                  · {plural(t.comments.length, "comment")}
                </span>
                {threadNew > 0 && <NewPill>{threadNew} new</NewPill>}
              </button>
              {isExpanded && (
                <ThreadCard
                  thread={t}
                  isNew={isNew}
                  onCopy={() => onCopy(t.id)}
                  onSetResolved={onSetResolved && ((r, kb) => onSetResolved(t.id, r, kb))}
                />
              )}
            </div>
          );
        })}
    </>
  );
}

/**
 * Comments and review summaries, oldest first; bots (codecov, sonarcloud…) fold
 * away. Comments new since the last look are tagged, and a "New" divider leads
 * the first one. Review summaries aren't tagged: the counts leave them out.
 */
function Conversation({ items, isNew }: { items: PRConversationItem[]; isNew: IsNew }) {
  const [showBots, setShowBots] = useState(false);
  const people = items.filter((i) => !i.author.is_bot);
  const bots = items.filter((i) => i.author.is_bot);
  const botNames = [...new Set(bots.map((b) => b.author.login.replace(/\[bot\]$/, "")))];
  const fresh = people.filter((i) => i.kind === "comment" && isNew(i.author, i.created_at));
  const entry = (i: PRConversationItem) => (
    <Entry
      key={i.id}
      className="pr-convo-item"
      author={i.author}
      createdAt={i.created_at}
      url={i.html_url}
      body={i.body}
      verdict={i.verdict}
      isNew={fresh.includes(i)}
    />
  );

  return (
    <>
      {items.length === 0 && <div className="pr-comments-empty">No comments yet</div>}
      {people.map((i) => (
        <Fragment key={i.id}>
          {i === fresh[0] && <div className="pr-comments-since">New</div>}
          {entry(i)}
        </Fragment>
      ))}
      {bots.length > 0 && (
        <>
          <Fold open={showBots} onToggle={() => setShowBots((v) => !v)}>
            {plural(bots.length, "bot comment")} · {botNames.join(", ")}
          </Fold>
          {showBots && bots.map(entry)}
        </>
      )}
    </>
  );
}

interface PRCommentsProps {
  pr: GitHubPR;
  comments: PRCommentsData | null;
  loading: boolean;
  error: boolean;
  /** Desktop fills the description column's Comments tab; phone adds two sections to the one scroll. */
  layout: "desktop" | "phone";
  /** Resolve or unresolve a thread on GitHub; without it the view is read-only. */
  setThreadResolved?: (threadId: string, resolved: boolean) => Promise<void>;
  /**
   * A toast rendered higher up, which outlives this view (the modal's tabs
   * unmount or hide it); without one, the view renders its own.
   */
  toast?: ToastState;
  /**
   * When the viewer last looked before this visit (read as the tab opened,
   * before it marked them read): later comments by others are tagged New.
   * Without it, nothing is.
   */
  readSince?: string | null;
}

/**
 * Review feedback for the PR modal: unresolved inline threads by file (resolved
 * ones folded), then the conversation. "Copy open feedback" puts the unresolved
 * threads on the clipboard as markdown, to paste into a Claude Code session
 * that addresses them. Outdated threads count as open, as GitHub's unresolved
 * count (the header chip) does. Resolving is the one write: a single click,
 * with Undo in the toast, since it's as easy to reverse. What's new since the
 * last look is summed up at the top, as the tab's label counts it, and tagged;
 * the tags stay while the view is up.
 */
export function PRComments({
  pr,
  comments,
  loading,
  error,
  layout,
  setThreadResolved,
  toast: outerToast,
  readSince,
}: PRCommentsProps) {
  const { copy, toast } = usePRCopyActions(outerToast);
  const feedbackHeader = useRef<HTMLDivElement>(null);
  const viewer = useContext(ViewerLoginContext);
  const phone = layout === "phone";
  const isNew: IsNew = (author, createdAt) =>
    !!readSince && isUnreadComment(author, createdAt, readSince, viewer || null);

  if (!comments) {
    const status = error ? (
      <div className="pr-comments-status">
        <span>Couldn't load comments.</span>{" "}
        <a href={pr.html_url} target="_blank" rel="noopener noreferrer">
          Open on GitHub
        </a>
      </div>
    ) : loading ? (
      <div className="d-flex align-items-center gap-2 text-secondary-custom">
        <Spinner animation="border" size="sm" variant="secondary" />
        <span style={{ fontSize: "0.8125rem" }}>Loading comments…</span>
      </div>
    ) : null;
    if (!status) return null;
    return phone ? (
      <section className="modal-phone-section pr-comments pr-comments--phone">
        <div className="modal-body-section-header">Code feedback</div>
        {status}
      </section>
    ) : (
      <div className="pr-comments">{status}</div>
    );
  }

  const open = comments.threads.filter((t) => t.state !== "resolved");
  const resolved = comments.threads.filter((t) => t.state === "resolved");
  // Counted as the tab's label counts, so the two agree; a lower bound when
  // some comments weren't fetched.
  const newCount = readSince ? loadedCommentCounts(comments, readSince, viewer || null).unread : 0;
  const newSummary = newCount > 0 && (
    <div className="pr-comments-summary-new">
      <NewPill>{`${newCount}${comments.truncated ? "+" : ""} new`}</NewPill> since you last looked
    </div>
  );
  const copyOpen = () =>
    copy(formatFeedbackForClaude(pr, comments), `Copied ${plural(open.length, "open thread")}`);
  const copyThread = (threadId: string) =>
    copy(formatFeedbackForClaude(pr, comments, threadId), "Copied thread");

  const toggleResolved =
    setThreadResolved &&
    ((threadId: string, resolved: boolean, viaKeyboard: boolean) => {
      const write = (to: boolean, failure: string) =>
        setThreadResolved(threadId, to).catch(() =>
          toast.show(failure, { tone: "danger", durationMs: 4000 }),
        );
      write(resolved, `Couldn't ${resolved ? "resolve" : "unresolve"} the thread`);
      toast.show(resolved ? "Resolved thread" : "Unresolved thread", {
        durationMs: 5000,
        action: {
          label: "Undo",
          onClick: (e) => {
            toast.hide();
            write(!resolved, "Couldn't undo");
            // The Undo button is going away; keep a keyboard user in the feedback.
            if (e.detail === 0) feedbackHeader.current?.focus();
          },
        },
      });
      // The thread just moved lists, taking the pressed button with it.
      if (viaKeyboard) toast.focusAction();
    });

  const copyButton = (
    <button
      type="button"
      className="pr-comments-copy-btn"
      disabled={open.length === 0}
      aria-label={phone ? "Copy open feedback" : undefined}
      onClick={copyOpen}
    >
      <IconCopy size={14} stroke={1.5} aria-hidden="true" />
      {phone ? "Copy" : "Copy open feedback"}
    </button>
  );

  const truncatedNote = comments.truncated && (
    <div className="pr-comments-truncated">
      Some comments weren't fetched.{" "}
      <a href={pr.html_url} target="_blank" rel="noopener noreferrer">
        See them all on GitHub
      </a>
    </div>
  );

  const feedback = (
    <>
      <div
        ref={feedbackHeader}
        tabIndex={-1}
        className="modal-body-section-header pr-comments-header"
      >
        <span>Code feedback</span>
        <span className="pr-comments-header-count">{open.length} open</span>
        {phone && copyButton}
      </div>
      {groupByPath(open).map(([path, threads]) => (
        <div key={path} className="pr-comments-file">
          <div className="pr-comments-file-header">
            {/* The phone column is too narrow for full paths. */}
            <span className="pr-comments-file-name" title={path}>
              {phone ? basename(path) : path}
            </span>
            {!phone && <span className="pr-comments-file-count">{threads.length} open</span>}
          </div>
          {threads.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              isNew={isNew}
              onCopy={() => copyThread(t.id)}
              onSetResolved={toggleResolved && ((r, kb) => toggleResolved(t.id, r, kb))}
            />
          ))}
        </div>
      ))}
      {open.length === 0 && <div className="pr-comments-empty">No open threads</div>}
      {resolved.length > 0 && (
        <ResolvedThreads
          threads={resolved}
          isNew={isNew}
          onCopy={copyThread}
          onSetResolved={toggleResolved}
        />
      )}
    </>
  );

  const conversation = (
    <>
      <div className="modal-body-section-header pr-comments-header">
        <span>Conversation</span>
        <span className="pr-comments-header-count">
          {phone ? comments.conversation.length : "oldest first"}
        </span>
      </div>
      <Conversation items={comments.conversation} isNew={isNew} />
    </>
  );

  const toastEl = !outerToast && <Toast {...toastProps(toast)} />;

  if (phone) {
    return (
      <>
        <section className="modal-phone-section pr-comments pr-comments--phone">
          {newSummary}
          {truncatedNote}
          {feedback}
        </section>
        <section className="modal-phone-section pr-comments pr-comments--phone">
          {conversation}
        </section>
        {toastEl}
      </>
    );
  }

  return (
    <div className="pr-comments">
      <div className="pr-comments-toolbar">
        <span className="pr-comments-counts">
          {`${open.length} open · ${resolved.length} resolved · ${comments.conversation.length} in conversation`}
        </span>
        {copyButton}
      </div>
      {newSummary}
      {truncatedNote}
      <div className="pr-comments-part">{feedback}</div>
      <div className="pr-comments-part">{conversation}</div>
      {toastEl}
    </div>
  );
}
