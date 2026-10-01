import worker from "./worker";

/**
 * Netlify Functions entry (wired up in netlify/functions/jira-proxy.ts). Reuses the
 * Worker wrapper so responses get the same nosniff header; env comes from the site's
 * environment variables.
 */
export default function netlifyProxy(request: Request): Promise<Response> {
  return worker.fetch(request, {
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    JIRA_ALLOWED_HOSTS: process.env.JIRA_ALLOWED_HOSTS,
  });
}
