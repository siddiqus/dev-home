import React from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Badge from "react-bootstrap/Badge";
import { JiraComment, GitHubComment } from "../types";
import { JiraComments } from "./JiraComments";
import { GitHubMentions } from "./GitHubMentions";

interface MentionsViewProps {
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  loading: boolean;
  jiraBaseUrl: string;
}

export const MentionsView: React.FC<MentionsViewProps> = ({
  jiraComments,
  githubMentions,
  loading,
  jiraBaseUrl,
}) => {
  return (
    <Row>
      <Col lg={6} className="mb-3 mb-lg-0">
        <div className="section-header">
          JIRA Comments
          {jiraComments.length > 0 && (
            <Badge bg="secondary" pill>
              {jiraComments.length}
            </Badge>
          )}
        </div>
        <JiraComments
          comments={jiraComments}
          loading={loading}
          baseUrl={jiraBaseUrl}
        />
      </Col>
      <Col lg={6}>
        <div className="section-header">
          GitHub Mentions
          {githubMentions.length > 0 && (
            <Badge bg="secondary" pill>
              {githubMentions.length}
            </Badge>
          )}
        </div>
        <GitHubMentions mentions={githubMentions} loading={loading} />
      </Col>
    </Row>
  );
};
