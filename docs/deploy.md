# Deployment Guide

Dev Home is a static single-page app (built with Vite) plus a small Jira passthrough proxy. The recommended host is Cloudflare Workers, which serves both from one deploy on the free plan. You can also self-host it with Docker or any Node.js host.

## How it works

```
Browser (static Vite app)
  ├─ GitHub ──────────────► api.github.com            (direct, user's token)
  ├─ Jira ───► /jira-proxy ──► <site>.atlassian.net   (passthrough, user's token)
  └─ localStorage          (settings, tokens, notes, kanban, teams…)
```

- **The app is static.** All app logic runs in the browser, including JQL building, comment parsing and team dashboard aggregation. The build output (`dist/`) is plain HTML, JS and CSS.
- **GitHub is called directly from the browser.** Requests go to `api.github.com` with the user's token and never touch your deployment.
- **Jira goes through `/jira-proxy`.** Jira Cloud blocks cross-origin requests made with API tokens, so the browser sends Jira requests to the proxy on the same origin. The proxy checks them against an allowlist and forwards them to the user's Jira site.
- **Credentials stay in the browser.** Jira and GitHub credentials live only in the browser's localStorage. Only the Jira credentials pass through the proxy, on each Jira request.
- **The proxy is stateless.** It doesn't log, store or cache any headers, bodies or credentials.

## Security considerations

- **HTTPS is required.** Always serve the app over HTTPS, because Jira credentials pass through the proxy on every request. Cloudflare Workers serve HTTPS by default.
- **There is no app login.** Anyone who has the URL can use the app, but only with their own Jira and GitHub credentials. If you're deploying for an organization, consider putting the app behind company SSO or an identity-aware proxy (for example Cloudflare Access).
- **Trust the operator.** The proxy never logs or stores anything, but whoever operates a deployment could in principle read the Jira tokens that pass through it. Users should prefer an instance they deployed themselves or one run by someone they trust.
- **Use read-only tokens.** Recommend **scoped, read-only Atlassian API tokens** and **fine-grained, read-only GitHub tokens**. The app only reads data from Jira and GitHub.
- **The proxy only forwards read-only Jira endpoints.** The method and path must match one of the rules below, and anything else gets `403 {"error":"Path not allowed"}`. The query string is forwarded unchanged.

  | Method | Path (after `/jira-proxy`) | Notes |
  |---|---|---|
  | `POST` | `/rest/api/3/search/jql` | JQL search (read-only, despite the `POST`) |
  | `GET` | `/rest/api/3/issue/{KEY}/comment` | `KEY` matches `^[A-Z][A-Z0-9_]*-\d+$` |
  | `GET` | `/rest/api/3/user/search` | |
  | `GET` | `/rest/api/2/user/search` | |
  | `GET` | `/rest/api/3/filter/my` | |
  | `GET` | `/rest/agile/1.0/board` | |
  | `GET` | `/rest/agile/1.0/board/{id}/sprint` | `id` matches `^\d+$` |
  | `GET` | `/rest/agile/1.0/board/{id}/sprint/{id}/issue` | each `id` matches `^\d+$` |

  The proxy also enforces these limits:
  - The Jira site (`x-jira-base-url` header) must be `https://` on a host ending in `.atlassian.net` or listed in `JIRA_ALLOWED_HOSTS`.
  - Only `Authorization`, `Accept` and `Content-Type` are forwarded upstream, and only the upstream `Content-Type` is returned.
  - Request bodies are capped at 64 KB. Upstream redirects are not followed, and upstream requests time out after 25 seconds.
  - Browser requests from other origins are rejected unless they're listed in `ALLOWED_ORIGINS`.

## Cloudflare Workers (recommended, free)

One Worker named `dev-home` serves the static app from `dist/` (Workers Static Assets) and runs the proxy on `/jira-proxy/*`, on the same origin. The configuration is in `wrangler.jsonc`:

- `main: proxy/worker.ts`
- `assets.directory: ./dist`
- `assets.not_found_handling: single-page-application`
- `assets.run_worker_first: ["/jira-proxy/*"]`

### Prerequisites

- A Cloudflare account (the free plan is enough)
- Node.js 22.12+ and Yarn
- Dependencies installed with `yarn install`. `wrangler` is a devDependency, so run it as `yarn wrangler`.

### Deploy

```bash
yarn wrangler login   # one-time: authorize wrangler with your Cloudflare account
yarn deploy:cf        # = yarn build && wrangler deploy
```

The app is then live at `https://dev-home.<your-subdomain>.workers.dev`.

### Free-tier fit

The Workers free plan allows 100,000 Worker requests per day and 10 ms of CPU time per invocation.

- **Static assets are free.** Requests for static assets are free and unlimited. Because `run_worker_first` only matches `/jira-proxy/*`, they don't invoke the Worker.
- **Only `/jira-proxy/*` requests count** toward the 100,000/day limit. One active user makes about 300 proxy requests per day at the 10-minute dashboard poll, so the free tier fits roughly **300 daily active users**.
- **CPU stays low.** The proxy only validates and streams requests and responses. It doesn't parse them, so it stays well within the 10 ms CPU limit.

### Environment variables

Both variables are optional. Set them in the `"vars"` block of `wrangler.jsonc`, or in the Cloudflare dashboard under Workers & Pages, then your Worker, then Settings, then Variables and Secrets.

```jsonc
"vars": {
  "JIRA_ALLOWED_HOSTS": "jira.example.com,jira-internal.corp"
}
```

- **`ALLOWED_ORIGINS`**: You only need this when the app is served from a different origin than the Worker, for example the app on a custom domain and the proxy on a separate Worker. When it's unset, only same-origin requests are allowed.
- **`JIRA_ALLOWED_HOSTS`**: Extra Jira hostnames, in addition to `*.atlassian.net`.

If you change variables in the dashboard, keep `wrangler.jsonc` in sync. Otherwise the next `wrangler deploy` may overwrite them.

### Rate limiting (recommended)

Rate limiting helps protect the proxy, and your free-tier quota, from abuse. Create a WAF rate-limiting rule in the Cloudflare dashboard:

1. Go to your zone, then **Security**, then **WAF**, then **Rate limiting rules**, and create a rule.
2. Match **URI Path** starts with `/jira-proxy/`.
3. Set the limit to **60 requests per 1 minute**, counted per IP.
4. Set the action to **Block**.

WAF rate-limiting rules belong to a zone. They only apply when the Worker is on a custom domain or route in a Cloudflare zone, not on `workers.dev`. If you stay on `workers.dev`, use the [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) instead. That approach needs a binding in `wrangler.jsonc` and a check in the Worker code.

### Custom domain

To add your own domain, go to your Worker in the dashboard, then **Settings**, then **Domains & Routes**, and add a custom domain or route. The domain must be in a zone on your Cloudflare account. This is also what makes the WAF rate-limiting rule above apply.

### Updating

Pull the latest code and re-run:

```bash
yarn deploy:cf
```

### Deploy from CI (optional)

`.github/workflows/deploy.yml` runs typecheck, lint and tests, then deploys on every push to `web-vite`. You can also start it by hand from the **Actions** tab. It needs two repository secrets:

1. Create the token. In the Cloudflare dashboard, go to **My Profile**, then **API Tokens**, then **Create Token**, and use the **Edit Cloudflare Workers** template. Limit it to your account (and to no zones, unless you use a custom domain).
2. Find your account ID with `yarn wrangler whoami`, or on the Workers & Pages overview page.
3. Add both as secrets, either in GitHub under **Settings**, then **Secrets and variables**, then **Actions**, or with the GitHub CLI:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN     # paste the token when prompted
   gh secret set CLOUDFLARE_ACCOUNT_ID --body <account-id>
   ```

For other CI systems, expose the same two values as the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables and run:

```bash
yarn install --frozen-lockfile
yarn deploy:cf
```

`wrangler` uses these variables instead of `wrangler login`.

## Docker / any Node host (self-host)

You need Node.js 22.12+ to install dependencies and build. `yarn build` produces the static app in `dist/`. It also bundles the Node server into `dist-server/server.mjs`, which has no runtime dependencies. The server serves `dist/` with an SPA fallback and security headers, and routes `/jira-proxy/*` to the proxy.

```bash
yarn install
yarn build
yarn start            # = node dist-server/server.mjs
```

The server listens on port 3000 by default. You can configure it with environment variables:

```bash
PORT=8080 JIRA_ALLOWED_HOSTS=jira.example.com yarn start
```

To run only the built output on a server, copy `dist/` and `dist-server/` together and run `node dist-server/server.mjs`.

### Docker

The repo includes a multi-stage `Dockerfile`:

```bash
docker build -t dev-home .
docker run -p 3000:3000 dev-home
```

You can pass environment variables with `-e`:

```bash
docker run -p 3000:3000 -e JIRA_ALLOWED_HOSTS=jira.example.com dev-home
```

The Node server speaks plain HTTP. In production, put it behind a reverse proxy or load balancer that terminates HTTPS, such as Caddy, nginx or your platform's ingress.

When `ALLOWED_ORIGINS` is unset, the proxy only accepts browser requests whose `Origin` matches the request's `Host` header. Your reverse proxy must therefore forward the original `Host`. Caddy, Traefik and ingress-nginx do this by default. Plain nginx does not: it sends the upstream address (for example `127.0.0.1:3000`), so every Jira search fails with 403. Do one of the following:

- Forward the original host. For nginx:

  ```nginx
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
  }
  ```

- Or set `ALLOWED_ORIGINS` to the app's public origin, for example `ALLOWED_ORIGINS=https://devhome.example.com`.

## Separate proxy origin (advanced)

By default the app calls the proxy on its own origin at `/jira-proxy`. To serve the app from one origin and the proxy from another:

1. Build the app with the proxy URL:

   ```bash
   VITE_JIRA_PROXY_URL=https://proxy.example.com/jira-proxy yarn build
   ```

2. On the proxy deployment, set `ALLOWED_ORIGINS` to the app's origin, for example `ALLOWED_ORIGINS=https://devhome.example.com`.
3. Add the proxy origin to the `connect-src` directive of the Content-Security-Policy. Change it in both `public/_headers` (Cloudflare) and `proxy/securityHeaders.ts` (Node server), for example `connect-src 'self' https://api.github.com https://proxy.example.com`.

## Environment variables

| Variable | Where | Default | Description |
|---|---|---|---|
| `ALLOWED_ORIGINS` | Proxy (Worker or Node) | unset (same-origin only) | Comma-separated list of exact origins allowed to call the proxy from a browser, such as `https://devhome.example.com`. Needed for a separate proxy origin, or behind a reverse proxy that does not forward the original `Host`. |
| `JIRA_ALLOWED_HOSTS` | Proxy (Worker or Node) | unset | Comma-separated list of exact Jira hostnames allowed in addition to `*.atlassian.net`, such as `jira.example.com,jira-internal.corp`. |
| `PORT` | Node server only | `3000` | Port the Node server listens on. |
| `VITE_JIRA_PROXY_URL` | Build time | `/jira-proxy` | Proxy base URL compiled into the app. Only needed for a separate proxy origin. |

No credentials are configured on the server. Users enter their Jira and GitHub credentials in the Settings UI.

## Post-deployment

1. Open the app in a browser and go to **Settings**.
2. Enter your Jira and GitHub credentials. They're saved in this browser's localStorage.
3. Check that Settings shows **Jira proxy: online** and the app version.
4. To check the proxy from the command line, run:

   ```bash
   curl https://<host>/jira-proxy/health
   # {"status":"ok"}
   ```

If Settings shows **Jira proxy: offline**, check that `/jira-proxy/*` reaches the Worker or Node server. If you use a separate proxy origin, also check `VITE_JIRA_PROXY_URL`, `ALLOWED_ORIGINS` and the CSP `connect-src` setting.

If Settings shows **Jira proxy: online** but Jira requests fail with 403 `Origin not allowed`, the proxy sees a different `Host` than the browser's origin. This usually means a reverse proxy in front of the Node server rewrites `Host`. Forward the original host (`proxy_set_header Host $host;` for nginx) or set `ALLOWED_ORIGINS`. See [Docker](#docker).

## Migrating data from the desktop app

If you previously used the Electron desktop version of Dev Home, you can move your data into the web app:

1. Export your desktop data:

   ```bash
   node scripts/export-sqlite.mjs ~/Library/Application\ Support/Dev\ Home/notes.db
   ```

   This creates a `dev-home-backup-YYYY-MM-DD.json` file.

2. In the web app, go to **Settings → Data → Import** and select the JSON file.

Your notes, teams, filters and focus state are imported into the browser. Settings and tokens are not part of the backup, so enter them again in Settings.
