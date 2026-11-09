import { createContext } from "react";

/**
 * Called when a signed image in rendered markdown fails to load: pasted
 * screenshots carry signed URLs that expire (see signAttachmentUrls), so the
 * provider refetches for fresh ones. Kept outside the lazy MarkdownRenderer
 * chunk so providers don't pull it in.
 */
export const ImageExpiredContext = createContext<(() => void) | undefined>(undefined);
