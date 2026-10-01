// Netlify reads `config` statically from this file, so it must live here, not in proxy/.
export { default } from "../../proxy/netlify";

export const config = { path: "/jira-proxy/*" };
