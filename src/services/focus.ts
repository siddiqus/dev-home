import type { GitHubPR, JiraIssue, JiraComment, GitHubComment, Note } from "../types";
import { getReferenceUrl } from "../utils/text";

export type FocusKind = "pr-mine" | "pr-review" | "jira" | "mention" | "note";

export interface FocusItem {
  id: string;
  kind: FocusKind;
  title: string;
  url?: string;
  updatedAt: number;
  signals: {
    ageDays: number;
    jiraPriority?: "Highest" | "High" | "Medium" | "Low" | "Lowest";
    ciFailing?: boolean;
    isReviewRequested?: boolean;
    isMention?: boolean;
    isPinned: boolean;
    snoozedUntil?: number;
    isDismissed?: boolean;
  };
}

export interface MergeInput {
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  notes: Note[];
  jiraBaseUrl?: string;
}

function jiraBrowseUrl(base: string | undefined, key: string): string | undefined {
  if (!base) return undefined;
  const trimmed = base.replace(/\/+$/, "");
  return trimmed ? `${trimmed}/browse/${key}` : undefined;
}

const MS_PER_DAY = 86_400_000;

function ageDays(iso: string, now: number): number {
  return Math.max(0, (now - new Date(iso).getTime()) / MS_PER_DAY);
}

function prItem(pr: GitHubPR, kind: "pr-mine" | "pr-review", now: number): FocusItem {
  const id = `pr:${pr.repo_full_name}#${pr.number}`;
  const updatedAt = new Date(pr.updated_at).getTime();
  return {
    id,
    kind,
    title: pr.title,
    url: pr.html_url,
    updatedAt,
    signals: {
      ageDays: ageDays(pr.updated_at, now),
      ciFailing: pr.checks_status === "failure",
      isReviewRequested: kind === "pr-review",
      isPinned: false,
    },
  };
}

function jiraItem(j: JiraIssue, now: number, jiraBaseUrl?: string): FocusItem {
  return {
    id: `jira:${j.key}`,
    kind: "jira",
    title: `${j.key} — ${j.summary}`,
    url: jiraBrowseUrl(jiraBaseUrl, j.key),
    updatedAt: new Date(j.updated).getTime(),
    signals: {
      ageDays: ageDays(j.updated, now),
      jiraPriority: j.priority?.name as FocusItem["signals"]["jiraPriority"],
      isPinned: false,
    },
  };
}

function jiraMentionItem(c: JiraComment, now: number, jiraBaseUrl?: string): FocusItem {
  return {
    id: `mention:jira:${c.id}`,
    kind: "mention",
    title: `${c.issueKey}: ${c.body.text.slice(0, 80)}`,
    url: jiraBrowseUrl(jiraBaseUrl, c.issueKey),
    updatedAt: new Date(c.updated).getTime(),
    signals: {
      ageDays: ageDays(c.updated, now),
      isMention: true,
      isPinned: false,
    },
  };
}

function ghMentionItem(c: GitHubComment, now: number): FocusItem {
  return {
    id: `mention:gh:${c.id}`,
    kind: "mention",
    title: c.context_title || c.body.slice(0, 80),
    url: c.html_url,
    updatedAt: new Date(c.updated_at).getTime(),
    signals: {
      ageDays: ageDays(c.updated_at, now),
      isMention: true,
      isPinned: false,
    },
  };
}

function noteItem(n: Note, now: number, jiraBaseUrl?: string): FocusItem {
  return {
    id: `note:${n.id}`,
    kind: "note",
    title: n.title || n.content.slice(0, 80),
    url: getReferenceUrl(n, jiraBaseUrl ?? "") ?? undefined,
    updatedAt: new Date(n.updated_at).getTime(),
    signals: {
      ageDays: ageDays(n.updated_at, now),
      isPinned: false,
    },
  };
}

export function mergeSources(input: MergeInput, now: number = Date.now()): FocusItem[] {
  return [
    ...input.openPRs.map((p) => prItem(p, "pr-mine", now)),
    ...input.reviewRequests.map((p) => prItem(p, "pr-review", now)),
    ...input.jiraIssues.map((j) => jiraItem(j, now, input.jiraBaseUrl)),
    ...input.jiraComments.map((c) => jiraMentionItem(c, now, input.jiraBaseUrl)),
    ...input.githubMentions.map((c) => ghMentionItem(c, now)),
    ...input.notes.map((n) => noteItem(n, now, input.jiraBaseUrl)),
  ];
}

export const AGE_CAP = 40;
export const PINNED_BOOST = 1000;
export const CI_FAILING_BOOST = 30;

export const BASE_SCORE = {
  prMine: 30,
  prReview: 50,
  mention: 45,
  note: 20,
  jiraDefault: 25,
  jiraByPriority: {
    Highest: 60,
    High: 50,
    Medium: 30,
    Low: 15,
    Lowest: 10,
  } as const,
};

export interface RankedFocusItem extends FocusItem {
  score: number;
}

function baseScore(item: FocusItem): number {
  switch (item.kind) {
    case "pr-mine":
      return BASE_SCORE.prMine;
    case "pr-review":
      return BASE_SCORE.prReview;
    case "mention":
      return BASE_SCORE.mention;
    case "note":
      return BASE_SCORE.note;
    case "jira": {
      const p = item.signals.jiraPriority;
      if (p && p in BASE_SCORE.jiraByPriority) {
        return BASE_SCORE.jiraByPriority[p];
      }
      return BASE_SCORE.jiraDefault;
    }
  }
}

export function scoreItems(items: FocusItem[], now: number = Date.now()): RankedFocusItem[] {
  return items
    .filter((i) => !(i.signals.snoozedUntil && i.signals.snoozedUntil > now))
    .map<RankedFocusItem>((i) => {
      let score = baseScore(i);
      score += Math.min(i.signals.ageDays * 2, AGE_CAP);
      if (i.kind === "pr-mine" && i.signals.ciFailing) score += CI_FAILING_BOOST;
      if (i.signals.isPinned) score += PINNED_BOOST;
      return { ...i, score };
    })
    .sort((a, b) => b.score - a.score);
}

export interface SnoozePreset {
  label: string;
  until: number | null; // null = caller must pick (Custom)
}

export function snoozePresets(now: number = Date.now()): SnoozePreset[] {
  const fourHours = now + 4 * 60 * 60 * 1000;

  const d = new Date(now);
  const tomorrow9 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9, 0, 0, 0).getTime();

  // Next Monday at 09:00 local. If today is Monday, jump 7 days ahead.
  const dow = d.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilNextMonday = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  const nextMonday = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + daysUntilNextMonday,
    9,
    0,
    0,
    0,
  ).getTime();

  return [
    { label: "4h", until: fourHours },
    { label: "Tomorrow 9am", until: tomorrow9 },
    { label: "Next Monday", until: nextMonday },
    { label: "Custom…", until: null },
  ];
}
