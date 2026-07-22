import React from "react";
import Dropdown from "react-bootstrap/Dropdown";
import {
  IconSearch,
  IconTool,
  IconFileDescription,
  IconSparkles,
  IconInfoCircle,
  IconPlayerPlay,
} from "@tabler/icons-react";
import type { GitHubPR } from "../types";
import type { ClaudeAction, ClaudeSession } from "../types/claude";
import { CLAUDE_ACTION_LABELS } from "../types/claude";
import "./ClaudeActionDropdown.css";

interface ClaudeActionDropdownProps {
  pr: GitHubPR;
  onAction: (action: ClaudeAction, customPrompt?: string) => void;
  activeSessions?: ClaudeSession[];
  onViewSession?: (sessionId: string) => void;
}

const ACTION_CONFIG: {
  action: ClaudeAction;
  icon: React.ElementType;
  description: string;
}[] = [
  { action: "review", icon: IconSearch, description: "Analyze code changes & leave comments" },
  {
    action: "explain_comments",
    icon: IconInfoCircle,
    description: "Explain what reviewers are asking for",
  },
  {
    action: "investigate_ci",
    icon: IconTool,
    description: "Investigate failing checks & suggest fixes",
  },
  {
    action: "summarize",
    icon: IconFileDescription,
    description: "Generate PR description & summary",
  },
];

function getSuggestedAction(pr: GitHubPR): ClaudeAction | null {
  if (pr.checks_status === "FAILURE") return "investigate_ci";
  if (!pr.review_status) return "review";
  if (!pr.body || pr.body.trim() === "") return "summarize";
  return null;
}

export const ClaudeActionDropdown: React.FC<ClaudeActionDropdownProps> = ({
  pr,
  onAction,
  activeSessions,
  onViewSession,
}) => {
  const suggested = getSuggestedAction(pr);

  const prSessions =
    activeSessions?.filter(
      (s) =>
        s.prNumber === pr.number && s.repoFullName === pr.repo_full_name && s.status === "running",
    ) || [];

  return (
    <Dropdown onClick={(e) => e.stopPropagation()}>
      <Dropdown.Toggle
        size="sm"
        variant={prSessions.length > 0 ? "success" : "outline-secondary"}
        className="claude-action-toggle"
      >
        <IconSparkles size={"1rem"} />
      </Dropdown.Toggle>

      <Dropdown.Menu
        className="claude-action-menu"
        renderOnMount
        popperConfig={{ strategy: "fixed" }}
      >
        {prSessions.length > 0 && onViewSession && (
          <>
            {prSessions.map((s) => (
              <Dropdown.Item
                key={s.id}
                onClick={() => onViewSession(s.id)}
                className="claude-action-item suggested"
              >
                <IconPlayerPlay size={16} />
                <div className="claude-action-item-text">
                  <div className="claude-action-item-label">
                    {CLAUDE_ACTION_LABELS[s.action]} — Active
                  </div>
                  <div className="claude-action-item-description">View running session</div>
                </div>
              </Dropdown.Item>
            ))}
            <Dropdown.Divider />
          </>
        )}
        <Dropdown.Header>Claude Actions</Dropdown.Header>
        {ACTION_CONFIG.map(({ action, icon: Icon, description }) => (
          <Dropdown.Item
            key={action}
            onClick={() => onAction(action)}
            className={`claude-action-item${suggested === action ? " suggested" : ""}`}
          >
            <Icon size={16} />
            <div className="claude-action-item-text">
              <div className="claude-action-item-label">
                {CLAUDE_ACTION_LABELS[action]}
                {suggested === action && <span className="claude-suggested-badge">Suggested</span>}
              </div>
              <div className="claude-action-item-description">{description}</div>
            </div>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
};
