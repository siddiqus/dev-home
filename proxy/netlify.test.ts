import { describe, it, expect, vi, afterEach } from "vitest";
import netlifyProxy from "./netlify";

describe("proxy/netlify", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers /jira-proxy/health with nosniff", async () => {
    const response = await netlifyProxy(new Request("https://x.netlify.app/jira-proxy/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("reads ALLOWED_ORIGINS from the environment", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", "https://dev-home.example.com");
    const request = (origin: string) =>
      new Request("https://x.netlify.app/jira-proxy/rest/api/3/filter/my", {
        method: "OPTIONS",
        headers: { Origin: origin },
      });

    expect((await netlifyProxy(request("https://dev-home.example.com"))).status).toBe(204);
    expect((await netlifyProxy(request("https://evil.example.com"))).status).toBe(403);
  });
});
