import Alert from "react-bootstrap/Alert";
import { IconDownload } from "@tabler/icons-react";

interface UpdateBannerProps {
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string;
  onDismiss: () => void;
}

export function UpdateBanner({
  latestVersion,
  currentVersion,
  downloadUrl,
  onDismiss,
}: UpdateBannerProps) {
  return (
    <Alert
      variant="info"
      dismissible
      onClose={onDismiss}
      className="small d-flex align-items-center gap-2 mb-2"
    >
      <IconDownload size={16} />
      <span>
        A new version <strong>v{latestVersion}</strong> is available (current: v
        {currentVersion}).{" "}
        <Alert.Link href={downloadUrl} target="_blank" rel="noopener noreferrer">
          Download update
        </Alert.Link>
      </span>
    </Alert>
  );
}
