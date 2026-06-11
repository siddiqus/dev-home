import { apiClient } from "./config";
import type { ClaudeAction, ClaudeSession } from "../types/claude";

export async function createClaudeSession(opts: {
  prNumber: number;
  repoFullName: string;
  prTitle: string;
  action: ClaudeAction;
  customPrompt?: string;
  headBranch?: string;
  baseBranch?: string;
}): Promise<{ sessionId: string; status: string }> {
  const { data } = await apiClient.post("/claude/sessions", opts);
  return data;
}

export async function fetchClaudeSessions(status?: string): Promise<ClaudeSession[]> {
  const params = status ? { status } : {};
  const { data } = await apiClient.get("/claude/sessions", { params });
  return data;
}

export async function fetchClaudeSession(id: string): Promise<ClaudeSession> {
  const { data } = await apiClient.get(`/claude/sessions/${id}`);
  return data;
}

export async function cancelClaudeSession(id: string): Promise<{ status: string }> {
  const { data } = await apiClient.post(`/claude/sessions/${id}/cancel`);
  return data;
}

export async function deleteClaudeSession(id: string): Promise<{ status: string }> {
  const { data } = await apiClient.delete(`/claude/sessions/${id}`);
  return data;
}

export async function sendClaudeInput(id: string, input: string): Promise<{ status: string }> {
  const { data } = await apiClient.post(`/claude/sessions/${id}/input`, {
    data: input,
  });
  return data;
}
