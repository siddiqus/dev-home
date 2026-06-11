export type ClaudeAction =
  | "review"
  | "address_comments"
  | "explain_comments"
  | "fix_ci"
  | "summarize"
  | "custom";

export type ClaudeSessionStatus = "running" | "completed" | "cancelled" | "error";

export interface ClaudeSession {
  id: string;
  prNumber: number;
  repoFullName: string;
  prTitle: string;
  action: ClaudeAction;
  customPrompt?: string;
  headBranch?: string;
  baseBranch?: string;
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
  explain_comments: "Explain Comments",
  fix_ci: "Fix CI Failures",
  summarize: "Summarize Changes",
  custom: "Custom Prompt",
};
