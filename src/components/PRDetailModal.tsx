import type { GitHubPR } from "../types";
import { formatRelativeTime } from "../utils/time";
import { usePRBody } from "../hooks/usePRBody";
import { refreshPR } from "../services/github";
import { DescriptionModal, type PendingPR } from "./DescriptionModal";

interface PRDetailModalProps {
  /** The PR to show; null keeps the modal hidden (unless `pending`). */
  pr: GitHubPR | null;
  /** A PR still being fetched: the modal opens on it with placeholders. */
  pending?: PendingPR | null;
  onHide: () => void;
  jiraBaseUrl?: string;
  /** Shows a Refresh button; called with the refetched PR (see refreshPR). */
  onRefreshed?: (pr: GitHubPR) => void;
}

/** PR description modal; the body is fetched lazily when a PR is opened. */
export function PRDetailModal({
  pr,
  pending,
  onHide,
  jiraBaseUrl,
  onRefreshed,
}: PRDetailModalProps) {
  const body = usePRBody(pr);
  const onRefresh = pr && onRefreshed ? () => refreshPR(pr).then(onRefreshed) : undefined;
  return (
    <DescriptionModal
      show={!!pr || !!pending}
      onHide={onHide}
      title={pr ? `#${pr.number} ${pr.title}` : ""}
      subtitle={`${pr?.user.login} · ${pr?.repo_full_name} · ${pr?.head.ref} · ${formatRelativeTime(pr?.created_at || "")}`}
      description={body.body}
      loading={body.loading}
      onImageError={body.onImageError}
      url={pr?.html_url ?? pending?.url}
      jiraBaseUrl={jiraBaseUrl}
      checks={pr?.checks}
      pr={pr ?? undefined}
      pending={pr ? undefined : (pending ?? undefined)}
      onRefresh={onRefresh}
    />
  );
}
