import type { DiffHunkLine, GitHubPR, PRComments, PRReviewThread, PRReviewVerdict } from "../types";

/** A hunk line's diff marker, as in a unified diff. */
export const HUNK_MARKER: Record<DiffHunkLine["kind"], string> = {
  add: "+",
  del: "-",
  context: " ",
};

const VERDICT_LABEL: Record<PRReviewVerdict, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes requested",
  COMMENTED: "commented",
  DISMISSED: "dismissed",
};

/** A markdown code fence line (```lang or ~~~), capturing its info string. */
const FENCE = /^\s{0,3}(?:`{3,}|~{3,})(.*)$/;

/** Body lines without trailing whitespace or leading blank lines. */
function bodyLines(body: string): string[] {
  const lines = body.trimEnd().split(/\r?\n/);
  while (lines.length > 1 && !lines[0].trim()) lines.shift();
  return lines;
}

/**
 * One line of a comment for a one-line preview: the first prose line, skipping
 * code fences and suggested code; "suggested a change" when the body is only a
 * ```suggestion block.
 */
export function previewLine(body: string): string {
  let inFence = false;
  let inSuggestion = false;
  let suggested = false;
  for (const raw of body.split(/\r?\n/)) {
    const fence = FENCE.exec(raw);
    if (fence) {
      inSuggestion = !inFence && fence[1].trim() === "suggestion";
      suggested ||= inSuggestion;
      inFence = !inFence;
      continue;
    }
    if (raw.trim() && !inSuggestion) return raw.trim();
  }
  return suggested ? "suggested a change" : "";
}

/**
 * "- alice: body" for a one-line body. A longer body, or one that starts with
 * a fence (a GitHub ```suggestion), goes on the lines below, indented to stay
 * inside the list item, so the item's own line never opens a code block.
 */
function listItem(lead: string, body: string): string[] {
  const lines = bodyLines(body);
  if (lines.length === 1 && !FENCE.test(lines[0])) return [`- ${lead}: ${lines[0].trim()}`];
  return [`- ${lead}:`, ...lines.map((line) => (line.trim() ? `  ${line}` : ""))];
}

/** A fence longer than any backtick run in the hunk, so a ``` line in it (READMEs) can't close it. */
function diffFence(hunk: DiffHunkLine[]): string {
  const runs = hunk.flatMap((l) => l.text.match(/`+/g) ?? []);
  return "`".repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
}

function threadBlock(thread: PRReviewThread): string[] {
  const loc = thread.line === null ? thread.path : `${thread.path}:${thread.line}`;
  // An outdated thread's line and hunk are from the diff it was left on.
  const lines = [`## ${loc}${thread.state === "outdated" ? " (outdated)" : ""}`];
  if (thread.hunk.length > 0) {
    const fence = diffFence(thread.hunk);
    lines.push(`${fence}diff`, ...thread.hunk.map((l) => HUNK_MARKER[l.kind] + l.text), fence);
  }
  for (const c of thread.comments) lines.push(...listItem(c.author.login, c.body));
  return lines;
}

/**
 * Review feedback as markdown to paste into a Claude Code session in the repo:
 * the PR, then each thread's file:line, diff hunk and comments. Without a
 * `threadId` it covers every unresolved thread (outdated ones included, as
 * GitHub counts them) plus the reviewers' summaries; with one, just that
 * thread, whatever its state.
 */
export function formatFeedbackForClaude(
  pr: GitHubPR,
  comments: PRComments,
  threadId?: string,
): string {
  const single = threadId !== undefined;
  const ref = `${pr.repo_full_name}#${pr.number}`;
  const lines = [
    single ? `Address this review comment on ${ref}` : `Address the open review feedback on ${ref}`,
    `"${pr.title}"`,
    `Branch: ${pr.head.ref} → ${pr.base.ref}`,
    pr.html_url,
  ];
  // Only the latest items are fetched; the reader should know there's more.
  if (!single && comments.truncated) {
    lines.push(`Note: this PR has more comments than were fetched; see ${pr.html_url}`);
  }

  const threads = comments.threads.filter((t) =>
    single ? t.id === threadId : t.state !== "resolved",
  );
  if (!single) {
    lines.push("", `${threads.length} open review thread${threads.length === 1 ? "" : "s"}:`);
  }
  for (const t of threads) lines.push("", ...threadBlock(t));

  // Verdict-only reviews and bots (codecov, sonarcloud) add nothing to act on.
  const summaries = single
    ? []
    : comments.conversation.filter(
        (item) => item.kind === "review" && !item.author.is_bot && item.body.trim(),
      );
  if (summaries.length > 0) {
    lines.push("", "Review summaries:");
    for (const r of summaries) {
      const verdict = r.verdict ? ` (${VERDICT_LABEL[r.verdict]})` : "";
      lines.push(...listItem(`${r.author.login}${verdict}`, r.body));
    }
  }
  return lines.join("\n");
}
