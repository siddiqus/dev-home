import { describe, expect, it } from "vitest";
import { nextHandler } from "./nextHandler";
import { getConfig } from "../config";

const creds = {
  "x-jira-base-url": "https://acme.atlassian.net",
  "x-jira-email": "me@acme.com",
  "x-jira-api-token": "jt",
  "x-github-token": "gt",
  "x-github-username": "me",
};
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

describe("nextHandler", () => {
  it("passes query, params and body; default status 200", async () => {
    const h = nextHandler((req, res) =>
      res.json({ q: req.query.a, p: req.params.id, b: req.body }),
    );
    const r = await h(
      new Request("http://x/api/t?a=1", {
        method: "POST",
        body: JSON.stringify({ k: 2 }),
        headers: { "content-type": "application/json" },
      }),
      ctx({ id: "9" }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ q: "1", p: "9", b: { k: 2 } });
  });

  it("supports res.status(...).json(...)", async () => {
    const h = nextHandler((_req, res) => res.status(400).json({ error: "bad" }));
    const r = await h(new Request("http://x/api/t"), ctx());
    expect(r.status).toBe(400);
  });

  it("binds credentials from headers for getConfig()", async () => {
    const h = nextHandler((_req, res) => res.json({ user: getConfig().githubUsername }));
    const r = await h(new Request("http://x/api/t", { headers: creds }), ctx());
    expect(await r.json()).toEqual({ user: "me" });
  });

  it("maps thrown errors: missing creds → 401, axios 404 passthrough, others → 500 generic", async () => {
    const noCreds = nextHandler(() => {
      getConfig();
    });
    expect((await noCreds(new Request("http://x/api/t"), ctx())).status).toBe(401);

    const upstream = nextHandler(() => {
      throw Object.assign(new Error("x"), { response: { status: 404, data: { message: "nope" } } });
    });
    const r404 = await upstream(new Request("http://x/api/t"), ctx());
    expect(r404.status).toBe(404);
    expect(await r404.json()).toEqual({ error: "nope" });

    const boom = nextHandler(() => {
      throw new Error("secret detail");
    });
    const r500 = await boom(new Request("http://x/api/t"), ctx());
    expect(r500.status).toBe(500);
    expect(await r500.json()).toEqual({ error: "An internal server error occurred" });
  });

  it("returns 400 for malformed JSON body", async () => {
    const h = nextHandler((req, res) => res.json({ body: req.body }));
    const r = await h(
      new Request("http://x/api/t", {
        method: "POST",
        body: "{bad json",
        headers: { "content-type": "application/json" },
      }),
      ctx(),
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Invalid JSON body" });
  });
});
