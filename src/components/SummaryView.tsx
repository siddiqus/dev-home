import React, { useState } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import {
  IconSubtask,
  IconAt,
  IconGitPullRequest,
  IconEye,
  IconNote,
  IconCheck,
  IconPlus,
  IconPencil,
} from "@tabler/icons-react";
import { JiraIssue, JiraComment, GitHubPR, GitHubComment, Note } from "../types";

const REASON_SUMMARY: Record<string, string> = {
  approval_requested: "requested your approval",
  assign: "assigned you",
  mention: "mentioned you",
  review_requested: "requested your review",
  team_mention: "mentioned your team",
};
import { formatRelativeTime } from "../hooks/useRelativeTime";
import { DescriptionModal } from "./DescriptionModal";

interface SummaryViewProps {
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  loading: boolean;
  jiraBaseUrl: string;
  onNavigate: (tab: string) => void;
  notes: Note[];
  onResolveNote: (id: number) => Promise<void>;
  onAddNote: () => void;
  onEditNote: (note: Note) => void;
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  badgeClass: string;
  count: number;
  children: React.ReactNode;
  onSeeMore?: () => void;
  headerAction?: React.ReactNode;
}

function Section({
  icon,
  title,
  badgeClass,
  count,
  children,
  onSeeMore,
  headerAction,
}: SectionProps) {
  return (
    <Card className="h-100">
      <Card.Body className="p-0">
        <div className="section-header px-3 pt-3 mb-0">
          {icon}
          <span>{title}</span>
          {count > 0 && (
            <Badge className={badgeClass} style={{ fontSize: "0.625rem" }}>
              {count}
            </Badge>
          )}
          {headerAction && <span style={{ marginLeft: "auto" }}>{headerAction}</span>}
        </div>
        <div style={{ marginTop: 8 }}>{children}</div>
        {onSeeMore && (
          <div className="see-more-row px-3 py-2">
            <button className="see-more-btn" onClick={onSeeMore}>
              See more
            </button>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

interface ItemRowProps {
  url: string;
  title: string;
  subtitle: string;
  time: string;
  badge?: string;
  badgeClass?: string;
  onClick?: () => void;
}

function ItemRow({ url, title, subtitle, time, badge, badgeClass, onClick }: ItemRowProps) {
  return (
    <div className="summary-item d-flex align-items-center gap-3 px-3 py-2" onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-truncate-custom d-block"
          style={{ fontWeight: 500, fontSize: "0.8125rem" }}
          onClick={(e) => e.stopPropagation()}
        >
          {title}
        </a>
        <div className="text-secondary-custom" style={{ fontSize: "0.75rem", marginTop: 1 }}>
          {subtitle}
        </div>
      </div>
      <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
        {badge && <Badge className={badgeClass || "badge-status-neutral"}>{badge}</Badge>}
        <span
          className="text-secondary-custom"
          style={{ fontSize: "0.6875rem", whiteSpace: "nowrap" }}
        >
          {formatRelativeTime(time)}
        </span>
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="text-secondary-custom px-3 py-3" style={{ fontSize: "0.8125rem" }}>
      {text}
    </div>
  );
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  green: "badge-status-green",
  yellow: "badge-status-yellow",
  blue: "badge-status-blue",
};

function statusBadgeClass(colorName: string): string {
  return STATUS_BADGE_CLASSES[colorName] || "badge-status-neutral";
}

/** Format a GitHub URL like https://github.com/org/repo/pull/123 as repo#123 */
function formatGitHubTitle(url: string): string {
  const match = url.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/);
  if (match) return `${match[1]}#${match[2]}`;
  const repoMatch = url.match(/github\.com\/[^/]+\/([^/\s]+)/);
  if (repoMatch) return repoMatch[1];
  return url;
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  jiraIssues,
  jiraComments,
  githubMentions,
  openPRs,
  reviewRequests,
  loading,
  jiraBaseUrl,
  onNavigate,
  notes,
  onResolveNote,
  onAddNote,
  onEditNote,
}) => {
  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);

  if (loading && jiraIssues.length === 0 && openPRs.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  const jiraBase = jiraBaseUrl?.replace(/\/+$/, "") || "";

  const topReviews = reviewRequests.slice(0, 5);
  const topPRs = openPRs.slice(0, 5);
  const topIssues = jiraIssues.slice(0, 5);
  const topNotes = notes.slice(0, 10);

  // Combine jira comments + github mentions, sort by date, take 5
  const allMentions = [
    ...jiraComments.map((c) => ({
      id: `jc-${c.id}`,
      title: `${c.author.displayName} on ${c.issueKey}`,
      subtitle: c.issueSummary,
      url: jiraBase ? `${jiraBase}/browse/${c.issueKey}` : `#${c.issueKey}`,
      time: c.created,
    })),
    ...githubMentions.map((m) => ({
      id: `gm-${m.id}`,
      title: `${m.user.login} ${REASON_SUMMARY[m.reason] || "mentioned you"}`,
      subtitle: m.context_title || m.repo_full_name,
      url: m.html_url,
      time: m.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);

  return (
    <>
      <Row className="g-3">
        <Col md="8">
          <Row className="g-2">
            <Col md={6}>
              <Section
                icon={<IconEye size={13} stroke={1.8} />}
                title="Review Requests"
                badgeClass="badge-status-yellow"
                count={reviewRequests.length}
                onSeeMore={reviewRequests.length > 5 ? () => onNavigate("reviews") : undefined}
              >
                {topReviews.length > 0 ? (
                  topReviews.map((r) => (
                    <ItemRow
                      key={r.id}
                      url={r.html_url}
                      title={`#${r.number} ${r.title}`}
                      subtitle={`${r.repo_full_name} · ${r.user.login}`}
                      time={r.updated_at}
                      badgeClass="badge-status-yellow"
                      onClick={() => setSelectedPR(r)}
                    />
                  ))
                ) : (
                  <EmptyRow text="No pending reviews" />
                )}
              </Section>
            </Col>
            <Col md={6}>
              <Section
                icon={<IconGitPullRequest size={13} stroke={1.8} />}
                title="Open Pull Requests"
                badgeClass="badge-status-green"
                count={openPRs.length}
                onSeeMore={openPRs.length > 5 ? () => onNavigate("prs") : undefined}
              >
                {topPRs.length > 0 ? (
                  topPRs.map((pr) => (
                    <ItemRow
                      key={pr.id}
                      url={pr.html_url}
                      title={`#${pr.number} ${pr.title}`}
                      subtitle={pr.repo_full_name}
                      time={pr.updated_at}
                      badge={pr.draft ? "Draft" : "Open"}
                      badgeClass={pr.draft ? "badge-status-neutral" : "badge-status-green"}
                      onClick={() => setSelectedPR(pr)}
                    />
                  ))
                ) : (
                  <EmptyRow text="No open pull requests" />
                )}
              </Section>
            </Col>

            {/* Row 2 */}
            <Col md={6}>
              <Section
                icon={<IconAt size={13} stroke={1.8} />}
                title="Mentions"
                badgeClass="badge-status-purple"
                count={jiraComments.length + githubMentions.length}
                onSeeMore={
                  jiraComments.length + githubMentions.length > 5
                    ? () => onNavigate("mentions")
                    : undefined
                }
              >
                {allMentions.length > 0 ? (
                  allMentions.map((m) => (
                    <ItemRow
                      key={m.id}
                      url={m.url}
                      title={m.title}
                      subtitle={m.subtitle}
                      time={m.time}
                    />
                  ))
                ) : (
                  <EmptyRow text="No recent mentions" />
                )}
              </Section>
            </Col>
            <Col md={6}>
              <Section
                icon={<IconSubtask size={13} stroke={1.8} />}
                title="JIRA Tasks"
                badgeClass="badge-status-blue"
                count={jiraIssues.length}
                onSeeMore={jiraIssues.length > 5 ? () => onNavigate("jira") : undefined}
              >
                {topIssues.length > 0 ? (
                  topIssues.map((issue) => (
                    <ItemRow
                      key={issue.key}
                      url={jiraBase ? `${jiraBase}/browse/${issue.key}` : `#${issue.key}`}
                      title={`${issue.key}: ${issue.summary}`}
                      subtitle={issue.project.name}
                      time={issue.updated}
                      badge={issue.status.name}
                      badgeClass={statusBadgeClass(issue.status.statusCategory.colorName)}
                      onClick={() => setSelectedIssue(issue)}
                    />
                  ))
                ) : (
                  <EmptyRow text="No assigned issues" />
                )}
              </Section>
            </Col>
          </Row>
        </Col>
        <Col md="4">
          <Section
            icon={<IconNote size={13} stroke={1.8} />}
            title="Notes"
            badgeClass="badge-status-purple"
            count={notes.length}
            onSeeMore={notes.length > 10 ? () => onNavigate("notes") : undefined}
            headerAction={
              <Button
                variant="outline-secondary"
                size="sm"
                style={{ padding: "1px 5px", lineHeight: 1 }}
                title="Add note"
                onClick={onAddNote}
              >
                <IconPlus size={12} />
              </Button>
            }
          >
            {topNotes.length > 0 ? (
              topNotes.map((note) => {
                const noteUrl =
                  note.type === "jira_ticket" && note.reference_id
                    ? `${jiraBase}/browse/${note.reference_id}`
                    : note.type === "github_pr" && note.reference_id
                      ? note.reference_id
                      : "#";
                const noteTitle =
                  note.type === "free_text"
                    ? note.content
                    : note.type === "github_pr"
                      ? formatGitHubTitle(note.reference_id || "")
                      : note.reference_id || "";
                const noteSubtitle = note.type !== "free_text" && note.content ? note.content : "";
                return (
                  <div
                    key={note.id}
                    className="summary-item d-flex align-items-center gap-3 px-3 py-2"
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {noteUrl !== "#" ? (
                        <a
                          href={noteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-truncate-custom d-block"
                          style={{ fontWeight: 500, fontSize: "0.8125rem" }}
                        >
                          {noteTitle}
                        </a>
                      ) : (
                        <div
                          style={{ fontWeight: 500, fontSize: "0.8125rem", whiteSpace: "pre-wrap" }}
                        >
                          {noteTitle}
                        </div>
                      )}
                      {noteSubtitle && (
                        <div
                          className="text-secondary-custom"
                          style={{ fontSize: "0.75rem", marginTop: 1, whiteSpace: "pre-wrap" }}
                        >
                          {noteSubtitle}
                        </div>
                      )}
                    </div>
                    <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
                      <Badge className="badge-status-neutral">
                        {note.type === "jira_ticket"
                          ? "JIRA"
                          : note.type === "github_pr"
                            ? "PR"
                            : "Note"}
                      </Badge>
                      <span
                        className="text-secondary-custom"
                        style={{ fontSize: "0.6875rem", whiteSpace: "nowrap" }}
                      >
                        {formatRelativeTime(note.created_at)}
                      </span>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        style={{ padding: "2px 6px" }}
                        title="Edit"
                        onClick={() => onEditNote(note)}
                      >
                        <IconPencil size={12} />
                      </Button>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        style={{ padding: "2px 6px" }}
                        title="Resolve"
                        onClick={() => onResolveNote(note.id)}
                      >
                        <IconCheck size={12} />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyRow text="No notes" />
            )}
          </Section>
        </Col>
      </Row>

      <DescriptionModal
        show={!!selectedIssue}
        onHide={() => setSelectedIssue(null)}
        title={selectedIssue ? `${selectedIssue.key}: ${selectedIssue.summary}` : ""}
        subtitle={selectedIssue?.project.name}
        description={selectedIssue?.description || ""}
        url={selectedIssue && jiraBase ? `${jiraBase}/browse/${selectedIssue.key}` : undefined}
      />

      <DescriptionModal
        show={!!selectedPR}
        onHide={() => setSelectedPR(null)}
        title={selectedPR ? `#${selectedPR.number} ${selectedPR.title}` : ""}
        subtitle={selectedPR?.repo_full_name}
        description={selectedPR?.body || ""}
        url={selectedPR?.html_url}
      />
    </>
  );
};
