# Claude CLI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude CLI integration to dev-home so users can trigger AI actions on PRs (Review, Address Comments, Fix CI, Summarize, Custom Prompt) with real-time WebSocket streaming and a dedicated sessions view.

**Architecture:** Express server manages Claude CLI child processes and streams output via WebSocket. REST endpoints handle session CRUD. A settings toggle gates the entire feature. Frontend has a dropdown on PR rows + a dedicated "Claude" sidebar view for managing sessions.

**Tech Stack:** React 18 + Bootstrap 5, Express 4, WebSocket (`ws`), Node.js `child_process.spawn`, Electron store, TypeScript

---

## File Structure

### New files:
| File | Responsibility |
|------|---------------|
| `server/src/services/claudeSessionManager.ts` | Session lifecycle, process spawning, output buffering, WebSocket broadcasting |
| `server/src/routes/claude.ts` | REST endpoints: create/list/get/cancel/delete sessions |
| `src/types/claude.ts` | Shared types: `ClaudeSession`, `ClaudeAction`, `ClaudeSettings` |
| `src/services/claude.ts` | Frontend API client for Claude session endpoints |
| `src/hooks/useClaudeWebSocket.ts` | WebSocket hook for streaming session output |
| `src/hooks/useClaudeSessions.ts` | Session state management hook (list, create, cancel) |
| `src/components/ClaudeActionDropdown.tsx` | Dropdown button for PR rows with context-aware highlighting |
| `src/components/ClaudeActionDropdown.css` | Styles for dropdown |
| `src/views/claude/ClaudeSessionsView.tsx` | Sessions list + detail view |
| `src/views/claude/ClaudeSessionsView.css` | Styles for sessions view |

### Modified files:
| File | Change |
|------|--------|
| `src/services/config.ts` | Add `claudeEnabled`, `claudeCliPath`, `claudeWorkingDirectory`, `claudeMaxConcurrentSessions` to `AppSettings` |
| `electron/store.ts` | Add Claude settings fields to schema |
| `electron/preload.ts` | (no change needed — settings flow through existing `getSettings`/`saveSettings`) |
| `server/src/index.ts` | Register `/api/claude` routes, attach WebSocket server to http.Server |
| `electron/main.ts` | Pass `httpServer` to WebSocket setup |
| `src/views/settings/SettingsView.tsx` | Add "AI Assistance" section with toggle + sub-settings |
| `src/components/PRTable.tsx` | Add Claude action button column when enabled |
| `src/App.tsx` | Add Claude sidebar item, route to `ClaudeSessionsView`, pass `claudeEnabled` state |

---

## Task 1: Types & Settings Foundation

**Files:**
- Create: `src/types/claude.ts`
- Modify: `src/services/config.ts`
- Modify: `electron/store.ts`

- [ ] **Step 1: Create Claude types file**

```typescript
// src/types/claude.ts

export type ClaudeAction =
  | "review"
  | "address_comments"
  | "fix_ci"
  | "summarize"
  | "custom";

export type ClaudeSessionStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "error";

export interface ClaudeSession {
  id: string;
  prNumber: number;
  repoFullName: string;
  prTitle: string;
  action: ClaudeAction;
  customPrompt?: string;
  status: ClaudeSessionStatus;
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  lastOutputLine?: string;
}

export interface ClaudeOutputMessage {
  type: "output";
  sessionId: string;
  data: string;
  stream: "stdout" | "stderr";
  timestamp: string;
}

export interface ClaudeDoneMessage {
  type: "done";
  sessionId: string;
  exitCode: number;
  duration: number;
}

export interface ClaudeInputMessage {
  type: "input";
  sessionId: string;
  data: string;
}

export interface ClaudeSubscribeMessage {
  type: "subscribe";
  sessionId: string;
}

export type ClaudeWsClientMessage = ClaudeInputMessage | ClaudeSubscribeMessage;
export type ClaudeWsServerMessage = ClaudeOutputMessage | ClaudeDoneMessage;

export const CLAUDE_ACTION_LABELS: Record<ClaudeAction, string> = {
  review: "Review PR",
  address_comments: "Address Comments",
  fix_ci: "Fix CI Failures",
  summarize: "Summarize Changes",
  custom: "Custom Prompt",
};
```

- [ ] **Step 2: Extend AppSettings with Claude fields**

In `src/services/config.ts`, add Claude settings to the `AppSettings` interface:

```typescript
export interface AppSettings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  githubOrg: string;
  claudeEnabled: boolean;
  claudeCliPath: string;
  claudeWorkingDirectory: string;
  claudeMaxConcurrentSessions: number;
}
```

- [ ] **Step 3: Extend Electron store schema**

In `electron/store.ts`, add the Claude fields to the `Settings` interface and schema:

```typescript
interface Settings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  githubToken: string;
  githubUsername: string;
  githubOrg: string;
  claudeEnabled: boolean;
  claudeCliPath: string;
  claudeWorkingDirectory: string;
  claudeMaxConcurrentSessions: number;
}

const store = new Store<Settings>({
  name: "dev-home-settings",
  schema: {
    // ... existing fields unchanged ...
    claudeEnabled: {
      type: "boolean",
      default: false,
    },
    claudeCliPath: {
      type: "string",
      default: "",
    },
    claudeWorkingDirectory: {
      type: "string",
      default: "",
    },
    claudeMaxConcurrentSessions: {
      type: "number",
      default: 3,
    },
  },
});
```

Update `getSettings()` to include the new fields:

```typescript
export function getSettings(): Settings {
  return {
    jiraBaseUrl: store.get("jiraBaseUrl"),
    jiraEmail: store.get("jiraEmail"),
    jiraApiToken: store.get("jiraApiToken"),
    githubToken: store.get("githubToken"),
    githubUsername: store.get("githubUsername"),
    githubOrg: store.get("githubOrg"),
    claudeEnabled: store.get("claudeEnabled"),
    claudeCliPath: store.get("claudeCliPath"),
    claudeWorkingDirectory: store.get("claudeWorkingDirectory"),
    claudeMaxConcurrentSessions: store.get("claudeMaxConcurrentSessions"),
  };
}
```

Update `setSettings()` to handle the new fields:

```typescript
export function setSettings(settings: Partial<Settings>): void {
  // ... existing fields ...
  if (settings.claudeEnabled !== undefined) store.set("claudeEnabled", settings.claudeEnabled);
  if (settings.claudeCliPath !== undefined) store.set("claudeCliPath", settings.claudeCliPath);
  if (settings.claudeWorkingDirectory !== undefined) store.set("claudeWorkingDirectory", settings.claudeWorkingDirectory);
  if (settings.claudeMaxConcurrentSessions !== undefined) store.set("claudeMaxConcurrentSessions", settings.claudeMaxConcurrentSessions);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types/claude.ts src/services/config.ts electron/store.ts
git commit -m "feat(claude): add types and settings foundation for Claude CLI integration"
```

---

## Task 2: Backend Session Manager

**Files:**
- Create: `server/src/services/claudeSessionManager.ts`

- [ ] **Step 1: Create the session manager**

```typescript
// server/src/services/claudeSessionManager.ts
import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { WebSocket } from "ws";

export type ClaudeAction = "review" | "address_comments" | "fix_ci" | "summarize" | "custom";
export type SessionStatus = "running" | "completed" | "cancelled" | "error";

interface OutputEntry {
  timestamp: string;
  stream: "stdout" | "stderr";
  data: string;
}

interface Session {
  id: string;
  prNumber: number;
  repoFullName: string;
  prTitle: string;
  action: ClaudeAction;
  customPrompt?: string;
  status: SessionStatus;
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  outputBuffer: OutputEntry[];
  process: ChildProcess | null;
  subscribers: Set<WebSocket>;
}

const sessions = new Map<string, Session>();

function buildPrompt(action: ClaudeAction, prNumber: number, repoFullName: string, customPrompt?: string): string {
  switch (action) {
    case "review":
      return `Review the code changes in PR #${prNumber} of ${repoFullName}. Analyze the diff, identify issues, and leave review comments on GitHub.`;
    case "address_comments":
      return `Read the review comments on PR #${prNumber} of ${repoFullName} and address each one. Make the necessary code changes.`;
    case "fix_ci":
      return `Investigate the CI failures on PR #${prNumber} of ${repoFullName}. Read the failing test output, identify the root cause, and fix it.`;
    case "summarize":
      return `Summarize the changes in PR #${prNumber} of ${repoFullName}. Generate a clear, concise PR description.`;
    case "custom":
      return `${customPrompt || ""} (Context: PR #${prNumber} in ${repoFullName})`;
  }
}

function resolveWorkingDirectory(workingDirectory: string, repoFullName: string): string {
  const repoName = repoFullName.split("/").pop() || repoFullName;
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const base = workingDirectory.replace(/^~/, home);
  return `${base}/${repoName}`;
}

export function createSession(opts: {
  prNumber: number;
  repoFullName: string;
  prTitle: string;
  action: ClaudeAction;
  customPrompt?: string;
  claudeCliPath: string;
  workingDirectory: string;
  maxConcurrent: number;
}): Session {
  const activeCount = Array.from(sessions.values()).filter((s) => s.status === "running").length;
  if (activeCount >= opts.maxConcurrent) {
    throw new Error(`Maximum concurrent sessions (${opts.maxConcurrent}) reached. Cancel an active session first.`);
  }

  const cwd = resolveWorkingDirectory(opts.workingDirectory, opts.repoFullName);
  if (!existsSync(cwd)) {
    throw new Error(`Repository directory not found: ${cwd}. Check your Claude working directory setting.`);
  }

  if (!existsSync(opts.claudeCliPath)) {
    throw new Error(`Claude CLI not found at: ${opts.claudeCliPath}. Check your Claude CLI path setting.`);
  }

  const prompt = buildPrompt(opts.action, opts.prNumber, opts.repoFullName, opts.customPrompt);
  const id = randomUUID();

  const child = spawn(opts.claudeCliPath, ["-p", prompt], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  const session: Session = {
    id,
    prNumber: opts.prNumber,
    repoFullName: opts.repoFullName,
    prTitle: opts.prTitle,
    action: opts.action,
    customPrompt: opts.customPrompt,
    status: "running",
    startedAt: new Date().toISOString(),
    outputBuffer: [],
    process: child,
    subscribers: new Set(),
  };

  sessions.set(id, session);

  const broadcast = (msg: object) => {
    const data = JSON.stringify(msg);
    for (const ws of session.subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  };

  const onData = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
    const text = chunk.toString();
    const entry: OutputEntry = {
      timestamp: new Date().toISOString(),
      stream,
      data: text,
    };
    session.outputBuffer.push(entry);
    broadcast({ type: "output", sessionId: id, data: text, stream, timestamp: entry.timestamp });
  };

  child.stdout?.on("data", onData("stdout"));
  child.stderr?.on("data", onData("stderr"));

  child.on("close", (code) => {
    session.status = code === 0 ? "completed" : "error";
    session.exitCode = code ?? 1;
    session.completedAt = new Date().toISOString();
    session.process = null;

    const duration = new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
    broadcast({ type: "done", sessionId: id, exitCode: session.exitCode, duration });
  });

  child.on("error", (err) => {
    session.status = "error";
    session.completedAt = new Date().toISOString();
    session.process = null;

    const entry: OutputEntry = {
      timestamp: new Date().toISOString(),
      stream: "stderr",
      data: `Process error: ${err.message}`,
    };
    session.outputBuffer.push(entry);
    broadcast({ type: "output", sessionId: id, data: entry.data, stream: "stderr", timestamp: entry.timestamp });
    broadcast({ type: "done", sessionId: id, exitCode: 1, duration: 0 });
  });

  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function listSessions(status?: string): Omit<Session, "process" | "subscribers">[] {
  return Array.from(sessions.values())
    .filter((s) => !status || status === "all" || s.status === status)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .map(({ process: _p, subscribers: _s, ...rest }) => rest);
}

export function cancelSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session || session.status !== "running") return false;

  session.process?.kill("SIGTERM");
  session.status = "cancelled";
  session.completedAt = new Date().toISOString();
  session.process = null;
  return true;
}

export function deleteSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session || session.status === "running") return false;
  return sessions.delete(id);
}

export function sendInput(id: string, data: string): boolean {
  const session = sessions.get(id);
  if (!session || session.status !== "running" || !session.process?.stdin) return false;

  session.process.stdin.write(data + "\n");
  return true;
}

export function subscribe(id: string, ws: WebSocket): OutputEntry[] | null {
  const session = sessions.get(id);
  if (!session) return null;

  session.subscribers.add(ws);
  ws.on("close", () => session.subscribers.delete(ws));

  return session.outputBuffer;
}

export function getActiveSessionCount(): number {
  return Array.from(sessions.values()).filter((s) => s.status === "running").length;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/claudeSessionManager.ts
git commit -m "feat(claude): add session manager for Claude CLI process lifecycle"
```

---

## Task 3: Backend Routes & WebSocket

**Files:**
- Create: `server/src/routes/claude.ts`
- Modify: `server/src/index.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Install the `ws` dependency**

```bash
yarn add ws && yarn add -D @types/ws
```

- [ ] **Step 2: Create Claude routes**

```typescript
// server/src/routes/claude.ts
import { Router, Request, Response } from "express";
import {
  createSession,
  getSession,
  listSessions,
  cancelSession,
  deleteSession,
  sendInput,
} from "../services/claudeSessionManager";

const router = Router();

// Claude settings are passed from Electron store via runtime config.
// We read them from a module-level variable set by the config route.
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

router.post("/sessions", (req: Request, res: Response) => {
  if (!claudeSettings.enabled) {
    res.status(403).json({ error: "Claude CLI integration is not enabled. Enable it in Settings." });
    return;
  }

  const { prNumber, repoFullName, prTitle, action, customPrompt } = req.body || {};

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

  const { process: _p, subscribers: _s, ...rest } = session;
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
```

- [ ] **Step 3: Update `server/src/index.ts` to register Claude routes and export the app for WebSocket attachment**

Add these imports at the top of the file:

```typescript
import claudeRoutes, { setClaudeSettings } from "./routes/claude";
```

Add the Claude routes alongside the existing routes (after the `app.use("/api/jira-filters", jiraFiltersRoutes);` line):

```typescript
app.use("/api/claude", claudeRoutes);
```

Change `createServer` to also accept and configure Claude settings, and return both the app and a setup function. Actually, keep it simple — just add the route. The Claude settings will be set via the config route's POST handler. Add this to `createServer()` right before the return:

No — cleaner approach: export a `configureClaudeSettings` function that the config POST route calls. Actually, the simplest approach: have `electron/main.ts` call `setClaudeSettings` after loading settings from the store, and on every settings save.

In `server/src/index.ts`, just add the route registration:

```typescript
// Add import at top
import claudeRoutes from "./routes/claude";

// Add route alongside existing routes
app.use("/api/claude", claudeRoutes);
```

- [ ] **Step 4: Set up WebSocket server in `electron/main.ts`**

In `electron/main.ts`, after the Express server starts, attach a WebSocket server to the same HTTP server. Add these imports:

```typescript
import { WebSocketServer, WebSocket } from "ws";
import { subscribe, sendInput } from "../server/src/services/claudeSessionManager";
import { setClaudeSettings } from "../server/src/routes/claude";
```

After `httpServer = expressApp.listen(...)` in `startBackendServer()`, add:

```typescript
  // Attach WebSocket server for Claude session streaming
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/claude" });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "subscribe" && msg.sessionId) {
          const buffer = subscribe(msg.sessionId, ws);
          if (buffer === null) {
            ws.send(JSON.stringify({ type: "error", message: "Session not found" }));
            return;
          }
          // Replay buffered output
          for (const entry of buffer) {
            ws.send(JSON.stringify({
              type: "output",
              sessionId: msg.sessionId,
              data: entry.data,
              stream: entry.stream,
              timestamp: entry.timestamp,
            }));
          }
        }

        if (msg.type === "input" && msg.sessionId && msg.data) {
          sendInput(msg.sessionId, msg.data);
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });
```

Also, after loading settings from the store (in `app.whenReady()`), sync Claude settings to the route module:

```typescript
  // After: ipcMain.handle("store:getSettings", ...)
  // Sync Claude settings to the server
  const initialSettings = getSettings();
  setClaudeSettings({
    enabled: initialSettings.claudeEnabled,
    cliPath: initialSettings.claudeCliPath,
    workingDirectory: initialSettings.claudeWorkingDirectory,
    maxConcurrentSessions: initialSettings.claudeMaxConcurrentSessions,
  });
```

Update the `store:setSettings` handler to also sync Claude settings:

```typescript
  ipcMain.handle("store:setSettings", (_event, settings) => {
    setSettings(settings);

    // Sync Claude settings to server
    const updated = getSettings();
    setClaudeSettings({
      enabled: updated.claudeEnabled,
      cliPath: updated.claudeCliPath,
      workingDirectory: updated.claudeWorkingDirectory,
      maxConcurrentSessions: updated.claudeMaxConcurrentSessions,
    });

    return { success: true };
  });
```

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/claude.ts server/src/index.ts electron/main.ts package.json yarn.lock
git commit -m "feat(claude): add REST routes, WebSocket streaming, and wire up to Electron"
```

---

## Task 4: Frontend API Client & WebSocket Hook

**Files:**
- Create: `src/services/claude.ts`
- Create: `src/hooks/useClaudeWebSocket.ts`
- Create: `src/hooks/useClaudeSessions.ts`

- [ ] **Step 1: Create the frontend API client**

```typescript
// src/services/claude.ts
import { apiClient } from "./config";
import type { ClaudeAction, ClaudeSession } from "../types/claude";

export async function createClaudeSession(opts: {
  prNumber: number;
  repoFullName: string;
  prTitle: string;
  action: ClaudeAction;
  customPrompt?: string;
}): Promise<{ sessionId: string; status: string }> {
  const { data } = await apiClient.post("/claude/sessions", opts);
  return data;
}

export async function fetchClaudeSessions(
  status?: string,
): Promise<ClaudeSession[]> {
  const params = status ? { status } : {};
  const { data } = await apiClient.get("/claude/sessions", { params });
  return data;
}

export async function fetchClaudeSession(id: string): Promise<ClaudeSession> {
  const { data } = await apiClient.get(`/claude/sessions/${id}`);
  return data;
}

export async function cancelClaudeSession(
  id: string,
): Promise<{ status: string }> {
  const { data } = await apiClient.post(`/claude/sessions/${id}/cancel`);
  return data;
}

export async function deleteClaudeSession(
  id: string,
): Promise<{ status: string }> {
  const { data } = await apiClient.delete(`/claude/sessions/${id}`);
  return data;
}

export async function sendClaudeInput(
  id: string,
  input: string,
): Promise<{ status: string }> {
  const { data } = await apiClient.post(`/claude/sessions/${id}/input`, {
    data: input,
  });
  return data;
}
```

- [ ] **Step 2: Create the WebSocket hook**

```typescript
// src/hooks/useClaudeWebSocket.ts
import { useEffect, useRef, useCallback, useState } from "react";
import { API_BASE } from "../services/config";
import type { ClaudeWsServerMessage } from "../types/claude";

interface OutputLine {
  data: string;
  stream: "stdout" | "stderr";
  timestamp: string;
}

interface UseClaudeWebSocketReturn {
  output: OutputLine[];
  connected: boolean;
  done: boolean;
  exitCode: number | null;
  duration: number | null;
  sendInput: (data: string) => void;
}

export function useClaudeWebSocket(sessionId: string | null): UseClaudeWebSocketReturn {
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    // Derive WebSocket URL from API_BASE (http://localhost:PORT/api → ws://localhost:PORT)
    const wsUrl = API_BASE.replace(/^http/, "ws").replace(/\/api$/, "") + "/ws/claude";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", sessionId }));
    };

    ws.onmessage = (event) => {
      const msg: ClaudeWsServerMessage = JSON.parse(event.data);

      if (msg.type === "output") {
        setOutput((prev) => [...prev, {
          data: msg.data,
          stream: msg.stream,
          timestamp: msg.timestamp,
        }]);
      }

      if (msg.type === "done") {
        setDone(true);
        setExitCode(msg.exitCode);
        setDuration(msg.duration);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  // Reset state when sessionId changes
  useEffect(() => {
    setOutput([]);
    setDone(false);
    setExitCode(null);
    setDuration(null);
  }, [sessionId]);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && sessionId) {
      wsRef.current.send(JSON.stringify({ type: "input", sessionId, data }));
    }
  }, [sessionId]);

  return { output, connected, done, exitCode, duration, sendInput };
}
```

- [ ] **Step 3: Create the sessions management hook**

```typescript
// src/hooks/useClaudeSessions.ts
import { useState, useCallback, useEffect, useRef } from "react";
import type { ClaudeSession, ClaudeAction } from "../types/claude";
import {
  fetchClaudeSessions,
  createClaudeSession,
  cancelClaudeSession,
  deleteClaudeSession,
} from "../services/claude";

interface UseClaudeSessionsReturn {
  sessions: ClaudeSession[];
  loading: boolean;
  error: string | null;
  activeCount: number;
  create: (opts: {
    prNumber: number;
    repoFullName: string;
    prTitle: string;
    action: ClaudeAction;
    customPrompt?: string;
  }) => Promise<string | null>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useClaudeSessions(enabled: boolean): UseClaudeSessionsReturn {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await fetchClaudeSessions("all");
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setSessions([]);
      return;
    }

    setLoading(true);
    refresh().finally(() => setLoading(false));

    // Poll every 5 seconds for session status updates
    intervalRef.current = setInterval(refresh, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, refresh]);

  const create = useCallback(async (opts: {
    prNumber: number;
    repoFullName: string;
    prTitle: string;
    action: ClaudeAction;
    customPrompt?: string;
  }): Promise<string | null> => {
    try {
      const result = await createClaudeSession(opts);
      await refresh();
      return result.sessionId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      return null;
    }
  }, [refresh]);

  const cancel = useCallback(async (id: string) => {
    try {
      await cancelClaudeSession(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel session");
    }
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteClaudeSession(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
    }
  }, [refresh]);

  const activeCount = sessions.filter((s) => s.status === "running").length;

  return { sessions, loading, error, activeCount, create, cancel, remove, refresh };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/services/claude.ts src/hooks/useClaudeWebSocket.ts src/hooks/useClaudeSessions.ts
git commit -m "feat(claude): add frontend API client, WebSocket hook, and sessions hook"
```

---

## Task 5: Settings UI — AI Assistance Section

**Files:**
- Modify: `src/views/settings/SettingsView.tsx`

- [ ] **Step 1: Add the AI Assistance section to SettingsView**

In `src/views/settings/SettingsView.tsx`, add new state and the "AI Assistance" card. The `EMPTY_SETTINGS` constant needs the new Claude fields:

```typescript
const EMPTY_SETTINGS: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  githubToken: "",
  githubUsername: "",
  githubOrg: "",
  claudeEnabled: false,
  claudeCliPath: "",
  claudeWorkingDirectory: "",
  claudeMaxConcurrentSessions: 3,
};
```

Add a state for Claude CLI detection status:

```typescript
const [claudeDetected, setClaudeDetected] = useState<{ found: boolean; version: string } | null>(null);
```

Add a detection function:

```typescript
const detectClaudeCli = async () => {
  try {
    const { data } = await apiClient.get("/claude/detect");
    setClaudeDetected({ found: data.found, version: data.version });
    if (data.found && data.path) {
      setFormState((prev) => ({ ...prev, claudeCliPath: data.path }));
    }
  } catch {
    setClaudeDetected({ found: false, version: "" });
  }
};
```

Add the UI card after the existing settings columns (before the closing `</div>`). Place it as a full-width row below the existing GitHub/JIRA columns:

```tsx
{/* AI Assistance Section */}
<Row className="mt-4">
  <Col lg={8}>
    <Card className="border-0 shadow-sm">
      <Card.Body>
        <h6 className="text-uppercase text-secondary-custom mb-3" style={{ fontSize: "0.6875rem", letterSpacing: "0.5px" }}>
          AI Assistance
        </h6>

        {/* Main toggle */}
        <div className="d-flex align-items-center justify-content-between p-3 rounded mb-3" style={{ background: "var(--color-bg-hover)" }}>
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>Enable AI assistance through Claude CLI</div>
            <div className="text-secondary-custom" style={{ fontSize: "0.75rem" }}>Allow dev-home to run Claude CLI commands to review PRs, fix issues, and more</div>
          </div>
          <Form.Check
            type="switch"
            id="claude-enabled"
            checked={formState.claudeEnabled}
            onChange={(e) => setFormState((prev) => ({ ...prev, claudeEnabled: e.target.checked }))}
          />
        </div>

        {/* Sub-settings (visible when enabled) */}
        {formState.claudeEnabled && (
          <div style={{ borderLeft: "2px solid var(--color-accent)", paddingLeft: 16, marginLeft: 4 }}>
            <Form.Group className="mb-3">
              <Form.Label style={labelStyle}>Claude CLI Path</Form.Label>
              <div className="d-flex gap-2">
                <Form.Control
                  type="text"
                  size="sm"
                  value={formState.claudeCliPath}
                  onChange={handleChange("claudeCliPath")}
                  placeholder="/usr/local/bin/claude"
                  style={{ fontFamily: "monospace" }}
                />
                <Button variant="outline-secondary" size="sm" onClick={detectClaudeCli}>
                  Detect
                </Button>
              </div>
              <Form.Text className="text-secondary-custom">
                Path to the Claude CLI binary. Click "Detect" to auto-find.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label style={labelStyle}>Default Working Directory</Form.Label>
              <Form.Control
                type="text"
                size="sm"
                value={formState.claudeWorkingDirectory}
                onChange={handleChange("claudeWorkingDirectory")}
                placeholder="~/code"
                style={{ fontFamily: "monospace" }}
              />
              <Form.Text className="text-secondary-custom">
                Base directory where your repos are cloned.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label style={labelStyle}>Max Concurrent Sessions</Form.Label>
              <Form.Control
                type="number"
                size="sm"
                min={1}
                max={10}
                value={formState.claudeMaxConcurrentSessions}
                onChange={(e) => setFormState((prev) => ({ ...prev, claudeMaxConcurrentSessions: parseInt(e.target.value) || 3 }))}
                style={{ width: 80 }}
              />
            </Form.Group>

            {/* Status indicator */}
            {claudeDetected && (
              <div className="d-flex align-items-center gap-2 p-2 rounded" style={{ background: "var(--color-bg-hover)", fontSize: "0.8rem" }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: claudeDetected.found ? "var(--color-status-success)" : "var(--color-status-danger)",
                  display: "inline-block",
                }} />
                {claudeDetected.found
                  ? `Claude CLI detected — version ${claudeDetected.version}`
                  : "Claude CLI not found at the specified path"}
              </div>
            )}
          </div>
        )}
      </Card.Body>
    </Card>
  </Col>
</Row>
```

Also add the `apiClient` import at the top of the file:

```typescript
import { AppSettings, loadSettingsFromStore, apiClient } from "../../services/config";
```

- [ ] **Step 2: Add the `/api/claude/detect` endpoint for CLI detection**

Add this route to `server/src/routes/claude.ts`:

```typescript
import { execSync } from "child_process";

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
```

- [ ] **Step 3: Commit**

```bash
git add src/views/settings/SettingsView.tsx server/src/routes/claude.ts
git commit -m "feat(claude): add AI Assistance settings section with CLI detection"
```

---

## Task 6: Claude Action Dropdown Component

**Files:**
- Create: `src/components/ClaudeActionDropdown.tsx`
- Create: `src/components/ClaudeActionDropdown.css`

- [ ] **Step 1: Create the dropdown component**

```tsx
// src/components/ClaudeActionDropdown.tsx
import React, { useState } from "react";
import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import {
  IconSearch,
  IconMessageDots,
  IconTool,
  IconFileDescription,
  IconTerminal,
} from "@tabler/icons-react";
import type { GitHubPR } from "../types";
import type { ClaudeAction } from "../types/claude";
import { CLAUDE_ACTION_LABELS } from "../types/claude";
import "./ClaudeActionDropdown.css";

interface ClaudeActionDropdownProps {
  pr: GitHubPR;
  onAction: (action: ClaudeAction, customPrompt?: string) => void;
}

const ACTION_CONFIG: {
  action: ClaudeAction;
  icon: React.ElementType;
  description: string;
}[] = [
  { action: "review", icon: IconSearch, description: "Analyze code changes & leave comments" },
  { action: "address_comments", icon: IconMessageDots, description: "Fix issues raised in review" },
  { action: "fix_ci", icon: IconTool, description: "Investigate & fix failing checks" },
  { action: "summarize", icon: IconFileDescription, description: "Generate PR description & summary" },
  { action: "custom", icon: IconTerminal, description: "Tell Claude what to do" },
];

function getSuggestedAction(pr: GitHubPR): ClaudeAction | null {
  if (pr.review_status === "CHANGES_REQUESTED") return "address_comments";
  if (pr.checks_status === "FAILURE") return "fix_ci";
  if (!pr.review_status) return "review";
  if (!pr.body || pr.body.trim() === "") return "summarize";
  return null;
}

export const ClaudeActionDropdown: React.FC<ClaudeActionDropdownProps> = ({
  pr,
  onAction,
}) => {
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const suggested = getSuggestedAction(pr);

  const handleAction = (action: ClaudeAction) => {
    if (action === "custom") {
      setShowCustomPrompt(true);
    } else {
      onAction(action);
    }
  };

  const handleCustomSubmit = () => {
    if (customPrompt.trim()) {
      onAction("custom", customPrompt.trim());
      setShowCustomPrompt(false);
      setCustomPrompt("");
    }
  };

  return (
    <>
      <Dropdown onClick={(e) => e.stopPropagation()}>
        <Dropdown.Toggle
          size="sm"
          variant="outline-primary"
          className="claude-action-toggle"
        >
          Claude
        </Dropdown.Toggle>

        <Dropdown.Menu className="claude-action-menu">
          <Dropdown.Header>Claude Actions</Dropdown.Header>
          {ACTION_CONFIG.map(({ action, icon: Icon, description }) => (
            <Dropdown.Item
              key={action}
              onClick={() => handleAction(action)}
              className={`claude-action-item${suggested === action ? " suggested" : ""}`}
            >
              <Icon size={16} />
              <div className="claude-action-item-text">
                <div className="claude-action-item-label">
                  {CLAUDE_ACTION_LABELS[action]}
                  {suggested === action && (
                    <span className="claude-suggested-badge">Suggested</span>
                  )}
                </div>
                <div className="claude-action-item-description">{description}</div>
              </div>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>

      <Modal
        show={showCustomPrompt}
        onHide={() => setShowCustomPrompt(false)}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>Custom Claude Prompt</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-secondary-custom mb-2" style={{ fontSize: "0.8125rem" }}>
            PR #{pr.number}: {pr.title} ({pr.repo_full_name})
          </p>
          <Form.Control
            as="textarea"
            rows={4}
            placeholder="Tell Claude what to do with this PR..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleCustomSubmit();
              }
            }}
          />
          <Form.Text className="text-secondary-custom">
            Press Cmd+Enter to submit
          </Form.Text>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowCustomPrompt(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleCustomSubmit} disabled={!customPrompt.trim()}>
            Run
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};
```

- [ ] **Step 2: Create the dropdown styles**

```css
/* src/components/ClaudeActionDropdown.css */

.claude-action-toggle {
  font-size: 0.75rem;
  padding: 2px 10px;
  font-weight: 500;
}

.claude-action-menu {
  min-width: 260px;
}

.claude-action-item {
  display: flex !important;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 14px !important;
}

.claude-action-item.suggested {
  background: var(--color-status-info-bg);
}

.claude-action-item-text {
  flex: 1;
  min-width: 0;
}

.claude-action-item-label {
  font-size: 0.8125rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.claude-action-item-description {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  margin-top: 1px;
}

.claude-suggested-badge {
  font-size: 0.625rem;
  background: var(--color-accent);
  color: white;
  padding: 0 5px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ClaudeActionDropdown.tsx src/components/ClaudeActionDropdown.css
git commit -m "feat(claude): add ClaudeActionDropdown component with context-aware suggestions"
```

---

## Task 7: Claude Sessions View

**Files:**
- Create: `src/views/claude/ClaudeSessionsView.tsx`
- Create: `src/views/claude/ClaudeSessionsView.css`

- [ ] **Step 1: Create the sessions view**

```tsx
// src/views/claude/ClaudeSessionsView.tsx
import React, { useState, useRef, useEffect } from "react";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { IconArrowLeft } from "@tabler/icons-react";
import type { ClaudeSession } from "../../types/claude";
import { CLAUDE_ACTION_LABELS } from "../../types/claude";
import { useClaudeWebSocket } from "../../hooks/useClaudeWebSocket";
import { formatRelativeTime } from "../../utils/time";
import "./ClaudeSessionsView.css";

interface ClaudeSessionsViewProps {
  sessions: ClaudeSession[];
  loading: boolean;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

type FilterTab = "active" | "completed" | "all";

export const ClaudeSessionsView: React.FC<ClaudeSessionsViewProps> = ({
  sessions,
  loading,
  onCancel,
  onDelete,
}) => {
  const [filter, setFilter] = useState<FilterTab>("active");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const filteredSessions = sessions.filter((s) => {
    if (filter === "active") return s.status === "running";
    if (filter === "completed") return s.status !== "running";
    return true;
  });

  const activeSessions = sessions.filter((s) => s.status === "running");
  const completedSessions = sessions.filter((s) => s.status !== "running");

  if (selectedSessionId) {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session) {
      setSelectedSessionId(null);
      return null;
    }
    return (
      <SessionDetailView
        session={session}
        onBack={() => setSelectedSessionId(null)}
        onCancel={() => onCancel(session.id)}
      />
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h5 className="mb-0" style={{ fontSize: "1rem", fontWeight: 600 }}>Claude Sessions</h5>
      </div>

      {/* Filter tabs */}
      <div className="d-flex gap-2 mb-3">
        <Button
          size="sm"
          variant={filter === "active" ? "primary" : "outline-secondary"}
          onClick={() => setFilter("active")}
          className="rounded-pill"
        >
          Active ({activeSessions.length})
        </Button>
        <Button
          size="sm"
          variant={filter === "completed" ? "primary" : "outline-secondary"}
          onClick={() => setFilter("completed")}
          className="rounded-pill"
        >
          Completed ({completedSessions.length})
        </Button>
        <Button
          size="sm"
          variant={filter === "all" ? "primary" : "outline-secondary"}
          onClick={() => setFilter("all")}
          className="rounded-pill"
        >
          All
        </Button>
      </div>

      {loading && sessions.length === 0 && (
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" variant="secondary" />
        </div>
      )}

      {!loading && filteredSessions.length === 0 && (
        <div className="text-center py-5 text-secondary-custom">
          <p>No {filter === "all" ? "" : filter} sessions</p>
          <p style={{ fontSize: "0.8rem" }}>
            Use the Claude button on a PR to start a session
          </p>
        </div>
      )}

      <div className="claude-sessions-list">
        {filteredSessions.map((session) => (
          <div
            key={session.id}
            className={`claude-session-card${session.status === "running" ? " active" : ""}`}
          >
            <div className="d-flex align-items-center justify-content-between mb-1">
              <div className="d-flex align-items-center gap-2">
                <span className={`claude-status-dot ${session.status}`} />
                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  {CLAUDE_ACTION_LABELS[session.action]}
                </span>
                <Badge bg="secondary" className="fw-normal" style={{ fontSize: "0.7rem" }}>
                  {session.repoFullName}
                </Badge>
                {session.status !== "running" && (
                  <Badge
                    bg={session.status === "completed" ? "success" : session.status === "cancelled" ? "warning" : "danger"}
                    style={{ fontSize: "0.65rem" }}
                  >
                    {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                  </Badge>
                )}
              </div>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setSelectedSessionId(session.id)}
                  style={{ fontSize: "0.75rem" }}
                >
                  View
                </Button>
                {session.status === "running" ? (
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => onCancel(session.id)}
                    style={{ fontSize: "0.75rem" }}
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => onDelete(session.id)}
                    style={{ fontSize: "0.75rem" }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <div className="text-secondary-custom" style={{ fontSize: "0.8rem" }}>
              PR #{session.prNumber}: {session.prTitle}
            </div>
            {session.lastOutputLine && (
              <div className="claude-session-preview">
                ▶ {session.lastOutputLine}
              </div>
            )}
            <div className="text-secondary-custom" style={{ fontSize: "0.7rem", marginTop: 4 }}>
              {session.status === "running"
                ? `Started ${formatRelativeTime(session.startedAt)}`
                : `${session.status === "completed" ? "Completed" : session.status === "cancelled" ? "Cancelled" : "Errored"} ${formatRelativeTime(session.completedAt!)}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Session Detail (inline sub-component) ──

interface SessionDetailViewProps {
  session: ClaudeSession;
  onBack: () => void;
  onCancel: () => void;
}

const SessionDetailView: React.FC<SessionDetailViewProps> = ({
  session,
  onBack,
  onCancel,
}) => {
  const { output, done, exitCode, duration, sendInput } = useClaudeWebSocket(session.id);
  const [inputValue, setInputValue] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleSendInput = () => {
    if (inputValue.trim()) {
      sendInput(inputValue.trim());
      setInputValue("");
    }
  };

  const isRunning = session.status === "running" && !done;

  return (
    <div className="claude-session-detail">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-3">
          <Button variant="outline-secondary" size="sm" onClick={onBack}>
            <IconArrowLeft size={14} />
          </Button>
          <span style={{ fontWeight: 600 }}>{CLAUDE_ACTION_LABELS[session.action]}</span>
          <Badge bg="secondary" className="fw-normal" style={{ fontSize: "0.75rem" }}>
            PR #{session.prNumber} · {session.prTitle}
          </Badge>
        </div>
        {isRunning && (
          <Button variant="outline-danger" size="sm" onClick={onCancel}>
            Cancel Session
          </Button>
        )}
      </div>

      {/* Terminal output */}
      <div className="claude-terminal" ref={outputRef}>
        {output.map((line, i) => (
          <div key={i} className={`claude-terminal-line ${line.stream}`}>
            {line.data}
          </div>
        ))}
        {isRunning && <span className="claude-cursor">█</span>}
        {done && (
          <div className="claude-terminal-done">
            {exitCode === 0 ? "✓ Session completed" : `✗ Session ended with exit code ${exitCode}`}
            {duration != null && ` (${Math.round(duration / 1000)}s)`}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="claude-input-bar">
        <Form.Control
          type="text"
          size="sm"
          placeholder={isRunning ? "Send a follow-up message to Claude..." : "Session ended"}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSendInput();
          }}
          disabled={!isRunning}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSendInput}
          disabled={!isRunning || !inputValue.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create the styles**

```css
/* src/views/claude/ClaudeSessionsView.css */

.claude-sessions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.claude-session-card {
  padding: 12px 16px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-bg-panel);
}

.claude-session-card.active {
  border-left: 3px solid var(--color-accent);
}

.claude-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.claude-status-dot.running {
  background: var(--color-status-success);
  animation: claude-pulse 2s infinite;
}

.claude-status-dot.completed {
  background: var(--color-text-muted);
}

.claude-status-dot.cancelled {
  background: var(--color-status-warning);
}

.claude-status-dot.error {
  background: var(--color-status-danger);
}

.claude-session-preview {
  font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-app);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  margin-top: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Session Detail */
.claude-session-detail {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
}

.claude-terminal {
  flex: 1;
  background: #0d1117;
  padding: 16px;
  border-radius: var(--radius-md);
  font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
  font-size: 0.78rem;
  line-height: 1.7;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.claude-terminal-line.stdout {
  color: #c9d1d9;
}

.claude-terminal-line.stderr {
  color: #f85149;
}

.claude-terminal-done {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #30363d;
  color: #8b949e;
}

.claude-cursor {
  color: #f0883e;
  animation: claude-blink 1s infinite;
}

.claude-input-bar {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

@keyframes claude-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes claude-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/claude/ClaudeSessionsView.tsx src/views/claude/ClaudeSessionsView.css
git commit -m "feat(claude): add ClaudeSessionsView with list and detail views"
```

---

## Task 8: Wire Everything Into App.tsx and PRTable

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/PRTable.tsx`

- [ ] **Step 1: Add Claude to App.tsx**

Add imports at the top of `src/App.tsx`:

```typescript
import { IconSparkles } from "@tabler/icons-react";
import { useClaudeSessions } from "./hooks/useClaudeSessions";
import { ClaudeSessionsView } from "./views/claude/ClaudeSessionsView";
```

Inside `App()`, after the existing hooks (after `const pomodoro = usePomodoro(...)`), add:

```typescript
const claudeEnabled = !!formState?.claudeEnabled;
```

Wait — `App.tsx` doesn't have direct access to `formState`. The `useConfig` hook returns `configured` and the settings are loaded internally. We need to expose `claudeEnabled` from the config. The cleanest approach: load it from the Electron store just like other settings.

Add this state to `App()`:

```typescript
const [claudeEnabled, setClaudeEnabled] = useState(false);

useEffect(() => {
  async function loadClaudeEnabled() {
    if (!window.electronAPI) return;
    try {
      const settings = await window.electronAPI.getSettings();
      setClaudeEnabled(settings.claudeEnabled ?? false);
    } catch {
      // ignore
    }
  }
  loadClaudeEnabled();
}, [configured]);
```

Then add the Claude sessions hook:

```typescript
const {
  sessions: claudeSessions,
  loading: claudeLoading,
  activeCount: claudeActiveCount,
  create: createClaudeSession,
  cancel: cancelClaudeSession,
  remove: removeClaudeSession,
} = useClaudeSessions(claudeEnabled);
```

In the sidebar items array, add the Claude entry after the `pomodoro` entry (before the `.map()`):

```typescript
...(claudeEnabled
  ? [
      {
        key: "claude",
        label: "Claude",
        icon: IconSparkles,
        count: claudeActiveCount > 0 ? claudeActiveCount : undefined,
      },
    ]
  : []),
```

In the view rendering section (inside the `<div className="tab-content-area">` switch), add the Claude view:

```tsx
{effectiveTab === "claude" && (
  <ClaudeSessionsView
    sessions={claudeSessions}
    loading={claudeLoading}
    onCancel={cancelClaudeSession}
    onDelete={removeClaudeSession}
  />
)}
```

Also pass `claudeEnabled`, `createClaudeSession`, and `setActiveTab` to the PR views. Update the `PRsView` usage:

```tsx
{effectiveTab === "prs" && (
  <PRsView
    openPRs={openPRs}
    loading={loading}
    jiraIssues={jiraIssues}
    jiraBaseUrl={jiraBaseUrl}
    configured={configured}
    refreshKey={refreshKey}
    claudeEnabled={claudeEnabled}
    onClaudeAction={(action, pr, customPrompt) => {
      createClaudeSession({
        prNumber: pr.number,
        repoFullName: pr.repo_full_name,
        prTitle: pr.title,
        action,
        customPrompt,
      }).then((sessionId) => {
        if (sessionId) setActiveTab("claude");
      });
    }}
  />
)}
```

Do the same for the reviews tab:

```tsx
{effectiveTab === "reviews" && (
  <PRTable
    prs={reviewRequests}
    loading={loading}
    jiraIssues={jiraIssues}
    variant="review-requests"
    jiraBaseUrl={jiraBaseUrl}
    claudeEnabled={claudeEnabled}
    onClaudeAction={(action, pr, customPrompt) => {
      createClaudeSession({
        prNumber: pr.number,
        repoFullName: pr.repo_full_name,
        prTitle: pr.title,
        action,
        customPrompt,
      }).then((sessionId) => {
        if (sessionId) setActiveTab("claude");
      });
    }}
  />
)}
```

Update the `saveSettings` callback passed to `SettingsView` to refresh `claudeEnabled`:

```typescript
const handleSaveSettings = async (settings: AppSettings) => {
  await saveSettings(settings);
  setClaudeEnabled(settings.claudeEnabled ?? false);
};
```

And pass `handleSaveSettings` instead of `saveSettings` to `SettingsView`:

```tsx
<SettingsView
  ...
  saveSettings={handleSaveSettings}
  ...
/>
```

- [ ] **Step 2: Add Claude action button to PRTable**

In `src/components/PRTable.tsx`, add imports:

```typescript
import { ClaudeActionDropdown } from "./ClaudeActionDropdown";
import type { ClaudeAction } from "../types/claude";
```

Extend the `PRTableProps` interface:

```typescript
interface PRTableProps {
  prs: GitHubPR[];
  loading: boolean;
  jiraIssues?: JiraIssue[];
  jiraBaseUrl?: string;
  variant: PRTableVariant;
  claudeEnabled?: boolean;
  onClaudeAction?: (action: ClaudeAction, pr: GitHubPR, customPrompt?: string) => void;
}
```

Add `claudeEnabled` and `onClaudeAction` to the destructured props:

```typescript
export const PRTable: React.FC<PRTableProps> = ({
  prs,
  loading,
  jiraIssues = [],
  jiraBaseUrl = "",
  variant,
  claudeEnabled = false,
  onClaudeAction,
}) => {
```

In the table body, after the existing cells in each PR row, add the Claude action cell (inside the `{group.prs.map(...)}`). Find the line that renders the external link `<td>` (or the closing `</tr>`) for each PR row.

The cleanest approach: add a conditional last `<td>` at the end of each row. In the row rendering (there are two places — the grouped rows and ungrouped rows), add after the last `renderCell()` call:

```tsx
{claudeEnabled && onClaudeAction && (
  <td style={{ textAlign: "right", width: 90 }}>
    <ClaudeActionDropdown
      pr={pr}
      onAction={(action, customPrompt) => onClaudeAction(action, pr, customPrompt)}
    />
  </td>
)}
```

Also add a corresponding `<th>` in the header:

```tsx
{claudeEnabled && <th style={{ width: 90 }}></th>}
```

And a `<col>` in the `<colgroup>`:

```tsx
{claudeEnabled && <col style={{ width: "90px" }} />}
```

Make sure to also add `colSpan` +1 to the ticket group header `<td>` when `claudeEnabled` is true:

```tsx
<td colSpan={columns.length + (claudeEnabled ? 1 : 0)}>
```

- [ ] **Step 3: Update PRsView to pass Claude props through**

In `src/views/prs/PRsView.tsx`, add the Claude props to the component's props interface and pass them through to the `PRTable` instances inside.

Add to the interface:

```typescript
claudeEnabled?: boolean;
onClaudeAction?: (action: ClaudeAction, pr: GitHubPR, customPrompt?: string) => void;
```

Pass to each `<PRTable>` inside:

```tsx
claudeEnabled={claudeEnabled}
onClaudeAction={onClaudeAction}
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/PRTable.tsx src/views/prs/PRsView.tsx
git commit -m "feat(claude): wire Claude into App, sidebar, PRTable, and PRsView"
```

---

## Task 9: Manual Testing & Polish

- [ ] **Step 1: Start the dev server**

```bash
yarn dev
```

- [ ] **Step 2: Test the settings flow**

1. Navigate to Settings
2. Toggle "Enable AI assistance through Claude CLI" ON
3. Click "Detect" to find the Claude CLI path
4. Set a working directory
5. Save settings
6. Verify the "Claude" sidebar item appears

- [ ] **Step 3: Test the PR action flow**

1. Navigate to Pull Requests
2. Verify the "Claude" dropdown appears on each PR row
3. Click the dropdown — verify all 5 actions are listed
4. Verify context-aware highlighting (e.g., "Address Comments" highlighted on a PR with changes requested)
5. Click "Review PR" on a PR — verify it navigates to the Claude sessions view
6. Verify the session appears in the list with a green pulsing dot
7. Click "View" — verify terminal output is streaming

- [ ] **Step 4: Test the session detail view**

1. Verify output auto-scrolls
2. Type a follow-up message in the input bar and press Enter
3. Verify the message is sent to Claude
4. Wait for session to complete — verify status updates
5. Verify the input bar is disabled after completion

- [ ] **Step 5: Test multiple sessions**

1. Start a second Claude action on a different PR
2. Verify both sessions appear in the sessions list
3. Verify the sidebar badge shows the correct active count
4. Cancel one session — verify status updates
5. Remove a completed session — verify it disappears

- [ ] **Step 6: Test the disabled state**

1. Toggle Claude OFF in settings
2. Verify the Claude sidebar item disappears
3. Verify the Claude dropdown disappears from PR rows

- [ ] **Step 7: Commit any polish fixes**

```bash
git add -A
git commit -m "feat(claude): polish and fix integration issues"
```
