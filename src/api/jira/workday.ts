import { jiraClient } from "../http";
import type { DoneTicket } from "../../types";
import { formatJqlDate } from "../../views/workday/dates";
import { getMyself } from "./issues";

/** Upper bound on "done since" tickets. */
const MAX_DONE = 50;

/**
 * Tickets whose status the current user changed after `since`, with the latest
 * such change. Histories by other people are ignored when the current user can
 * be resolved; otherwise JQL's CHANGED BY is trusted.
 */
export async function getDoneSince(
  since: Date,
  signal?: AbortSignal,
): Promise<{ tickets: DoneTicket[] }> {
  const jql = `status CHANGED BY currentUser() AFTER "${formatJqlDate(since)}" ORDER BY updated DESC`;
  const { data } = await jiraClient().post(
    "/search/jql",
    { jql, fields: ["summary"], expand: "changelog", maxResults: MAX_DONE },
    { signal },
  );
  const issues: any[] = data.issues || [];
  const me = issues.length > 0 ? await getMyself() : null;
  const sinceMs = since.getTime();

  const tickets: DoneTicket[] = [];
  for (const issue of issues) {
    let latest: { at: number; created: string; to: string } | null = null;
    for (const h of issue.changelog?.histories || []) {
      if (me && h.author?.accountId !== me.accountId) continue;
      const at = new Date(h.created).getTime();
      if (Number.isNaN(at) || at < sinceMs) continue;
      const item = (h.items || []).find((i: any) => i.field === "status");
      if (!item) continue;
      if (!latest || at > latest.at) latest = { at, created: h.created, to: item.toString ?? "" };
    }
    if (latest) {
      tickets.push({
        key: issue.key,
        summary: issue.fields?.summary ?? "",
        toStatus: latest.to,
        changedAt: latest.created,
      });
    }
  }
  return { tickets };
}
