# Deployment Guide

Dev Home is a Next.js web application with a stateless backend. It can be deployed to any platform that supports Node.js or Next.js.

## Security Considerations

- **HTTPS is required**: Always serve the app over HTTPS in production. The app forwards user credentials to third-party APIs, so TLS is essential.
- **No built-in authentication**: The app has no login system. Anyone with the URL can access it, but they must provide their own Jira and GitHub credentials. If you're deploying for an organization, consider putting the app behind company SSO or an identity-aware proxy.

## Vercel (Hobby Plan)

The easiest deployment option. Vercel auto-detects Next.js and requires no configuration.

1. Import your repository at [vercel.com/new](https://vercel.com/new).
2. Vercel will auto-detect the framework preset (Next.js).
3. Deploy with default settings (no environment variables required).

The app is automatically built and deployed. Heavy API routes set `maxDuration = 60` to accommodate slower Jira/GitHub responses. The Hobby plan's function duration is configurable, so these routes should work within the plan's limits.

### Optional Environment Variable

- **`JIRA_ALLOWED_HOSTS`** (optional): Comma-separated list of hostnames allowed for Jira base URLs, in addition to `*.atlassian.net`. Example: `jira.example.com,jira-internal.corp`.

## Cloudflare Workers (OpenNext)

Cloudflare Workers offer generous free-tier limits (100,000 requests/day) and global edge deployment.

### Setup

1. Install dependencies (dev-only, do not commit unless you choose Cloudflare as your deployment target):

```bash
yarn add -D @opennextjs/cloudflare wrangler
```

2. Create `open-next.config.ts` in the project root:

```typescript
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
export default defineCloudflareConfig();
```

3. Create `wrangler.jsonc` in the project root:

```jsonc
{
  "name": "dev-home",
  "main": ".open-next/worker.js",
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "compatibility_flags": ["nodejs_compat"],
  "compatibility_date": "2026-09-30"
}
```

4. Build and deploy:

```bash
npx opennextjs-cloudflare build
npx wrangler deploy
```

The app will be deployed to `https://dev-home.<your-workers-subdomain>.workers.dev`.

**Free tier limits**: 100,000 requests/day, 10ms CPU time per request, 128 MB memory. Heavy aggregation routes may exceed the free plan's CPU limit, so the Workers Paid plan ($5/month) or Vercel is recommended for heavy use.

### Optional Environment Variable

Set environment variables via `wrangler secret put`:

```bash
echo "jira.example.com,jira-internal.corp" | wrangler secret put JIRA_ALLOWED_HOSTS
```

## Docker or Any Node.js Host

Next.js produces a standalone server bundle that can run anywhere Node.js is available.

### Build

```bash
yarn build
```

This creates `.next/standalone/`, a self-contained Node.js server.

### Run

The standalone server expects `.next/static` and `public` to be copied alongside it:

```bash
# After building:
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# Start the server:
node .next/standalone/server.js
```

The server listens on port 3000 by default. Set `PORT` to change it:

```bash
PORT=8080 node .next/standalone/server.js
```

### Docker Example

```dockerfile
FROM node:22-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t dev-home .
docker run -p 3000:3000 dev-home
```

### Optional Environment Variable

Set `JIRA_ALLOWED_HOSTS` in your environment or Docker container:

```bash
JIRA_ALLOWED_HOSTS=jira.example.com,jira-internal.corp node .next/standalone/server.js
```

Or in Docker:

```bash
docker run -p 3000:3000 -e JIRA_ALLOWED_HOSTS=jira.example.com dev-home
```

## Environment Variables

The app has a single optional environment variable:

- **`JIRA_ALLOWED_HOSTS`** (optional): Comma-separated list of exact hostnames allowed for Jira base URLs, in addition to the default `*.atlassian.net`. Use this if you need to connect to a self-hosted Jira instance or a non-Atlassian domain.

  Example: `JIRA_ALLOWED_HOSTS=jira.example.com,jira-internal.corp`

No other environment variables are required. Jira and GitHub credentials are provided by users in the Settings UI and sent per-request as headers.

## Post-Deployment

After deploying, open the app in a browser and go to **Settings** to configure your Jira and GitHub credentials. The app will store them in localStorage and forward them with each API request.
