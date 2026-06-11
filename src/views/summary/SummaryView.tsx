import React, { useState } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";
import { Badge, BadgeVariant } from "../../components/primitives/Badge";
import { SectionHeader } from "../../components/primitives/SectionHeader";
import { SeeMoreButton } from "../../components/primitives/SeeMoreButton";
import {
  IconSubtask,
  IconAt,
  IconGitPullRequest,
  IconEye,
  IconNote,
  IconCheck,
  IconPlus,
} from "@tabler/icons-react";
import { JiraIssue, JiraComment, GitHubPR, GitHubComment, Note } from "../../types";
import type { ClaudeAction, ClaudeSession } from "../../types/claude";
import { getReferenceUrl, getNoteDisplayTitle } from "../../utils/text";
import { REASON_SUMMARY } from "../../utils/github";
import { formatRelativeTime } from "../../utils/time";
import { DescriptionModal } from "../../components/DescriptionModal";
import { SummaryItem } from "./SummaryItem";
import "./summary.css";

interface SummaryViewProps {
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  loading: boolean;
  jiraIssuesLoading?: boolean;
  jiraCommentsLoading?: boolean;
  githubMentionsLoading?: boolean;
  openPRsLoading?: boolean;
  reviewRequestsLoading?: boolean;
  notesLoading?: boolean;
  jiraBaseUrl: string;
  onNavigate: (tab: string) => void;
  notes: Note[];
  onResolveNote: (id: number) => Promise<void>;
  onAddNote: () => void;
  onOpenNote: (note: Note) => void;
  doneItemIds?: Set<string>;
  claudeEnabled?: boolean;
  claudeSessions?: ClaudeSession[];
  onClaudeAction?: (
    pr: {
      number: number;
      repo_full_name: string;
      title: string;
      headBranch: string;
      baseBranch: string;
    },
    action: ClaudeAction,
    customPrompt?: string,
  ) => void;
  onViewClaudeSession?: (sessionId: string) => void;
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  badgeVariant: BadgeVariant;
  count: number;
  children: React.ReactNode;
  onSeeMore?: () => void;
  headerAction?: React.ReactNode;
  loading?: boolean;
}

function Section({
  icon,
  title,
  badgeVariant,
  count,
  children,
  onSeeMore,
  headerAction,
  loading,
}: SectionProps) {
  return (
    <Card className="h-100">
      <Card.Body className="p-0">
        <SectionHeader className="px-3 pt-3 mb-0">
          {icon}
          <span>{title}</span>
          {count > 0 && <Badge variant={badgeVariant}>{count}</Badge>}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {loading && (
              <Spinner
                animation="border"
                size="sm"
                variant="secondary"
                style={{ width: 12, height: 12, borderWidth: 1.5 }}
              />
            )}
            {headerAction}
          </span>
        </SectionHeader>
        <div style={{ marginTop: 8 }}>{children}</div>
        {onSeeMore && (
          <div className="see-more-row px-3 py-2">
            <SeeMoreButton onClick={onSeeMore}>See more</SeeMoreButton>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="text-secondary-custom px-3 py-3" style={{ fontSize: "0.8125rem" }}>
      {text}
    </div>
  );
}

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  green: "success",
  yellow: "warning",
  blue: "info",
};

function statusBadgeVariant(colorName: string): BadgeVariant {
  return STATUS_BADGE_VARIANTS[colorName] || "neutral";
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  jiraIssues,
  jiraComments,
  githubMentions,
  openPRs,
  reviewRequests,
  loading,
  jiraIssuesLoading,
  jiraCommentsLoading,
  githubMentionsLoading,
  openPRsLoading,
  reviewRequestsLoading,
  notesLoading,
  jiraBaseUrl,
  onNavigate,
  notes,
  onResolveNote,
  onAddNote,
  onOpenNote,
  doneItemIds,
  claudeEnabled,
  claudeSessions,
  onClaudeAction,
  onViewClaudeSession,
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

  // Filter out items marked "done" on the kanban board
  const visibleReviews = doneItemIds
    ? reviewRequests.filter((r) => !doneItemIds.has(`review:${r.repo_full_name}#${r.number}`))
    : reviewRequests;
  const visiblePRs = doneItemIds
    ? openPRs.filter((pr) => !doneItemIds.has(`pr:${pr.repo_full_name}#${pr.number}`))
    : openPRs;
  const visibleNotes = doneItemIds
    ? notes.filter((n) => !doneItemIds.has(`note:${String(n.id)}`))
    : notes;

  const topReviews = [...visibleReviews]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);
  const topPRs = [...visiblePRs]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);
  const topIssues = [...jiraIssues]
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
    .slice(0, 5);
  const topNotes = [...visibleNotes]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

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
      title: `${m.user.login} ${REASON_SUMMARY[m.reason] || "mentioned you"} (${m.repo_full_name.split("/").pop()}/${m.pr_number})`,
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
                badgeVariant="warning"
                count={visibleReviews.length}
                onSeeMore={visibleReviews.length > 5 ? () => onNavigate("reviews") : undefined}
                loading={reviewRequestsLoading}
              >
                {topReviews.length > 0 ? (
                  topReviews.map((r) => (
                    <SummaryItem
                      key={r.id}
                      url={r.html_url}
                      title={`#${r.number} ${r.title}`}
                      subtitle={`${r.repo_full_name} · ${r.user.login}`}
                      time={r.updated_at}
                      badgeVariant="warning"
                      checksStatus={r.checks_status}
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
                badgeVariant="success"
                count={visiblePRs.length}
                onSeeMore={visiblePRs.length > 5 ? () => onNavigate("prs") : undefined}
                loading={openPRsLoading}
              >
                {topPRs.length > 0 ? (
                  topPRs.map((pr) => (
                    <SummaryItem
                      key={pr.id}
                      url={pr.html_url}
                      title={`#${pr.number} ${pr.title}`}
                      subtitle={pr.repo_full_name}
                      time={pr.updated_at}
                      badge={pr.draft ? "Draft" : "Open"}
                      badgeVariant={pr.draft ? "neutral" : "success"}
                      checksStatus={pr.checks_status}
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
                badgeVariant="purple"
                count={jiraComments.length + githubMentions.length}
                onSeeMore={
                  jiraComments.length + githubMentions.length > 5
                    ? () => onNavigate("mentions")
                    : undefined
                }
                loading={jiraCommentsLoading || githubMentionsLoading}
              >
                {allMentions.length > 0 ? (
                  allMentions.map((m) => (
                    <SummaryItem
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
                badgeVariant="info"
                count={jiraIssues.length}
                onSeeMore={jiraIssues.length > 5 ? () => onNavigate("jira") : undefined}
                loading={jiraIssuesLoading}
              >
                {topIssues.length > 0 ? (
                  topIssues.map((issue) => (
                    <SummaryItem
                      key={issue.key}
                      url={jiraBase ? `${jiraBase}/browse/${issue.key}` : `#${issue.key}`}
                      title={`${issue.key}: ${issue.summary}`}
                      subtitle={issue.project.name}
                      time={issue.updated}
                      badge={issue.status.name}
                      badgeVariant={statusBadgeVariant(issue.status.statusCategory.colorName)}
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
            badgeVariant="purple"
            count={visibleNotes.length}
            onSeeMore={visibleNotes.length > 10 ? () => onNavigate("notes") : undefined}
            loading={notesLoading}
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
                const noteUrl = getReferenceUrl(note, jiraBase);
                const noteTitle = getNoteDisplayTitle(note);
                return (
                  <div
                    key={note.id}
                    className="summary-item d-flex align-items-center gap-3 px-3 py-2"
                    style={{ cursor: "pointer" }}
                    onClick={() => onOpenNote(note)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="d-flex align-items-center gap-2">
                        {noteUrl ? (
                          <a
                            href={noteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-truncate-custom"
                            style={{ fontWeight: 500, fontSize: "0.8125rem" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {noteTitle}
                          </a>
                        ) : (
                          <span
                            className="text-truncate-custom"
                            style={{ fontWeight: 500, fontSize: "0.8125rem" }}
                          >
                            {noteTitle}
                          </span>
                        )}
                        <span
                          className="text-secondary-custom"
                          style={{ fontSize: "0.6875rem", whiteSpace: "nowrap", flexShrink: 0 }}
                        >
                          {formatRelativeTime(note.created_at)}
                        </span>
                      </div>
                      {note.content && (
                        <div
                          className="text-secondary-custom note-content-truncate"
                          style={{ fontSize: "0.75rem", marginTop: 1 }}
                        >
                          {note.content}
                        </div>
                      )}
                    </div>
                    <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        style={{ padding: "2px 6px" }}
                        title="Resolve"
                        onClick={(e) => {
                          e.stopPropagation();
                          onResolveNote(note.id);
                        }}
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
        checks={selectedPR?.checks}
        pr={selectedPR ?? undefined}
        claudeEnabled={claudeEnabled}
        activeSessions={
          selectedPR
            ? claudeSessions?.filter(
                (s) =>
                  s.prNumber === selectedPR.number &&
                  s.repoFullName === selectedPR.repo_full_name &&
                  s.status === "running",
              )
            : undefined
        }
        onViewSession={onViewClaudeSession}
        onClaudeAction={
          selectedPR && onClaudeAction
            ? (action, customPrompt) =>
                onClaudeAction(
                  {
                    number: selectedPR.number,
                    repo_full_name: selectedPR.repo_full_name,
                    title: selectedPR.title,
                    headBranch: selectedPR.head.ref,
                    baseBranch: selectedPR.base.ref,
                  },
                  action,
                  customPrompt,
                )
            : undefined
        }
      />
    </>
  );
};
