import { handle, type ProxyEnv } from "./core";

/**
 * Cloudflare Worker entry. Static assets are served by Workers Static Assets;
 * only /jira-proxy/* reaches this code (see run_worker_first in wrangler.jsonc).
 */
export default {
  fetch(request: Request, env: ProxyEnv): Promise<Response> {
    return handle(request, env);
  },
};
