import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/config
 * Returns configuration status without exposing secrets.
 */
router.get('/', (_req: Request, res: Response) => {
  const jiraBaseUrl = process.env.JIRA_BASE_URL || '';
  const githubUsername = process.env.GITHUB_USERNAME || '';

  const configured = !!(
    process.env.JIRA_BASE_URL &&
    process.env.JIRA_EMAIL &&
    process.env.JIRA_API_TOKEN &&
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_USERNAME
  );

  // Mask the JIRA base URL to only show the domain
  let maskedJiraBaseUrl = '';
  if (jiraBaseUrl) {
    try {
      const url = new URL(jiraBaseUrl);
      maskedJiraBaseUrl = url.hostname;
    } catch {
      maskedJiraBaseUrl = jiraBaseUrl.replace(/https?:\/\//, '').split('/')[0];
    }
  }

  res.json({
    configured,
    jiraBaseUrl: maskedJiraBaseUrl,
    githubUsername,
  });
});

export default router;
