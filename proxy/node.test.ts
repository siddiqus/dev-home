import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./node";

let server: http.Server;
let distDir: string;
let port: number;

/** Raw GET so paths like /../x reach the server unnormalised. */
function get(
  urlPath: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: urlPath }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
      })
      .on("error", reject);
  });
}

beforeAll(async () => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "devhome-dist-"));
  fs.writeFileSync(path.join(distDir, "index.html"), '<div id="root"></div>');
  fs.mkdirSync(path.join(distDir, "assets"));
  fs.writeFileSync(path.join(distDir, "assets", "app.js"), "console.log(1);");
  server = createServer({ distDir, env: {} });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(distDir, { recursive: true, force: true });
});

describe("node server", () => {
  it("serves index.html at / with security headers", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.body).toContain('id="root"');
  });

  it("serves assets with a JS content type and immutable caching", async () => {
    const res = await get("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/javascript");
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("falls back to index.html for client routes", async () => {
    const res = await get("/some/route");
    expect(res.status).toBe(200);
    expect(res.body).toContain('id="root"');
  });

  it("404s for paths escaping the dist dir and missing files", async () => {
    expect((await get("/../package.json")).status).toBe(404);
    expect((await get("/%2e%2e/package.json")).status).toBe(404);
    expect((await get("/assets/missing.js")).status).toBe(404);
  });

  it("answers the Jira proxy health check", async () => {
    const res = await get("/jira-proxy/health");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ok" });
  });
});
