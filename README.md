# Dev Home Dashboard

A developer dashboard built with Next.js and React that integrates with Jira and GitHub to provide a unified view of issues, pull requests, team analytics, and personal productivity tools.

## What is Dev Home?

Dev Home is a stateless web application that helps you stay on top of your work across Jira and GitHub. It aggregates:

- **Your work**: Jira issues, open PRs, review requests, and mentions across both platforms
- **Team analytics**: PR velocity, burnup charts, and team workload (when GitHub org is configured)
- **Personal productivity**: Notes with reminders, Kanban board, Focus view, and Pomodoro timer

All personal data (notes, teams, filters, focus state) lives in your browser's localStorage. Jira and GitHub credentials are never stored server-side — they're sent with each request as headers and forwarded to the APIs.

## Features

- **Summary Dashboard**: At-a-glance view of your open work, mentions, and top priorities
- **Focus View**: Intelligently prioritized inbox with pin/snooze/dismiss actions
- **Kanban Board**: Drag-and-drop board pulling from PRs, review requests, and notes tagged `#todo`
- **Jira Integration**: View assigned issues, search with JQL, track mentions in comments
- **GitHub Integration**: Track your PRs, review requests, org-wide PRs, and GitHub mentions
- **Team Analytics**: Track team PR velocity, burn-up charts, and workload distribution
- **Personal Notes**: Create notes with reminders, link to Jira/GitHub items, tag as `#todo` for Kanban
- **Pomodoro Timer**: Focus timer with task tracking and break intervals

## Prerequisites

- Node.js (v18+)
- Yarn
- A Jira account with an API token
- A GitHub personal access token

## Local Development

1. Install dependencies:

```bash
yarn install
```

2. Start the Next.js dev server:

```bash
yarn dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

4. Enter your credentials in **Settings** (the app will prompt you on first launch).

Credentials are stored in browser localStorage and sent with each API request. The server never persists them.

## Required Token Permissions

### GitHub Personal Access Token

Create a **fine-grained** or **classic** personal access token at https://github.com/settings/tokens with the following scopes:

| Scope (Classic Token) | Why it's needed |
|---|---|
| `repo` | Read PR details, commits, check statuses, and review threads across public and private repos |
| `read:org` | List organization members and repositories |
| `notifications` | Read your GitHub notifications (mentions, review requests, etc.) |

If using a **fine-grained token**, grant these repository permissions:

| Permission | Access | Why it's needed |
|---|---|---|
| Pull requests | Read | Search and read PRs you authored or are asked to review |
| Checks | Read | Read CI/check-suite status on PRs |
| Contents | Read | Access repository metadata and release info |
| Metadata | Read | Required for all fine-grained tokens |
| Members | Read (org-level) | List organization members |
| Notifications | Read (account-level) | Read your notifications |

### Jira API Token

Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens. The token inherits the permissions of the Atlassian account it belongs to. The app needs:

| Capability | Why it's needed |
|---|---|
| Browse projects | Search for issues assigned to you |
| Browse issues | Read issue details (summary, status, priority, etc.) |
| Read comments | Fetch comments on issues to find mentions of your name/email |

No write permissions are required — the app only reads data from both GitHub and Jira.

#### Jira Host Restriction

For security, the app only accepts Jira base URLs that are `https://` on a host ending in `.atlassian.net`. If you need to use a self-hosted Jira instance or another domain, the operator can set the environment variable `JIRA_ALLOWED_HOSTS` to a comma-separated list of exact hostnames (e.g., `JIRA_ALLOWED_HOSTS=jira.example.com,jira-internal.corp`).

## Where is my data?

All personal data (notes, teams, filters, focus state, sprint snapshots) is stored **only in your browser's localStorage**. The server is stateless and does not persist any data.

- **Jira and GitHub credentials** are stored in localStorage and forwarded with each API request as `x-jira-*` and `x-github-*` headers. They are never logged or stored server-side.
- **Tokens are excluded from exports**: When you export your data via Settings → Data → Export, tokens are not included in the backup file.
- **Import/Export**: You can export your data as JSON and import it on another device or browser.

### Migrating from Dev Home Desktop

If you previously used the Electron desktop version of Dev Home, you can migrate your data:

1. Export your desktop data:

```bash
node scripts/export-sqlite.mjs ~/Library/Application\ Support/Dev\ Home/notes.db
```

This creates a `dev-home-backup-YYYY-MM-DD.json` file.

2. In the web app, go to **Settings → Data → Import** and select the JSON file.

Your notes, teams, filters, and focus state will be imported into the browser.

## Build

Build the production Next.js app:

```bash
yarn build
```

The build output is in `.next/`. For deployment, see [docs/deploy.md](docs/deploy.md).

## Deployment

See [docs/deploy.md](docs/deploy.md) for deployment instructions for Vercel, Cloudflare Workers, Docker, or any Node.js host.

## Troubleshooting

### "Invalid Jira base URL" error

By default, only `https://*.atlassian.net` URLs are accepted. If you need to use a self-hosted Jira instance, ask the operator to set the `JIRA_ALLOWED_HOSTS` environment variable with your Jira hostname.

### Data not syncing across devices

Personal data (notes, teams, filters) is stored in browser localStorage, which is device- and browser-specific. To sync data across devices:

1. Export your data from Settings → Data → Export
2. Import the JSON file on your other device

### Credentials prompts on every page refresh

Make sure third-party cookies are not blocked in your browser, as this can prevent localStorage from persisting. Check your browser's privacy/cookie settings.
