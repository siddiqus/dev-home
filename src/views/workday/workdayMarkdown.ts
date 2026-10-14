import type { GitHubPR, ReviewState } from "../../types";
import type { TicketRef, WorkdaySections } from "./types";

const REVIEW_WORD: Record<ReviewState, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes requested",
  COMMENTED: "commented",
};

/** "2d" / "5h" since `iso`. */
function shortAge(iso: string, now: Date): string {
  const hours = Math.max(1, Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d` : `${hours}h`;
}

/** "app#12": repo short name + number, for PRs with no ticket. */
const repoRef = (pr: GitHubPR) => `${pr.repo_full_name.split("/").pop()}#${pr.number}`;

/** Append the off-sprint marker, merging it into a trailing "(no PR yet)". */
function offSprint(line: string, ticket: TicketRef | null): string {
  if (!ticket?.offSprint) return line;
  if (line.endsWith(" (no PR yet)"))
    return line.replace(/ \(no PR yet\)$/, " (off-sprint, no PR yet)");
  return `${line} (off-sprint)`;
}

/** Drop a leading ticket key (plus separators) from a PR title, e.g. "CCP-1: Fix" → "Fix". */
function titleWithoutKey(title: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(`^${escaped}(?!\\d)[:\\s\\-–—]*`, "i"), "");
}

/** "KEY title" for a PR with a ticket (key not repeated), else just the title. */
function keyedTitle(pr: GitHubPR, ticket: TicketRef | null): string {
  if (!ticket) return pr.title;
  return `${ticket.key} ${titleWithoutKey(pr.title, ticket.key)}`.trim();
}

/** What a standup line points at: a PR (opens it) or a ticket (opens the issue). */
export type StandupTarget = { kind: "pr"; pr: GitHubPR } | { kind: "ticket"; key: string };

export interface StandupLine {
  text: string;
  /** Null for summary lines that cover several items ("Reviewed A, B"). */
  target: StandupTarget | null;
}

export interface StandupLines {
  yesterday: StandupLine[];
  today: StandupLine[];
  blockers: StandupLine[];
}

const prTarget = (pr: GitHubPR): StandupTarget => ({ kind: "pr", pr });
const ticketTarget = (ticket: TicketRef): StandupTarget => ({ kind: "ticket", key: ticket.key });

/**
 * The standup as lines: Yesterday (done), Today (working on + reviewing) and
 * Blockers (blockers + waiting). Today leaves out only what is in the
 * Blockers / needs-attention section (needs-action / no-reviewer PRs, flagged
 * tickets); PRs that are just waiting on others stay in Today and also get a
 * Blockers line. Note lines are added by workdayToMarkdown.
 */
export function standupLines(s: WorkdaySections, now: Date): StandupLines {
  // Yesterday
  const yesterday: StandupLine[] = [];
  const reviewed: string[] = [];
  let reviewedAt = -1;
  for (const item of s.done.items) {
    if (item.kind === "merged") {
      yesterday.push({
        text: offSprint(
          `Merged ${keyedTitle(item.pr, item.ticket)} (#${item.pr.number})`,
          item.ticket,
        ),
        target: prTarget(item.pr),
      });
    } else if (item.kind === "status") {
      yesterday.push({
        text: offSprint(`Moved ${item.ticket.key} to ${item.toStatus}`, item.ticket),
        target: ticketTarget(item.ticket),
      });
    } else {
      if (reviewedAt < 0) {
        reviewedAt = yesterday.length;
        yesterday.push({ text: "", target: null });
      }
      const outcome =
        item.pr.state === "merged" ? ", merged" : item.pr.state === "closed" ? ", closed" : "";
      reviewed.push(
        `${item.ticket?.key ?? repoRef(item.pr)} (${REVIEW_WORD[item.state]}${outcome})`,
      );
    }
  }
  if (reviewedAt >= 0) yesterday[reviewedAt].text = `Reviewed ${reviewed.join(", ")}`;

  // What the Blockers / needs-attention section holds; Today skips exactly these.
  const attentionPRs = new Set<string>();
  const flaggedKeys = new Set<string>();
  for (const b of s.blockers.items) {
    if (b.kind === "flagged") flaggedKeys.add(b.ticket.key.toUpperCase());
    else attentionPRs.add(b.pr.html_url);
  }
  // Ticket keys that get a Blockers line from one of their PRs.
  const prLineKeys = new Set<string>();
  for (const item of [...s.blockers.items, ...s.waiting.items]) {
    if (item.kind !== "flagged" && item.kind !== "code-review" && item.ticket)
      prLineKeys.add(item.ticket.key.toUpperCase());
  }

  // Blockers
  const blockers: StandupLine[] = [];
  const blockedPRs = new Set<string>();
  const blockedKeys = new Set<string>();
  const label = (pr: GitHubPR, ticket: TicketRef | null) => ticket?.key ?? pr.title;
  const addPR = (pr: GitHubPR, ticket: TicketRef | null, text: string) => {
    if (blockedPRs.has(pr.html_url)) return;
    blockedPRs.add(pr.html_url);
    blockers.push({ text: offSprint(text, ticket), target: prTarget(pr) });
  };
  const addTicket = (ticket: TicketRef, text: string) => {
    const key = ticket.key.toUpperCase();
    if (blockedKeys.has(key)) return;
    blockedKeys.add(key);
    blockers.push({ text: offSprint(text, ticket), target: ticketTarget(ticket) });
  };
  for (const b of s.blockers.items) {
    if (b.kind === "flagged") addTicket(b.ticket, `${b.ticket.key} flagged in Jira`);
    else
      addPR(
        b.pr,
        b.ticket,
        `${label(b.pr, b.ticket)} #${b.pr.number} ${b.reasons.join(", ").toLowerCase()}`,
      );
  }
  for (const w of s.waiting.items) {
    if (w.kind === "code-review") {
      if (prLineKeys.has(w.ticket.key.toUpperCase())) continue;
      addTicket(w.ticket, `${w.ticket.key} in Code Review with ${w.reviewers.join(", ")}`);
    } else if (w.kind === "your-move") {
      addPR(w.pr, w.ticket, `${label(w.pr, w.ticket)} #${w.pr.number} approved, ready to merge`);
    } else {
      const from = w.reviewers.length > 0 ? ` from ${w.reviewers.join(", ")}` : "";
      addPR(
        w.pr,
        w.ticket,
        `${label(w.pr, w.ticket)} #${w.pr.number} waiting on review${from} (${shortAge(w.since, now)})`,
      );
    }
  }
  // Today
  const today: StandupLine[] = [];
  for (const g of s.workingOn.items) {
    const prs = g.prs.filter((p) => !attentionPRs.has(p.html_url));
    if (g.ticket === null) {
      for (const p of prs) today.push({ text: `${p.title} (#${p.number})`, target: prTarget(p) });
      continue;
    }
    if (flaggedKeys.has(g.ticket.key.toUpperCase())) continue;
    if (g.prs.length > 0 && prs.length === 0) continue;
    const head = `${g.ticket.key} ${g.ticket.summary}`.trim();
    const line =
      prs.length === 0
        ? `${head} (no PR yet)`
        : `${head} — ${prs.map((p) => `#${p.number} ${p.draft ? "draft" : "in review"}`).join(", ")}`;
    today.push({ text: offSprint(line, g.ticket), target: ticketTarget(g.ticket) });
  }
  const reviewLabels = [
    ...new Set(s.reviewing.items.flatMap((g) => (g.ticket ? [g.ticket.key] : g.prs.map(repoRef)))),
  ];
  if (reviewLabels.length > 0)
    today.push({ text: `Reviewing ${reviewLabels.join(", ")}`, target: null });

  return { yesterday, today, blockers };
}

/** Note text as bullet lines: one per non-empty line, leading "-", "*" or "•" dropped. */
export function noteLines(noteContent: string): string[] {
  return noteContent
    .split("\n")
    .map((raw) => raw.trim().replace(/^([-*•])\s+/, ""))
    .filter(Boolean);
}

/**
 * Slack-ready standup text: *Yesterday*, *Today* and *Blockers* from
 * standupLines, with the note's lines appended to Blockers. Empty headings
 * are dropped.
 */
export function workdayToMarkdown(s: WorkdaySections, noteContent: string, now: Date): string {
  const { yesterday, today, blockers } = standupLines(s, now);
  const text = (lines: StandupLine[]) => lines.map((l) => l.text);
  const block = (title: string, lines: string[]) =>
    lines.length === 0 ? null : [`*${title}*`, ...lines.map((l) => `• ${l}`)].join("\n");
  return [
    block("Yesterday", text(yesterday)),
    block("Today", text(today)),
    block("Blockers", [...text(blockers), ...noteLines(noteContent)]),
  ]
    .filter((b): b is string => b !== null)
    .join("\n\n");
}
