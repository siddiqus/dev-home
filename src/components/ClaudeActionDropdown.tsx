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
  IconSparkles,
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
  {
    action: "summarize",
    icon: IconFileDescription,
    description: "Generate PR description & summary",
  },
  { action: "custom", icon: IconTerminal, description: "Tell Claude what to do" },
];

function getSuggestedAction(pr: GitHubPR): ClaudeAction | null {
  if (pr.review_status === "CHANGES_REQUESTED") return "address_comments";
  if (pr.checks_status === "FAILURE") return "fix_ci";
  if (!pr.review_status) return "review";
  if (!pr.body || pr.body.trim() === "") return "summarize";
  return null;
}

export const ClaudeActionDropdown: React.FC<ClaudeActionDropdownProps> = ({ pr, onAction }) => {
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
        <Dropdown.Toggle size="sm" variant="outline-secondary" className="claude-action-toggle">
          <IconSparkles size={"1rem"} />
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

      <Modal show={showCustomPrompt} onHide={() => setShowCustomPrompt(false)} centered size="lg">
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
          <Form.Text className="text-secondary-custom">Press Cmd+Enter to submit</Form.Text>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowCustomPrompt(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCustomSubmit}
            disabled={!customPrompt.trim()}
          >
            Run
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};
