import React, { useState } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
  IconInfoCircle,
} from "@tabler/icons-react";

interface PermissionRow {
  name: string;
  why: string;
}

interface ProviderInfo {
  createUrl: string;
  createLabel: string;
  intro: string;
  rows: PermissionRow[];
  footnote: string;
}

const INFO: Record<"github" | "jira", ProviderInfo> = {
  github: {
    createUrl: "https://github.com/settings/tokens",
    createLabel: "Create a GitHub token",
    intro: "A classic token is recommended. Give it these scopes:",
    rows: [
      {
        name: "repo",
        why: "Read PRs, commits, checks and review threads (private repos too), and merge your PRs",
      },
      { name: "read:org", why: "List org members and repos (teams and org PRs)" },
      { name: "notifications", why: "Read mentions and review requests for the Comments tab" },
    ],
    footnote:
      "Fine-grained tokens also work with read access to Pull requests, Checks, Commit statuses, Contents and Metadata, plus org Members. The Merge button needs write access to Contents and Pull requests. GitHub's notifications API doesn't accept fine-grained tokens, so the Comments tab stays empty.",
  },
  jira: {
    createUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    createLabel: "Create a Jira API token",
    intro: "Use a regular API token (not a scoped one). It acts as your account, which needs:",
    rows: [
      { name: "Browse projects", why: "Search issues, boards and sprints" },
      { name: "Browse issues", why: "Read issue details such as status and priority" },
      { name: "Read comments", why: "Find comments that mention you" },
    ],
    footnote: "Nothing is written back to Jira. Dev Home only reads from it.",
  },
};

interface TokenPermissionsInfoProps {
  provider: "github" | "jira";
  /** Start expanded, e.g. before the app has been configured. */
  defaultOpen?: boolean;
}

/** Collapsible "which permissions does this token need" help under a token field. */
export const TokenPermissionsInfo: React.FC<TokenPermissionsInfoProps> = ({
  provider,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const info = INFO[provider];
  const Chevron = open ? IconChevronDown : IconChevronRight;

  return (
    <div className="token-info">
      <button
        type="button"
        className="token-info-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <IconInfoCircle size={14} />
        Which permissions does this token need?
        <Chevron size={12} />
      </button>
      {open && (
        <div className="token-info-body">
          <p className="mb-2">{info.intro}</p>
          <ul className="token-info-list">
            {info.rows.map((row) => (
              <li key={row.name}>
                <code>{row.name}</code>
                <span>{row.why}</span>
              </li>
            ))}
          </ul>
          <p className="token-info-footnote">{info.footnote}</p>
          <a
            href={info.createUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="token-info-link"
          >
            {info.createLabel}
            <IconExternalLink size={12} />
          </a>
        </div>
      )}
    </div>
  );
};
