import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { WebSocket } from "ws";
import { buildPrompt } from "./claudePrompts";
import { getDb } from "../db";

export type ClaudeAction =
  | "review"
  | "explain_comments"
  | "investigate_ci"
  | "summarize"
  | "custom";
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
  headBranch: string;
  baseBranch: string;
  status: SessionStatus;
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  outputBuffer: OutputEntry[];
  process: ChildProcess | null;
  subscribers: Set<WebSocket>;
}

type SerializedSession = Omit<Session, "process" | "subscribers">;

const sessions = new Map<string, Session>();

function persistSession(session: Session): void {
  const lastOutputLine =
    [...session.outputBuffer]
      .reverse()
      .find((e) => e.stream === "stdout")
      ?.data.slice(0, 200) ?? null;

  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO claude_sessions
       (id, pr_number, repo_full_name, pr_title, action, custom_prompt,
        head_branch, base_branch, status, started_at, completed_at,
        exit_code, output_buffer, last_output_line, created_at)
     VALUES
       (@id, @prNumber, @repoFullName, @prTitle, @action, @customPrompt,
        @headBranch, @baseBranch, @status, @startedAt, @completedAt,
        @exitCode, @outputBuffer, @lastOutputLine, @createdAt)`,
  ).run({
    id: session.id,
    prNumber: session.prNumber,
    repoFullName: session.repoFullName,
    prTitle: session.prTitle,
    action: session.action,
    customPrompt: session.customPrompt ?? null,
    headBranch: session.headBranch,
    baseBranch: session.baseBranch,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? null,
    exitCode: session.exitCode ?? null,
    outputBuffer: JSON.stringify(session.outputBuffer),
    lastOutputLine: lastOutputLine,
    createdAt: session.startedAt,
  });
}

function dbRowToSession(row: Record<string, unknown>): SerializedSession {
  let outputBuffer: OutputEntry[] = [];
  if (row.output_buffer && typeof row.output_buffer === "string") {
    try {
      outputBuffer = JSON.parse(row.output_buffer);
    } catch {
      outputBuffer = [];
    }
  }

  return {
    id: row.id as string,
    prNumber: row.pr_number as number,
    repoFullName: row.repo_full_name as string,
    prTitle: row.pr_title as string,
    action: row.action as ClaudeAction,
    customPrompt: (row.custom_prompt as string) ?? undefined,
    headBranch: row.head_branch as string,
    baseBranch: row.base_branch as string,
    status: row.status as SessionStatus,
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string) ?? undefined,
    exitCode: (row.exit_code as number) ?? undefined,
    outputBuffer,
  };
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
  headBranch: string;
  baseBranch: string;
  claudeCliPath: string;
  workingDirectory: string;
  maxConcurrent: number;
}): Session {
  const activeCount = Array.from(sessions.values()).filter((s) => s.status === "running").length;
  if (activeCount >= opts.maxConcurrent) {
    throw new Error(
      `Maximum concurrent sessions (${opts.maxConcurrent}) reached. Cancel an active session first.`,
    );
  }

  const cwd = resolveWorkingDirectory(opts.workingDirectory, opts.repoFullName);
  if (!existsSync(cwd)) {
    throw new Error(
      `Repository directory not found: ${cwd}. Check your Claude working directory setting.`,
    );
  }

  if (!existsSync(opts.claudeCliPath)) {
    throw new Error(
      `Claude CLI not found at: ${opts.claudeCliPath}. Check your Claude CLI path setting.`,
    );
  }

  const prompt = buildPrompt(opts.action, {
    prNumber: opts.prNumber,
    repoFullName: opts.repoFullName,
    headBranch: opts.headBranch,
    baseBranch: opts.baseBranch,
    cwd,
    customPrompt: opts.customPrompt,
  });
  const id = randomUUID();

  const child = spawn(
    opts.claudeCliPath,
    ["--dangerously-skip-permissions", "--verbose", "--output-format", "stream-json", "-p", prompt],
    {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    },
  );

  const session: Session = {
    id,
    prNumber: opts.prNumber,
    repoFullName: opts.repoFullName,
    prTitle: opts.prTitle,
    action: opts.action,
    customPrompt: opts.customPrompt,
    headBranch: opts.headBranch,
    baseBranch: opts.baseBranch,
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

  const broadcastLine = (stream: "stdout" | "stderr", text: string) => {
    if (!text) return;
    const entry: OutputEntry = {
      timestamp: new Date().toISOString(),
      stream,
      data: text,
    };
    session.outputBuffer.push(entry);
    broadcast({ type: "output", sessionId: id, data: text, stream, timestamp: entry.timestamp });
  };

  let stdoutBuffer = "";

  const onStdout = (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "assistant" && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "text" && block.text) {
              broadcastLine("stdout", block.text);
            } else if (block.type === "tool_use") {
              broadcastLine(
                "stdout",
                `[Tool: ${block.name}] ${JSON.stringify(block.input).slice(0, 200)}`,
              );
            }
          }
        } else if (event.type === "result" && event.result) {
          broadcastLine("stdout", event.result);
        }
      } catch {
        broadcastLine("stdout", line);
      }
    }
  };

  const onStderr = (chunk: Buffer) => {
    broadcastLine("stderr", chunk.toString());
  };

  child.stdout?.on("data", onStdout);
  child.stderr?.on("data", onStderr);

  child.on("close", (code) => {
    if (!sessions.has(id)) return;

    session.status = code === 0 ? "completed" : "error";
    session.exitCode = code ?? 1;
    session.completedAt = new Date().toISOString();
    session.process = null;

    const duration =
      new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
    broadcast({ type: "done", sessionId: id, exitCode: session.exitCode, duration });

    persistSession(session);
    sessions.delete(id);
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
    broadcast({
      type: "output",
      sessionId: id,
      data: entry.data,
      stream: "stderr",
      timestamp: entry.timestamp,
    });
    broadcast({ type: "done", sessionId: id, exitCode: 1, duration: 0 });

    persistSession(session);
    sessions.delete(id);
  });

  return session;
}

export function getSession(id: string): Session | SerializedSession | undefined {
  const memSession = sessions.get(id);
  if (memSession) return memSession;

  const db = getDb();
  const row = db.prepare("SELECT * FROM claude_sessions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (row) return dbRowToSession(row);

  return undefined;
}

export function listSessions(status?: string): Omit<SerializedSession, "outputBuffer">[] {
  const memSessions = Array.from(sessions.values())
    .filter((s) => !status || status === "all" || s.status === status)
    .map(({ process: _p, subscribers: _s, outputBuffer, ...rest }) => ({
      ...rest,
      lastOutputLine:
        [...outputBuffer]
          .reverse()
          .find((e) => e.stream === "stdout")
          ?.data.slice(0, 200) ?? undefined,
    }));

  const shouldQueryDb =
    !status || status === "all" || ["completed", "cancelled", "error"].includes(status);

  let dbSessions: Omit<SerializedSession, "outputBuffer">[] = [];
  if (shouldQueryDb) {
    const db = getDb();
    let sql =
      "SELECT id, pr_number, repo_full_name, pr_title, action, custom_prompt, head_branch, base_branch, status, started_at, completed_at, exit_code, last_output_line, created_at FROM claude_sessions";
    const params: string[] = [];

    if (status && status !== "all") {
      sql += " WHERE status = ?";
      params.push(status);
    }

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    dbSessions = rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { outputBuffer: _ob, ...rest } = dbRowToSession({ ...row, output_buffer: "[]" });
      return {
        ...rest,
        lastOutputLine: (row.last_output_line as string) ?? undefined,
      };
    });
  }

  return [...memSessions, ...dbSessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export function cancelSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session || session.status !== "running") return false;

  session.process?.kill("SIGTERM");
  session.status = "cancelled";
  session.completedAt = new Date().toISOString();
  session.process = null;

  persistSession(session);
  sessions.delete(id);
  return true;
}

export function deleteSession(id: string): boolean {
  const memSession = sessions.get(id);
  if (memSession) {
    if (memSession.status === "running") return false;
    sessions.delete(id);
    return true;
  }

  const db = getDb();
  const result = db.prepare("DELETE FROM claude_sessions WHERE id = ?").run(id);
  return result.changes > 0;
}

export function sendInput(id: string, data: string): boolean {
  const session = sessions.get(id);
  if (!session || session.status !== "running" || !session.process?.stdin) return false;

  session.process.stdin.write(data + "\n");
  return true;
}

export function subscribe(id: string, ws: WebSocket): OutputEntry[] | null {
  const memSession = sessions.get(id);
  if (memSession) {
    memSession.subscribers.add(ws);
    ws.on("close", () => memSession.subscribers.delete(ws));
    return memSession.outputBuffer;
  }

  const db = getDb();
  const row = db.prepare("SELECT output_buffer FROM claude_sessions WHERE id = ?").get(id) as
    | { output_buffer: string }
    | undefined;
  if (row) {
    try {
      return JSON.parse(row.output_buffer || "[]");
    } catch {
      return [];
    }
  }

  return null;
}

export function getActiveSessionCount(): number {
  return Array.from(sessions.values()).filter((s) => s.status === "running").length;
}
