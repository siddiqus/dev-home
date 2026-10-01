import { describe, it, expect } from "vitest";
import worker from "./worker";

describe("proxy/worker", () => {
  it("returns 200 for /jira-proxy/health", async () => {
    const request = new Request("https://x.workers.dev/jira-proxy/health");
    const response = await worker.fetch(request, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });
});
