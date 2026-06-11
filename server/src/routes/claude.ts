import { Router, Request, Response } from "express";
import { execSync } from "child_process";
import {
  createSession,
  getSession,
  listSessions,
  cancelSession,
  deleteSession,
  sendInput,
} from "../services/claudeSessionManager";

const router = Router();

let claudeSettings = {
  enabled: false,
  cliPath: "",
  workingDirectory: "",
  maxConcurrentSessions: 3,
};

export function setClaudeSettings(settings: {
  enabled: boolean;
  cliPath: string;
  workingDirectory: string;
  maxConcurrentSessions: number;
}): void {
  claudeSettings = settings;
}

router.get("/detect", (_req: Request, res: Response) => {
  try {
    const cliPath = execSync("which claude", { encoding: "utf-8" }).trim();
    let version = "";
    try {
      version = execSync(`${cliPath} --version`, { encoding: "utf-8" }).trim();
    } catch {
      // version detection failed but path is valid
    }
    res.json({ found: true, path: cliPath, version });
  } catch {
    res.json({ found: false, path: "", version: "" });
  }
});

router.post("/sessions", (req: Request, res: Response) => {
  if (!claudeSettings.enabled) {
    res
      .status(403)
      .json({ error: "Claude CLI integration is not enabled. Enable it in Settings." });
    return;
  }

  const { prNumber, repoFullName, prTitle, action, customPrompt, headBranch, baseBranch } = req.body || {};

  if (!prNumber || !repoFullName || !action) {
    res.status(400).json({ error: "Missing required fields: prNumber, repoFullName, action" });
    return;
  }

  try {
    const session = createSession({
      prNumber,
      repoFullName,
      prTitle: prTitle || `PR #${prNumber}`,
      action,
      customPrompt,
      headBranch: headBranch || "main",
      baseBranch: baseBranch || "main",
      claudeCliPath: claudeSettings.cliPath,
      workingDirectory: claudeSettings.workingDirectory,
      maxConcurrent: claudeSettings.maxConcurrentSessions,
    });

    res.status(201).json({ sessionId: session.id, status: session.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create session";
    const status = message.includes("Maximum concurrent") ? 429 : 400;
    res.status(status).json({ error: message });
  }
});

router.get("/sessions", (req: Request, res: Response) => {
  const status = (req.query.status as string) || "all";
  const result = listSessions(status);
  res.json(result);
});

router.get("/sessions/:id", (req: Request, res: Response) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { process: _p, subscribers: _s, ...rest } = session as Record<string, unknown>;
  res.json(rest);
});

router.post("/sessions/:id/cancel", (req: Request, res: Response) => {
  const success = cancelSession(req.params.id);
  if (!success) {
    res.status(404).json({ error: "Session not found or not running" });
    return;
  }
  res.json({ status: "cancelled" });
});

router.delete("/sessions/:id", (req: Request, res: Response) => {
  const success = deleteSession(req.params.id);
  if (!success) {
    res.status(404).json({ error: "Session not found or still running" });
    return;
  }
  res.json({ status: "deleted" });
});

router.post("/sessions/:id/input", (req: Request, res: Response) => {
  const { data } = req.body || {};
  if (!data) {
    res.status(400).json({ error: "Missing required field: data" });
    return;
  }

  const success = sendInput(req.params.id, data);
  if (!success) {
    res.status(404).json({ error: "Session not found or not running" });
    return;
  }
  res.json({ status: "sent" });
});

export default router;
