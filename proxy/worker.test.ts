import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "./worker";

describe("proxy/worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 200 for /jira-proxy/health", async () => {
    const request = new Request("https://x.workers.dev/jira-proxy/health");
    const response = await worker.fetch(request, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("adds nosniff to proxy responses and keeps the core's headers", async () => {
    const response = await worker.fetch(new Request("https://x.workers.dev/jira-proxy/health"), {});

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("adds nosniff to forwarded upstream responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<b>hi</b>", { headers: { "Content-Type": "text/html" } })),
    );
    const response = await worker.fetch(
      new Request("https://x.workers.dev/jira-proxy/rest/api/3/filter/my", {
        headers: { "x-jira-base-url": "https://acme.atlassian.net" },
      }),
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(await response.text()).toBe("<b>hi</b>");
  });
});
