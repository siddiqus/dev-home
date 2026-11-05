import { useState } from "react";

interface Props {
  type: { name: string | null; iconUrl: string | null } | null | undefined;
  size?: number;
  className?: string;
}

/**
 * Jira's icon for an issue type (Bug, Task, Story…). Renders nothing when
 * there is no icon, or when it fails to load, rather than a broken image.
 */
export function IssueTypeIcon({ type, size = 14, className }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = type?.iconUrl;
  if (!url || url === failedUrl) return null;
  return (
    <img
      src={url}
      alt={type?.name ?? ""}
      title={type?.name ?? undefined}
      width={size}
      height={size}
      className={className}
      onError={() => setFailedUrl(url)}
    />
  );
}
