import { handle, type ProxyEnv } from "./core";

/**
 * Cloudflare Worker entry. Static assets are served by Workers Static Assets;
 * only /jira-proxy/* reaches this code (see run_worker_first in wrangler.jsonc).
 */
export default {
  async fetch(request: Request, env: ProxyEnv): Promise<Response> {
    const response = await handle(request, env);
    // Upstream Content-Type is passed through on the app's origin, so stop sniffing.
    if (!response.headers.has("X-Content-Type-Options")) {
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};
