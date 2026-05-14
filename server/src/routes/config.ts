import { Router, Request, Response } from "express";
import { isConfigured, setRuntimeConfig, getConfig } from "../config";

const router = Router();

/**
 * GET /api/config
 * Returns configuration status without exposing secrets.
 */
router.get("/", (_req: Request, res: Response) => {
  let jiraBaseUrl = "";
  let githubUsername = "";

  try {
    const config = getConfig();
    jiraBaseUrl = config.jiraBaseUrl;
    githubUsername = config.githubUsername;
  } catch {
    // Config not available yet — fall back to empty strings
  }

  res.json({
    configured: isConfigured(),
    jiraBaseUrl: jiraBaseUrl.replace(/\/+$/, ""),
    githubUsername,
  });
});

/**
 * POST /api/config
 * Accepts runtime configuration from the frontend.
 */
router.post("/", (req: Request, res: Response) => {
  const { jiraBaseUrl, jiraEmail, jiraApiToken, githubToken, githubUsername, githubOrg } =
    req.body || {};

  const fields: Record<string, unknown> = {
    jiraBaseUrl,
    jiraEmail,
    jiraApiToken,
    githubToken,
    githubUsername,
  };

  const invalid: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      invalid.push(key);
    }
  }

  if (invalid.length > 0) {
    res.status(400).json({
      error: `Missing or invalid fields: ${invalid.join(", ")}`,
    });
    return;
  }

  setRuntimeConfig({
    jiraBaseUrl: (jiraBaseUrl as string).replace(/\/+$/, ""),
    jiraEmail: jiraEmail as string,
    jiraApiToken: jiraApiToken as string,
    githubToken: githubToken as string,
    githubUsername: githubUsername as string,
    githubOrg: typeof githubOrg === "string" ? githubOrg.trim() : "",
  });

  res.json({ success: true });
});

/**
 * GET /api/config/settings
 * Returns non-secret settings for the settings form to populate.
 * API tokens are never exposed.
 */
router.get("/settings", (_req: Request, res: Response) => {
  let jiraBaseUrl = "";
  let jiraEmail = "";
  let githubUsername = "";

  try {
    const config = getConfig();
    jiraBaseUrl = config.jiraBaseUrl;
    jiraEmail = config.jiraEmail;
    githubUsername = config.githubUsername;
  } catch {
    // Config not available yet — fall back to empty strings
  }

  res.json({
    configured: isConfigured(),
    jiraBaseUrl,
    jiraEmail,
    githubUsername,
  });
});

export default router;
