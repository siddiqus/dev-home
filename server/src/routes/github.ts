import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { createGitHubClient } from "../clients/githubApiClient";
import axios from "axios";

const router = Router();

/**
 * Get an ISO date string for three months ago (YYYY-MM-DD).
 */
function threeMonthsAgoDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

/**
 * Extract repo full name (owner/repo) from a GitHub repository_url.
 */
function extractRepoFullName(repositoryUrl: string): string {
  const match = repositoryUrl?.match(/\/repos\/(.+)$/);
  return match ? match[1] : "";
}

/**
 * Map a GitHub search issue/PR item to a clean PR object.
 * The search API doesn't include head/base refs, so accept optional overrides.
 */
function mapPrItem(item: any, prDetails?: any) {
  return {
    id: item.id,
    number: item.number,
    title: item.title,
    html_url: item.html_url,
    state: item.state,
    draft: item.draft || prDetails?.draft || false,
    created_at: item.created_at,
    updated_at: item.updated_at,
    user: {
      login: item.user?.login,
      avatar_url: item.user?.avatar_url,
    },
    head: {
      ref: prDetails?.head?.ref || "",
    },
    base: {
      ref: prDetails?.base?.ref || "",
    },
    body: prDetails?.body || item.body || "",
    repository_url: item.repository_url,
    repo_full_name: extractRepoFullName(item.repository_url),
  };
}

/**
 * Fetch full PR details (including head/base refs) for a list of search result items.
 */
async function fetchPrDetails(items: any[]): Promise<Map<number, any>> {
  return new Map();

  // const client = createGitHubClient(""); // pass base url as empty because we want the full pr url
  // const detailsMap = new Map<number, any>();

  // const urls = items.map((item) => item.pull_request?.url).filter(Boolean);
  // const results = await Promise.all(urls.map((url) => client.get(url).then((res) => res.data)));
  // results.forEach((data, index) => {
  //   const itemId = items[index].id;
  //   detailsMap.set(itemId, data);
  // });

  // return detailsMap;
}

/**
 * GET /api/github/prs
 * Fetch open pull requests authored by the configured user.
 */
router.get("/prs", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const github = createGitHubClient();

    const q = `author:${config.githubUsername} type:pr state:open updated:>=${threeMonthsAgoDate()}`;

    const { data } = await github.get("/search/issues", {
      params: { q, sort: "updated", per_page: 50 },
    });

    const items = data.items || [];
    const detailsMap = await fetchPrDetails(items);
    const prs = items.map((item: any) => mapPrItem(item, detailsMap.get(item.id)));

    res.json({ prs });
  } catch (err: any) {
    const status = err.response?.status || 500;
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error("[GitHub /prs] Error:", status, message);
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/github/reviews
 * Fetch open PRs where the configured user's review is requested.
 */
router.get("/reviews", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const github = createGitHubClient();

    const q = `review-requested:${config.githubUsername} type:pr state:open updated:>=${threeMonthsAgoDate()}`;

    const { data } = await github.get("/search/issues", {
      params: { q, sort: "updated", per_page: 50 },
    });

    const items = data.items || [];
    const detailsMap = await fetchPrDetails(items);
    const reviews = items.map((item: any) => mapPrItem(item, detailsMap.get(item.id)));

    res.json({ reviews });
  } catch (err: any) {
    const status = err.response?.status || 500;
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error("[GitHub /reviews] Error:", status, message);
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/github/mentions
 * Fetch GitHub mentions from notifications and search results.
 */
router.get("/mentions", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const github = createGitHubClient();

    const cutoff = threeMonthsAgoDate();

    // Fetch from 2 sources in parallel
    const [notificationsRes, prMentionsRes] = await Promise.allSettled([
      github.get("/notifications", {
        params: { participating: true, all: false, per_page: 50, since: `${cutoff}T00:00:00Z` },
      }),
      github.get("/search/issues", {
        params: {
          q: `mentions:${config.githubUsername} type:pr state:open updated:>=${cutoff}`,
          sort: "updated",
          per_page: 30,
        },
      }),
    ]);

    const mentions: any[] = [];

    // Process notifications — fetch latest comment for each
    if (notificationsRes.status === "fulfilled") {
      const notifications = notificationsRes.value.data as any[];

      const commentFetches = notifications
        .filter((n: any) => n.subject?.latest_comment_url)
        .map(async (notification: any) => {
          try {
            const { data: comment } = await github.get(notification.subject.latest_comment_url);

            const repoFullName = notification.repository?.full_name || "";

            return {
              id: comment.id,
              html_url: comment.html_url,
              body: comment.body || "",
              created_at: comment.created_at,
              updated_at: comment.updated_at,
              user: {
                login: comment.user?.login,
                avatar_url: comment.user?.avatar_url,
              },
              issue_url: comment.issue_url || "",
              pr_number: null,
              repo_full_name: repoFullName,
              context_title: notification.subject?.title || "",
            };
          } catch {
            return null;
          }
        });

      const commentResults = await Promise.all(commentFetches);
      mentions.push(...commentResults.filter(Boolean));
    } else {
      console.error("[GitHub /mentions] Notifications error:", notificationsRes.reason?.message);
    }

    // Process PR mentions from search
    if (prMentionsRes.status === "fulfilled") {
      const prData = prMentionsRes.value.data;
      for (const item of prData.items || []) {
        mentions.push({
          id: item.id,
          html_url: item.html_url,
          body: item.body || "",
          created_at: item.created_at,
          updated_at: item.updated_at,
          user: {
            login: item.user?.login,
            avatar_url: item.user?.avatar_url,
          },
          issue_url: item.url || "",
          pr_number: item.number,
          repo_full_name: extractRepoFullName(item.repository_url),
          context_title: item.title || "",
        });
      }
    } else {
      console.error("[GitHub /mentions] PR search error:", prMentionsRes.reason?.message);
    }

    // Deduplicate by id
    const seen = new Set<number>();
    const deduplicated = mentions.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Sort by updated_at DESC
    deduplicated.sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    res.json({ mentions: deduplicated });
  } catch (err: any) {
    const status = err.response?.status || 500;
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error("[GitHub /mentions] Error:", status, message);
    res.status(status).json({ error: message });
  }
});

export default router;
