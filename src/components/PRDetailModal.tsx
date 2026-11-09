import type { GitHubPR } from "../types";
import { formatRelativeTime } from "../utils/time";
import { usePRBody } from "../hooks/usePRBody";
import { DescriptionModal } from "./DescriptionModal";

interface PRDetailModalProps {
  /** The PR to show; null keeps the modal hidden. */
  pr: GitHubPR | null;
  onHide: () => void;
  jiraBaseUrl?: string;
}

/** PR description modal; the body is fetched lazily when a PR is opened. */
export function PRDetailModal({ pr, onHide, jiraBaseUrl }: PRDetailModalProps) {
  const body = usePRBody(pr);
  return (
    <DescriptionModal
      show={!!pr}
      onHide={onHide}
      title={pr ? `#${pr.number} ${pr.title}` : ""}
      subtitle={`${pr?.user.login} · ${pr?.repo_full_name} · ${pr?.head.ref} · ${formatRelativeTime(pr?.created_at || "")}`}
      description={body.body}
      loading={body.loading}
      onImageError={body.onImageError}
      url={pr?.html_url}
      jiraBaseUrl={jiraBaseUrl}
      checks={pr?.checks}
      pr={pr ?? undefined}
    />
  );
}
