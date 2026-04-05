import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /api/config
 * Returns configuration status without exposing secrets.
 */
router.get("/", (_req: Request, res: Response) => {
  const jiraBaseUrl = process.env.JIRA_BASE_URL || "";
  const githubUsername = process.env.GITHUB_USERNAME || "";

  const configured = !!(
    process.env.JIRA_BASE_URL &&
    process.env.JIRA_EMAIL &&
    process.env.JIRA_API_TOKEN &&
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_USERNAME
  );

  res.json({
    configured,
    jiraBaseUrl: jiraBaseUrl.replace(/\/+$/, ""),
    githubUsername,
  });
});

export default router;
