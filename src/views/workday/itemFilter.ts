import type { GitHubPR } from "../../types";
import type { DropdownItem } from "../../components/SearchableDropdown";
import type { FocusData, TicketGroup, TicketRef, WorkdaySections } from "./types";

/**
 * The header's item filter: picked tickets, PRs and PR authors. A row is kept
 * when its ticket, its PR or its PR's author is picked, so picking a ticket
 * shows it in every section.
 */
export interface ItemFilter {
  tickets: Set<string>;
  prs: Set<string>;
  authors: Set<string>;
}

const TICKET = "t:";
const PR = "pr:";
const AUTHOR = "a:";

/** Dropdown values → filter; null when nothing is picked. */
export function parseItemFilter(values: string[]): ItemFilter | null {
  if (values.length === 0) return null;
  const f: ItemFilter = { tickets: new Set(), prs: new Set(), authors: new Set() };
  for (const v of values) {
    if (v.startsWith(TICKET)) f.tickets.add(v.slice(TICKET.length));
    else if (v.startsWith(PR)) f.prs.add(v.slice(PR.length));
    else if (v.startsWith(AUTHOR)) f.authors.add(v.slice(AUTHOR.length));
  }
  return f;
}

const prHit = (f: ItemFilter, pr: GitHubPR) =>
  f.prs.has(pr.html_url) || f.authors.has(pr.user.login);

function hit(f: ItemFilter, ticketKey: string | null | undefined, pr?: GitHubPR): boolean {
  return (!!ticketKey && f.tickets.has(ticketKey)) || (!!pr && prHit(f, pr));
}

/** A picked ticket keeps its whole group; otherwise only the picked PRs stay. */
function filterGroups<G extends { ticket: TicketRef | null; prs: GitHubPR[] }>(
  groups: G[],
  f: ItemFilter,
): G[] {
  return groups.flatMap((g) => {
    if (g.ticket && f.tickets.has(g.ticket.key)) return [g];
    const prs = g.prs.filter((pr) => prHit(f, pr));
    return prs.length > 0 ? [{ ...g, prs }] : [];
  });
}

/** A GitHub comment's PR url (its html_url without the #anchor). */
const mentionPrUrl = (url: string) => url.split("#")[0];

export function filterSectionsByItems(s: WorkdaySections, f: ItemFilter | null): WorkdaySections {
  if (!f) return s;
  const keep = (i: { ticket: TicketRef | null; pr?: GitHubPR }) => hit(f, i.ticket?.key, i.pr);
  return {
    ...s,
    done: { ...s.done, items: s.done.items.filter(keep) },
    workingOn: { ...s.workingOn, items: filterGroups(s.workingOn.items, f) },
    reviewing: { ...s.reviewing, items: filterGroups(s.reviewing.items, f) },
    blockers: { ...s.blockers, items: s.blockers.items.filter(keep) },
    waiting: { ...s.waiting, items: s.waiting.items.filter(keep) },
    notStarted: {
      ...s.notStarted,
      items: s.notStarted.items.filter(keep),
      offSprintItems: s.notStarted.offSprintItems.filter(keep),
    },
  };
}

export function filterFocusByItems(focus: FocusData, f: ItemFilter | null): FocusData {
  if (!f) return focus;
  const keep = (i: { ticketKey: string | null; pr: GitHubPR }) => hit(f, i.ticketKey, i.pr);
  return {
    needs: focus.needs.filter(keep),
    mentions: focus.mentions.filter(
      (m) => hit(f, m.ticketKey) || (!!m.url && f.prs.has(mentionPrUrl(m.url))),
    ),
    working: filterGroups(focus.working, f),
    waiting: {
      onReviewers: focus.waiting.onReviewers.filter(keep),
      onAuthor: focus.waiting.onAuthor.filter(keep),
      approved: focus.waiting.approved.filter(keep),
    },
  };
}

const repoOf = (url: string) => url.split("/")[4] ?? "";

/**
 * Every ticket, PR author and PR shown anywhere on the page (both modes), in
 * that order, for the header's searchable dropdown.
 */
export function itemFilterOptions(
  s: WorkdaySections,
  focus: FocusData,
  ticketTitles: Map<string, string>,
): DropdownItem[] {
  const tickets = new Map<string, string>();
  const prs = new Map<string, string>();
  const authors = new Map<string, string>();
  const addTicket = (key: string | null | undefined, summary?: string) => {
    if (!key) return;
    const title = summary || tickets.get(key) || ticketTitles.get(key) || "";
    tickets.set(key, title);
  };
  const addPR = (pr: GitHubPR | undefined) => {
    if (!pr) return;
    const { login, name } = pr.user;
    prs.set(pr.html_url, `${repoOf(pr.html_url)}#${pr.number} · ${pr.title} · @${login}`);
    if (login && (name || !authors.has(login))) authors.set(login, name ?? "");
  };
  const addGroups = (groups: TicketGroup[]) =>
    groups.forEach((g) => {
      addTicket(g.ticket?.key, g.ticket?.summary);
      g.prs.forEach(addPR);
    });

  const ticketed = [
    ...s.done.items,
    ...s.blockers.items,
    ...s.waiting.items,
    ...s.notStarted.items,
    ...s.notStarted.offSprintItems,
  ];
  for (const i of ticketed) {
    addTicket(i.ticket?.key, i.ticket?.summary);
    if ("pr" in i) addPR(i.pr);
  }
  addGroups(s.workingOn.items);
  addGroups(s.reviewing.items);
  focus.working.forEach((w) => {
    addTicket(w.ticket?.key, w.ticket?.summary);
    w.prs.forEach(addPR);
  });
  const keyed = [
    ...focus.needs,
    ...focus.waiting.onReviewers,
    ...focus.waiting.onAuthor,
    ...focus.waiting.approved,
  ];
  for (const i of keyed) {
    addTicket(i.ticketKey);
    addPR(i.pr);
  }
  for (const m of focus.mentions) {
    addTicket(m.ticketKey);
    if (m.source === "GitHub" && m.url && !prs.has(mentionPrUrl(m.url)))
      prs.set(mentionPrUrl(m.url), m.where);
  }

  return [
    ...[...tickets].map(([key, title]) => ({
      value: `${TICKET}${key}`,
      label: title ? `${key} · ${title}` : key,
    })),
    ...[...authors]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([login, name]) => ({
        value: `${AUTHOR}${login}`,
        label: name ? `@${login} · ${name}` : `@${login}`,
      })),
    ...[...prs].map(([url, label]) => ({ value: `${PR}${url}`, label })),
  ];
}
