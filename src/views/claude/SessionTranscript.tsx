import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import {
  IconChevronRight,
  IconTerminal2,
  IconFileText,
  IconFileSearch,
  IconPencil,
  IconSearch,
  IconRobot,
  IconWorld,
  IconTool,
  IconListCheck,
  IconClipboardText,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import type { OutputLine } from "../../hooks/useClaudeWebSocket";

interface SessionTranscriptProps {
  output: OutputLine[];
  isRunning: boolean;
  footer?: React.ReactNode;
  containerRef?: React.Ref<HTMLDivElement>;
}

type ToolTone = "amber" | "blue" | "green" | "purple" | "red" | "slate";

interface ToolMeta {
  icon: Icon;
  tone: ToolTone;
  /** Verb-style prefix for the header, e.g. "Ran" → "Ran  ls -la". */
  verb: string;
}

const TOOL_META: Record<string, ToolMeta> = {
  Bash: { icon: IconTerminal2, tone: "amber", verb: "Ran" },
  Read: { icon: IconFileText, tone: "blue", verb: "Read" },
  Glob: { icon: IconFileSearch, tone: "blue", verb: "Globbed" },
  Grep: { icon: IconSearch, tone: "purple", verb: "Searched" },
  WebSearch: { icon: IconSearch, tone: "purple", verb: "Searched" },
  Edit: { icon: IconPencil, tone: "green", verb: "Edited" },
  Write: { icon: IconPencil, tone: "green", verb: "Wrote" },
  NotebookEdit: { icon: IconPencil, tone: "green", verb: "Edited" },
  Task: { icon: IconRobot, tone: "purple", verb: "Dispatched" },
  Agent: { icon: IconRobot, tone: "purple", verb: "Dispatched" },
  WebFetch: { icon: IconWorld, tone: "blue", verb: "Fetched" },
  TodoWrite: { icon: IconListCheck, tone: "slate", verb: "Updated todos" },
  Skill: { icon: IconClipboardText, tone: "purple", verb: "Invoked skill" },
};

const DEFAULT_META: ToolMeta = { icon: IconTool, tone: "slate", verb: "Called" };

function toolMeta(name: string): ToolMeta {
  return TOOL_META[name] || DEFAULT_META;
}

/** Derive a short, human-readable summary of a tool call from its input. */
function toolSummary(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return "";
  };

  switch (name) {
    case "Bash":
      return pick("command");
    case "Read":
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return pick("file_path", "notebook_path");
    case "Grep":
    case "Glob":
      return pick("pattern", "query");
    case "Task":
    case "Agent":
      return pick("description", "prompt");
    case "WebFetch":
      return pick("url");
    case "WebSearch":
      return pick("query");
    case "Skill":
      return pick("skill");
    default:
      return pick("description", "command", "file_path", "query", "prompt", "url", "pattern");
  }
}

const ToolCard: React.FC<{ line: OutputLine; result?: OutputLine }> = ({ line, result }) => {
  const [open, setOpen] = useState(false);
  const name = line.toolName || "Tool";
  const { icon: Icon, tone, verb } = toolMeta(name);
  const summary = toolSummary(name, line.toolInput);
  const inputJson =
    line.toolInput !== undefined ? JSON.stringify(line.toolInput, null, 2) : line.data;

  return (
    <div className={`claude-tool-card${open ? " open" : ""}`} data-tone={tone}>
      <button
        type="button"
        className="claude-tool-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="claude-tool-chip">
          <Icon size={15} stroke={1.75} />
        </span>
        <span className="claude-tool-verb">{verb}</span>
        <span className="claude-tool-name">{name}</span>
        {summary && <code className="claude-tool-summary">{summary}</code>}
        <IconChevronRight className="claude-tool-chevron" size={15} stroke={2} />
      </button>
      {open && (
        <div className="claude-tool-body">
          <pre className="claude-tool-pre">{inputJson}</pre>
          {result && result.data.trim() && (
            <>
              <div className="claude-tool-result-label">Result</div>
              <pre className="claude-tool-pre claude-tool-result">{result.data}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const MarkdownMessage: React.FC<{ text: string; result?: boolean }> = ({ text, result }) => (
  <div className={`claude-msg markdown-body${result ? " claude-msg-result" : ""}`}>
    <ReactMarkdown remarkPlugins={[remarkBreaks]}>{text}</ReactMarkdown>
  </div>
);

export const SessionTranscript: React.FC<SessionTranscriptProps> = ({
  output,
  isRunning,
  footer,
  containerRef,
}) => {
  const items: React.ReactNode[] = [];

  for (let i = 0; i < output.length; i++) {
    const line = output[i];
    const kind = line.kind ?? (line.stream === "stderr" ? "raw" : "text");

    if (kind === "tool_use") {
      // Fold an immediately-following tool_result into this card.
      const next = output[i + 1];
      const result = next && next.kind === "tool_result" ? next : undefined;
      if (result) i++;
      items.push(<ToolCard key={i} line={line} result={result} />);
    } else if (kind === "tool_result") {
      // Orphaned result (no preceding tool_use captured) — show as muted block.
      items.push(
        <div key={i} className="claude-tool-card claude-tool-orphan-result" data-tone="slate">
          <div className="claude-tool-result-label">Result</div>
          <pre className="claude-tool-pre">{line.data}</pre>
        </div>,
      );
    } else if (kind === "text" || kind === "result") {
      items.push(<MarkdownMessage key={i} text={line.data} result={kind === "result"} />);
    } else {
      // raw / stderr — plain monospace line, preserved for old sessions.
      items.push(
        <div key={i} className={`claude-raw-line ${line.stream}`}>
          {line.data}
        </div>,
      );
    }
  }

  return (
    <div className="claude-transcript" ref={containerRef}>
      {items}
      {isRunning && <span className="claude-cursor">█</span>}
      {footer}
    </div>
  );
};
