/**
 * Stateless Jira passthrough. Jira Cloud rejects browser (CORS) requests made
 * with API tokens, so the web app sends Jira calls here with the user's own
 * credentials. Nothing is stored, cached, or logged. Only the read-only
 * endpoints the app uses are forwarded.
 */

export interface ProxyEnv {
  /** Comma-separated exact origins allowed to call the proxy. Unset = same-origin only. */
  ALLOWED_ORIGINS?: string;
  /** Comma-separated extra Jira hostnames allowed besides *.atlassian.net. */
  JIRA_ALLOWED_HOSTS?: string;
}

export const PROXY_PREFIX = "/jira-proxy";

const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 25_000;
const FORWARDED_HEADERS = ["authorization", "accept", "content-type"];
const BASE_URL_ERROR =
  "Jira base URL not allowed: must be https://<site>.atlassian.net or listed in JIRA_ALLOWED_HOSTS";

const ISSUE_KEY = "[A-Z][A-Z0-9_]*-\\d+";
const ID = "\\d+";
const ALLOWED_ROUTES: { method: "GET" | "POST"; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/rest\/api\/3\/search\/jql$/ },
  { method: "GET", pattern: new RegExp(`^/rest/api/3/issue/${ISSUE_KEY}/comment$`) },
  { method: "GET", pattern: /^\/rest\/api\/[23]\/user\/search$/ },
  { method: "GET", pattern: /^\/rest\/api\/3\/filter\/my$/ },
  { method: "GET", pattern: /^\/rest\/agile\/1\.0\/board$/ },
  { method: "GET", pattern: new RegExp(`^/rest/agile/1\\.0/board/${ID}/sprint$`) },
  { method: "GET", pattern: new RegExp(`^/rest/agile/1\\.0/board/${ID}/sprint/${ID}/issue$`) },
];

function splitList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/** Returns the Jira origin if allowed, else null. */
export function normalizeJiraBaseUrl(raw: string | null, env: ProxyEnv): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname.endsWith(".atlassian.net")) return url.origin;
    const extra = splitList(env.JIRA_ALLOWED_HOSTS).map((h) => h.toLowerCase());
    return extra.includes(hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

function isOriginAllowed(origin: string, requestUrl: URL, env: ProxyEnv): boolean {
  const allowed = splitList(env.ALLOWED_ORIGINS);
  if (allowed.length > 0) return allowed.includes(origin);
  try {
    // Host only: TLS is often terminated in front of the proxy, so schemes can differ.
    return new URL(origin).host === requestUrl.host;
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, accept, x-jira-base-url",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function handle(
  request: Request,
  env: ProxyEnv = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${PROXY_PREFIX}/`)) return json(404, { error: "Not found" });
  const path = url.pathname.slice(PROXY_PREFIX.length);
  const method = request.method.toUpperCase();

  const origin = request.headers.get("origin");
  if (origin && !isOriginAllowed(origin, url, env)) {
    return json(403, { error: "Origin not allowed" });
  }
  const cors = corsHeaders(origin);

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (method === "GET" && path === "/health") return json(200, { status: "ok" }, cors);

  const base = normalizeJiraBaseUrl(request.headers.get("x-jira-base-url"), env);
  if (!base) return json(400, { error: BASE_URL_ERROR }, cors);

  if (!ALLOWED_ROUTES.some((r) => r.method === method && r.pattern.test(path))) {
    return json(403, { error: "Path not allowed" }, cors);
  }

  let body: ArrayBuffer | undefined;
  if (method === "POST") {
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) return json(413, { error: "Body too large" }, cors);
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return json(413, { error: "Body too large" }, cors);
  }

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${base}${path}${url.search}`, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return json(502, { error: "Upstream request failed" }, cors);
  }

  const out = new Headers({ ...cors, "Cache-Control": "no-store" });
  const contentType = upstream.headers.get("content-type");
  if (contentType) out.set("Content-Type", contentType);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
