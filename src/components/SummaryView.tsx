import React, { useState } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import { IconSubtask, IconAt, IconGitPullRequest, IconEye } from "@tabler/icons-react";
import { JiraIssue, JiraComment, GitHubPR, GitHubComment } from "../types";
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
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  badgeClass: string;
  count: number;
  children: React.ReactNode;
  onSeeMore?: () => void;
}

function Section({ icon, title, badgeClass, count, children, onSeeMore }: SectionProps) {
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

export const SummaryView: React.FC<SummaryViewProps> = ({
  jiraIssues,
  jiraComments,
  githubMentions,
  openPRs,
  reviewRequests,
  loading,
  jiraBaseUrl,
  onNavigate,
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
      title: `${m.user.login} mentioned you`,
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
        {/* Row 1 */}
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
                  badge="Review"
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
            onSeeMore={jiraComments.length + githubMentions.length > 5 ? () => onNavigate("mentions") : undefined}
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
                  badgeClass={
                    issue.status.statusCategory.colorName === "green"
                      ? "badge-status-green"
                      : issue.status.statusCategory.colorName === "yellow"
                        ? "badge-status-yellow"
                        : issue.status.statusCategory.colorName === "blue"
                          ? "badge-status-blue"
                          : "badge-status-neutral"
                  }
                  onClick={() => setSelectedIssue(issue)}
                />
              ))
            ) : (
              <EmptyRow text="No assigned issues" />
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
