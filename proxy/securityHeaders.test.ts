import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "./securityHeaders";

/** Parse the `/*` block of a Cloudflare `_headers` file into name -> value. */
function parseHeadersFile(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let inBlock = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      inBlock = line.trim() === "/*";
      continue;
    }
    if (!inBlock) continue;
    const idx = line.indexOf(":");
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return headers;
}

describe("security headers", () => {
  it("public/_headers matches SECURITY_HEADERS", () => {
    const file = fs.readFileSync(path.resolve(__dirname, "../public/_headers"), "utf8");
    expect(parseHeadersFile(file)).toEqual(SECURITY_HEADERS);
  });
});
