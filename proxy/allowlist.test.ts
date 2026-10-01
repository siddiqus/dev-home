import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handle } from "./core";

/**
 * Every Jira call the app makes must pass the proxy allowlist, or it only fails
 * in a browser with 403. Keys are the call-site templates (client-relative,
 * `${...}` collapsed to `{}`); values are representative full proxied paths.
 */
const APP_CALLS: Record<string, { method: "GET" | "POST"; path: string }[]> = {
  "/search/jql": [{ method: "POST", path: "/rest/api/3/search/jql" }],
  "/issue/{}/comment": [{ method: "GET", path: "/rest/api/3/issue/PROJ-123/comment" }],
  "/user/search": [
    { method: "GET", path: "/rest/api/3/user/search?query=ann&maxResults=20" },
    { method: "GET", path: "/rest/api/2/user/search?username=ann&maxResults=20" },
  ],
  "/filter/my": [{ method: "GET", path: "/rest/api/3/filter/my" }],
  "/board": [{ method: "GET", path: "/rest/agile/1.0/board?projectKeyOrId=PROJ" }],
  "/board/{}/sprint": [{ method: "GET", path: "/rest/agile/1.0/board/42/sprint?state=active" }],
  "/board/{}/sprint/{}/issue": [
    { method: "GET", path: "/rest/agile/1.0/board/42/sprint/7/issue?maxResults=100" },
  ],
};

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIRS = ["src/api/jira", "src/api/teams"];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Path templates passed as string literals to `.get(` / `.post(` in the Jira API layer. */
function callSiteTemplates(): Set<string> {
  const found = new Set<string>();
  const callRe = /\.(?:get|post)\(\s*(["'`])(\/[^"'`]*)\1/g;
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(callRe)) found.add(match[2].replace(/\$\{[^}]*\}/g, "{}"));
    }
  }
  return found;
}

describe("proxy allowlist covers the app's Jira calls", () => {
  it("has a representative path for every Jira call site", () => {
    const templates = callSiteTemplates();
    expect(templates.size).toBeGreaterThan(0);
    for (const template of templates) {
      expect(APP_CALLS, `add ${template} to APP_CALLS`).toHaveProperty([template]);
    }
  });

  it.each(Object.values(APP_CALLS).flat())("allows $method $path", async ({ method, path: p }) => {
    const upstream = async () => new Response("{}", { status: 200 });
    const response = await handle(
      new Request(`https://devhome.example.com/jira-proxy${p}`, {
        method,
        headers: { "x-jira-base-url": "https://acme.atlassian.net" },
        body: method === "POST" ? "{}" : undefined,
      }),
      {},
      upstream as typeof fetch,
    );
    expect(response.status).toBe(200);
  });
});
