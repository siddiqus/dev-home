import { Router, Request, Response } from "express";
import { getConfig } from "../config";

const router = Router();

const GITHUB_API = "https://api.github.com";

/**
 * Get an ISO date string for three months ago (YYYY-MM-DD).
 */
function threeMonthsAgoDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

/**
 * Build authorization headers for GitHub API.
 */
function getGitHubHeaders() {
  const config = getConfig();
  return {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: "application/vnd.github+json",
  };
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
async function fetchPrDetails(
  items: any[],
  headers: Record<string, string>,
): Promise<Map<number, any>> {
  const detailsMap = new Map<number, any>();

  const fetches = items.map(async (item) => {
    const prUrl = item.pull_request?.url;
    if (!prUrl) return;

    try {
      const res = await fetch(prUrl, { headers });
      if (res.ok) {
        const details = await res.json();
        detailsMap.set(item.id, details);
      }
    } catch {
      // Silently skip — the PR will just have empty branch refs
    }
  });

  await Promise.all(fetches);
  return detailsMap;
}

/**
 * GET /api/github/prs
 * Fetch open pull requests authored by the configured user.
 */
router.get("/prs", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const headers = getGitHubHeaders();

    const q = `author:${config.githubUsername} type:pr state:open updated:>=${threeMonthsAgoDate()}`;
    const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&sort=updated&per_page=50`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[GitHub /prs] Error:", response.status, errorBody);
      return res.status(response.status).json({
        error: `GitHub API returned ${response.status}: ${errorBody}`,
      });
    }

    const data: any = await response.json();
    const items = data.items || [];
    const detailsMap = await fetchPrDetails(items, headers);
    const prs = items.map((item: any) => mapPrItem(item, detailsMap.get(item.id)));

    res.json({ prs });
  } catch (err: any) {
    console.error("[GitHub /prs] Exception:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/github/reviews
 * Fetch open PRs where the configured user's review is requested.
 */
router.get("/reviews", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const headers = getGitHubHeaders();

    const q = `review-requested:${config.githubUsername} type:pr state:open updated:>=${threeMonthsAgoDate()}`;
    const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&sort=updated&per_page=50`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[GitHub /reviews] Error:", response.status, errorBody);
      return res.status(response.status).json({
        error: `GitHub API returned ${response.status}: ${errorBody}`,
      });
    }

    const data: any = await response.json();
    const items = data.items || [];
    const detailsMap = await fetchPrDetails(items, headers);
    const reviews = items.map((item: any) => mapPrItem(item, detailsMap.get(item.id)));

    res.json({ reviews });
  } catch (err: any) {
    console.error("[GitHub /reviews] Exception:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/github/mentions
 * Fetch GitHub mentions from notifications and search results.
 */
router.get("/mentions", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const headers = getGitHubHeaders();

    // Fetch from 3 sources in parallel
    const cutoff = threeMonthsAgoDate();
    const [notificationsRes, prMentionsRes] = await Promise.all([
      fetch(
        `${GITHUB_API}/notifications?participating=true&all=false&per_page=50&since=${cutoff}T00:00:00Z`,
        { headers },
      ),
      fetch(
        `${GITHUB_API}/search/issues?q=${encodeURIComponent(
          `mentions:${config.githubUsername} type:pr state:open updated:>=${cutoff}`,
        )}&sort=updated&per_page=30`,
        { headers },
      ),
    ]);

    // Process notifications — fetch latest comment for each
    const mentions: any[] = [];

    if (notificationsRes.ok) {
      const notifications = (await notificationsRes.json()) as any[];

      const commentFetches = notifications
        .filter((n: any) => n.subject?.latest_comment_url)
        .map(async (notification: any) => {
          try {
            const commentRes = await fetch(notification.subject.latest_comment_url, { headers });

            if (!commentRes.ok) return null;

            const comment: any = await commentRes.json();

            // Extract repo full name from notification.repository
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
      console.error("[GitHub /mentions] Notifications error:", notificationsRes.status);
    }

    // Process PR mentions from search
    if (prMentionsRes.ok) {
      const prData: any = await prMentionsRes.json();
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
      console.error("[GitHub /mentions] PR search error:", prMentionsRes.status);
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
    console.error("[GitHub /mentions] Exception:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
