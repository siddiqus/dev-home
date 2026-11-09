// Images pasted into a PR live at github.com/user-attachments/assets/<uuid>
// (older ones at github.com/<owner>/<repo>/assets/<id>/<uuid>). On a private
// repo those URLs need the github.com session cookie, which an <img> on our
// origin never sends (SameSite=Lax), so they 404. GitHub's rendered bodyHTML
// carries the same images as signed private-user-images URLs that load without
// auth — but only for ~5 minutes.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ATTACHMENT_URL = new RegExp(
  `https://github\\.com/(?:user-attachments/assets|[\\w.-]+/[\\w.-]+/assets/\\d+)/(${UUID})`,
  "gi",
);
const SIGNED_SRC = new RegExp(
  `src="(https://private-user-images\\.githubusercontent\\.com/[^"]*?(${UUID})[^"]*)"`,
  "gi",
);
const SIGNED_HOST = "https://private-user-images.githubusercontent.com/";
/** Non-global, so .test() carries no lastIndex between calls. */
const ATTACHMENT_URL_ONCE = new RegExp(ATTACHMENT_URL.source, "i");

/** How long a body carrying signed image URLs is safe to reuse (they expire at 5 min). */
export const SIGNED_URL_TTL_MS = 4 * 60 * 1000;

/**
 * Point the markdown body's attachment URLs at the signed URLs GitHub put in
 * its bodyHTML, matched by uuid. Attachments with no signed match stay as-is.
 */
export function signAttachmentUrls(body: string, bodyHTML: string): string {
  const signedByUuid = new Map<string, string>();
  for (const [, src, uuid] of bodyHTML.matchAll(SIGNED_SRC)) {
    signedByUuid.set(uuid.toLowerCase(), src.replace(/&amp;/g, "&"));
  }
  if (signedByUuid.size === 0) return body;
  return body.replace(
    ATTACHMENT_URL,
    (url, uuid: string) => signedByUuid.get(uuid.toLowerCase()) ?? url,
  );
}

/** Whether a body has pasted attachments that need bodyHTML to be signed. */
export function hasAttachmentUrls(body: string): boolean {
  return ATTACHMENT_URL_ONCE.test(body);
}

/** Whether a body holds signed image URLs, i.e. goes stale after SIGNED_URL_TTL_MS. */
export function hasSignedAttachments(body: string): boolean {
  return body.includes(SIGNED_HOST);
}
