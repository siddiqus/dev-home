import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { WebSocket } from "ws";
import { buildPrompt } from "./claudePrompts";

export type ClaudeAction =
  | "review"
  | "address_comments"
  | "explain_comments"
  | "fix_ci"
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

const sessions = new Map<string, Session>();

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
              broadcastLine("stdout", `[Tool: ${block.name}] ${JSON.stringify(block.input).slice(0, 200)}`);
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
    session.status = code === 0 ? "completed" : "error";
    session.exitCode = code ?? 1;
    session.completedAt = new Date().toISOString();
    session.process = null;

    const duration =
      new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
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
    broadcast({
      type: "output",
      sessionId: id,
      data: entry.data,
      stream: "stderr",
      timestamp: entry.timestamp,
    });
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
