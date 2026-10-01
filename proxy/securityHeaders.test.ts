import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "./securityHeaders";

/** Parse a Cloudflare `_headers` file into path pattern -> (name -> value). */
function parseHeadersFile(text: string): Record<string, Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = blocks[line.trim()] ??= {};
      continue;
    }
    if (!current) continue;
    const idx = line.indexOf(":");
    current[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return blocks;
}

const headersFile = () =>
  parseHeadersFile(fs.readFileSync(path.resolve(__dirname, "../public/_headers"), "utf8"));

describe("security headers", () => {
  it("public/_headers matches SECURITY_HEADERS", () => {
    expect(headersFile()["/*"]).toEqual(SECURITY_HEADERS);
  });

  it("allows the PWA manifest and service worker from our origin only", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("worker-src 'self'");
  });

  it("public/_headers makes the service worker and manifest revalidate", () => {
    const blocks = headersFile();
    expect(blocks["/sw.js"]).toEqual({ "Cache-Control": "no-cache" });
    expect(blocks["/manifest.webmanifest"]).toEqual({ "Cache-Control": "no-cache" });
  });
});
