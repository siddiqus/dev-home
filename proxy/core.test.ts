import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { handle, normalizeJiraBaseUrl, type ProxyEnv } from "./core";

const BASE = "https://acme.atlassian.net";

function req(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  return new Request(`https://app.example.com/jira-proxy${path}`, {
    ...init,
    headers: { "x-jira-base-url": BASE, authorization: "Basic abc", ...(init.headers || {}) },
  });
}

describe("Jira proxy core", () => {
  let fetchImpl: Mock<typeof fetch>;

  beforeEach(() => {
    fetchImpl = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: {
            "content-type": "application/json",
            "set-cookie": "a=b",
            "x-other": "1",
          },
        }),
    );
  });

  it("POST /rest/api/3/search/jql forwards to Jira with method, body, and returns response", async () => {
    const body = JSON.stringify({ jql: "project=CCP" });
    const response = await handle(
      req("/rest/api/3/search/jql", { method: "POST", body }),
      {},
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://acme.atlassian.net/rest/api/3/search/jql");
    expect(opts?.method).toBe("POST");
    expect(opts?.body && new TextDecoder().decode(opts.body as ArrayBuffer)).toBe(body);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ ok: true });
  });

  it("forwards query string unchanged", async () => {
    await handle(req("/rest/agile/1.0/board?type=scrum&name=x"), {}, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://acme.atlassian.net/rest/agile/1.0/board?type=scrum&name=x");
  });

  it("allows all specified GET paths and returns upstream status", async () => {
    const paths = [
      "/rest/api/3/issue/CCP-123/comment",
      "/rest/api/3/user/search",
      "/rest/api/2/user/search",
      "/rest/api/3/filter/my",
      "/rest/agile/1.0/board",
      "/rest/agile/1.0/board/12/sprint",
      "/rest/agile/1.0/board/12/sprint/34/issue",
    ];

    for (const path of paths) {
      const response = await handle(req(path), {}, fetchImpl);
      expect(response.status).toBe(200);
      expect(fetchImpl).toHaveBeenCalled();
      fetchImpl.mockClear();
    }
  });

  it("blocks disallowed paths with 403 and does not call fetchImpl", async () => {
    const disallowed = [
      { path: "/rest/api/3/search/jql", method: "GET" },
      { path: "/rest/api/3/issue/CCP-1/comment", method: "POST" },
      { path: "/rest/api/3/issue/CCP-1", method: "DELETE" },
      { path: "/rest/api/3/issue/ccp-1/comment", method: "GET" },
      { path: "/rest/agile/1.0/board/abc/sprint", method: "GET" },
      { path: "/rest/api/3/myself", method: "GET" },
      { path: "/rest/api/3/issue/CCP-1/comment/extra", method: "GET" },
    ];

    for (const { path, method } of disallowed) {
      fetchImpl.mockClear();
      const response = await handle(req(path, { method }), {}, fetchImpl);
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: "Path not allowed" });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("validates base URL: missing, non-https, not allowed host, extra path", async () => {
    // Missing header
    const noHeader = new Request("https://app.example.com/jira-proxy/rest/api/3/filter/my", {
      headers: { authorization: "Basic abc" },
    });
    let response = await handle(noHeader, {}, fetchImpl);
    expect(response.status).toBe(400);
    let json = await response.json();
    expect(json.error).toBe(
      "Jira base URL not allowed: must be https://<site>.atlassian.net or listed in JIRA_ALLOWED_HOSTS",
    );

    // Non-https
    response = await handle(
      req("/rest/api/3/filter/my", { headers: { "x-jira-base-url": "http://acme.atlassian.net" } }),
      {},
      fetchImpl,
    );
    expect(response.status).toBe(400);
    json = await response.json();
    expect(json.error).toBe(
      "Jira base URL not allowed: must be https://<site>.atlassian.net or listed in JIRA_ALLOWED_HOSTS",
    );

    // Evil domain
    response = await handle(
      req("/rest/api/3/filter/my", { headers: { "x-jira-base-url": "https://evil.com" } }),
      {},
      fetchImpl,
    );
    expect(response.status).toBe(400);
    json = await response.json();
    expect(json.error).toBe(
      "Jira base URL not allowed: must be https://<site>.atlassian.net or listed in JIRA_ALLOWED_HOSTS",
    );

    // Allowed extra host
    response = await handle(
      req("/rest/api/3/filter/my", { headers: { "x-jira-base-url": "https://jira.corp.com" } }),
      { JIRA_ALLOWED_HOSTS: "jira.corp.com" },
      fetchImpl,
    );
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalled();
    fetchImpl.mockClear();

    // Base URL with path (should use origin only)
    response = await handle(
      req("/rest/api/3/filter/my", {
        headers: { "x-jira-base-url": "https://acme.atlassian.net/some/path" },
      }),
      {},
      fetchImpl,
    );
    expect(response.status).toBe(200);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://acme.atlassian.net/rest/api/3/filter/my");
  });

  it("validates origin: no Origin allowed, same host allowed, different origin blocked, ALLOWED_ORIGINS enforced", async () => {
    // No Origin header
    let response = await handle(req("/rest/api/3/filter/my"), {}, fetchImpl);
    expect(response.status).toBe(200);
    fetchImpl.mockClear();

    // Same host as request URL
    response = await handle(
      req("/rest/api/3/filter/my", { headers: { origin: "https://app.example.com" } }),
      {},
      fetchImpl,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
    fetchImpl.mockClear();

    // Different origin, no ALLOWED_ORIGINS
    response = await handle(
      req("/rest/api/3/filter/my", { headers: { origin: "https://other.com" } }),
      {},
      fetchImpl,
    );
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json).toEqual({ error: "Origin not allowed" });
    expect(fetchImpl).not.toHaveBeenCalled();
    fetchImpl.mockClear();

    // ALLOWED_ORIGINS set, matching origin
    response = await handle(
      req("/rest/api/3/filter/my", { headers: { origin: "https://b.com" } }),
      { ALLOWED_ORIGINS: "https://a.com, https://b.com" },
      fetchImpl,
    );
    expect(response.status).toBe(200);
    fetchImpl.mockClear();

    // ALLOWED_ORIGINS set, non-matching origin
    response = await handle(
      req("/rest/api/3/filter/my", { headers: { origin: "https://app.example.com" } }),
      { ALLOWED_ORIGINS: "https://a.com, https://b.com" },
      fetchImpl,
    );
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("handles OPTIONS preflight from allowed origin with correct CORS headers", async () => {
    const response = await handle(
      new Request("https://app.example.com/jira-proxy/rest/api/3/filter/my", {
        method: "OPTIONS",
        headers: { origin: "https://app.example.com" },
      }),
      {},
      fetchImpl,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "authorization, content-type, accept, x-jira-base-url",
    );
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(response.headers.get("Vary")).toBe("Origin");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("GET /health returns 200 without requiring base URL header", async () => {
    const response = await handle(
      new Request("https://app.example.com/jira-proxy/health", {
        headers: { authorization: "Basic abc" },
      }),
      {},
      fetchImpl,
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "ok" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("forwards only authorization, accept, content-type headers to upstream", async () => {
    await handle(
      req("/rest/api/3/filter/my", {
        headers: {
          "x-jira-base-url": BASE,
          authorization: "Basic abc",
          accept: "application/json",
          "content-type": "application/json",
          cookie: "x=1",
        },
      }),
      {},
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, opts] = fetchImpl.mock.calls[0];
    const headers = opts?.headers as Headers;
    expect([...headers.keys()].sort()).toEqual(["accept", "authorization", "content-type"]);
    expect(headers.get("authorization")).toBe("Basic abc");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("strips upstream response headers except content-type and adds cache-control: no-store", async () => {
    const response = await handle(req("/rest/api/3/filter/my"), {}, fetchImpl);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-other")).toBeNull();
  });

  it("rejects POST body > 65536 bytes with 413", async () => {
    const largeBody = "x".repeat(65537);
    const response = await handle(
      req("/rest/api/3/search/jql", { method: "POST", body: largeBody }),
      {},
      fetchImpl,
    );

    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json).toEqual({ error: "Body too large" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 502 when fetchImpl rejects", async () => {
    const failingFetch: Mock<typeof fetch> = vi.fn(async () => {
      throw new Error("Network error");
    });

    const response = await handle(req("/rest/api/3/filter/my"), {}, failingFetch);

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json).toEqual({ error: "Upstream request failed" });
  });

  it("uses redirect: manual and passes signal to fetchImpl", async () => {
    await handle(req("/rest/api/3/filter/my"), {}, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, opts] = fetchImpl.mock.calls[0];
    expect(opts?.redirect).toBe("manual");
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns 404 for paths outside PROXY_PREFIX", async () => {
    const response = await handle(
      new Request("https://app.example.com/other", {
        headers: { "x-jira-base-url": BASE, authorization: "Basic abc" },
      }),
      {},
      fetchImpl,
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json).toEqual({ error: "Not found" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects POST with declared Content-Length over cap without reading body", async () => {
    const response = await handle(
      new Request("https://app.example.com/jira-proxy/rest/api/3/search/jql", {
        method: "POST",
        headers: {
          "x-jira-base-url": BASE,
          authorization: "Basic abc",
          "content-length": "65537",
        },
        body: "x",
      }),
      {},
      fetchImpl,
    );

    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json).toEqual({ error: "Body too large" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows cross-origin /health requests", async () => {
    const response = await handle(
      new Request("https://app.example.com/jira-proxy/health", {
        headers: { origin: "https://evil.com" },
      }),
      {},
      fetchImpl,
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "ok" });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("adds CORS headers to /health for allowed origins", async () => {
    const response = await handle(
      new Request("https://proxy.example.com/jira-proxy/health", {
        headers: { origin: "https://app.example.com" },
      }),
      { ALLOWED_ORIGINS: "https://app.example.com" },
      fetchImpl,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  });

  it("rejects path traversal attempts with 403", async () => {
    const bypassPaths = [
      "/rest/api/3/filter/my/../../../api/3/myself",
      "/rest/api/3/filter/my/%2e%2e/%2e%2e/myself",
      "/rest/api/3/filter/my%2F..%2F..%2Fmyself",
      "//rest/api/3/filter/my",
      "/rest/api/3/filter/my/",
      "/REST/api/3/filter/my",
    ];

    for (const path of bypassPaths) {
      const response = await handle(req(path), {}, fetchImpl);
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: "Path not allowed" });
      expect(fetchImpl).not.toHaveBeenCalled();
      fetchImpl.mockClear();
    }
  });

  it("rejects SSRF attempts via base URL with 400", async () => {
    const bypassUrls = [
      "https://evil.com#.atlassian.net",
      "https://x.atlassian.net@evil.com",
      "https://acme.atlassian.net:8443",
      "https://user:pass@acme.atlassian.net",
    ];

    for (const url of bypassUrls) {
      const response = await handle(
        req("/rest/api/3/filter/my", { headers: { "x-jira-base-url": url } }),
        {},
        fetchImpl,
      );
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe(
        "Jira base URL not allowed: must be https://<site>.atlassian.net or listed in JIRA_ALLOWED_HOSTS",
      );
      expect(fetchImpl).not.toHaveBeenCalled();
      fetchImpl.mockClear();
    }
  });
});

describe("normalizeJiraBaseUrl", () => {
  it("returns null for null or empty input", () => {
    expect(normalizeJiraBaseUrl(null, {})).toBeNull();
    expect(normalizeJiraBaseUrl("", {})).toBeNull();
  });

  it("returns null for non-https URLs", () => {
    expect(normalizeJiraBaseUrl("http://acme.atlassian.net", {})).toBeNull();
  });

  it("returns origin for *.atlassian.net URLs", () => {
    expect(normalizeJiraBaseUrl("https://acme.atlassian.net", {})).toBe(
      "https://acme.atlassian.net",
    );
    expect(normalizeJiraBaseUrl("https://acme.atlassian.net/some/path", {})).toBe(
      "https://acme.atlassian.net",
    );
  });

  it("returns origin for allowed extra hosts", () => {
    const env: ProxyEnv = { JIRA_ALLOWED_HOSTS: "jira.corp.com, jira2.corp.com" };
    expect(normalizeJiraBaseUrl("https://jira.corp.com", env)).toBe("https://jira.corp.com");
    expect(normalizeJiraBaseUrl("https://jira2.corp.com/path", env)).toBe("https://jira2.corp.com");
  });

  it("returns null for disallowed hosts", () => {
    const env: ProxyEnv = { JIRA_ALLOWED_HOSTS: "jira.corp.com" };
    expect(normalizeJiraBaseUrl("https://evil.com", env)).toBeNull();
    expect(normalizeJiraBaseUrl("https://other.corp.com", env)).toBeNull();
  });

  it("returns null for URLs with non-default port", () => {
    expect(normalizeJiraBaseUrl("https://acme.atlassian.net:8443", {})).toBeNull();
    expect(normalizeJiraBaseUrl("https://acme.atlassian.net:443", {})).toBe(
      "https://acme.atlassian.net",
    );
    const env: ProxyEnv = { JIRA_ALLOWED_HOSTS: "jira.corp.com" };
    expect(normalizeJiraBaseUrl("https://jira.corp.com:8080", env)).toBeNull();
  });

  it("returns null for URLs with userinfo", () => {
    expect(normalizeJiraBaseUrl("https://user@acme.atlassian.net", {})).toBeNull();
    expect(normalizeJiraBaseUrl("https://user:pass@acme.atlassian.net", {})).toBeNull();
    const env: ProxyEnv = { JIRA_ALLOWED_HOSTS: "jira.corp.com" };
    expect(normalizeJiraBaseUrl("https://admin:secret@jira.corp.com", env)).toBeNull();
  });
});
