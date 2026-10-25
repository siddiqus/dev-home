/** Security headers for the static app. Keep in sync with public/_headers (Cloudflare). */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    // Microsoft Clarity (src/lib/analytics.ts): www/scripts/[a-z].clarity.ms + c.bing.com.
    "script-src 'self' 'unsafe-inline' https://*.clarity.ms https://c.bing.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.github.com https://*.clarity.ms https://c.bing.com",
    "media-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
