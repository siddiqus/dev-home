# Dev Home

**Live app: [app.devhome.fyi](https://app.devhome.fyi/)**

A developer dashboard that brings your Jira issues and GitHub pull requests into one place, with planning tools for your workday.

## What is Dev Home?

Dev Home is a static web app (React + Vite) that helps you stay on top of your work across Jira and GitHub. Open [app.devhome.fyi](https://app.devhome.fyi/), add your tokens in **Settings**, and you're set. There's nothing to install and no account to create.

- **Your work**: Jira issues, your open PRs, review requests and mentions on both platforms
- **Your day**: a Workday view with Focus and Standup modes, built from your sprint, PRs and reviews
- **Your team**: team PR velocity, burn-up charts and workload
- **Personal tools**: notes with reminders, a Kanban board and a Pomodoro timer

Your data stays in your browser's localStorage. GitHub is called directly from the browser. Jira requests go through a small stateless passthrough proxy (`/jira-proxy`), because Jira Cloud blocks cross-origin requests. Credentials are never stored on the server.

## Features

**Home**

- **Summary**: at-a-glance view of your open work, mentions and top priorities
- **Workday**: sprint tickets, off-sprint work, PRs and reviews in one shared layout. **Focus** mode shows what needs you now. **Standup** mode lists what you've done since your last workday (weekend days are configurable) and copies it as Slack markdown
- **Focus**: prioritized inbox with pin, snooze and dismiss
- **Board**: drag-and-drop Kanban board pulling from PRs, review requests and notes tagged `#todo`
- **Notes**: rich-text notes with reminders and browser notifications, linked to Jira and GitHub items

**GitHub**

- **My PRs**: your open PRs, grouped under their Jira ticket, with CI checks and review state. PRs that are ready to merge get a **Merge** button (here and in Workday)
- **Reviews**: PRs waiting on your review, with your review state and a flag for new commits since you last reviewed
- **Comments**: GitHub mentions and review requests from your notifications
- **All PRs**: every open PR across your GitHub org (needs **GitHub Org** in Settings)

**Jira**

- **My Issues**: issues assigned to you, with a quick-view drawer
- **Issue Search**: JQL search with saved filters
- **Mentions**: Jira comments that mention you

**Teams**

- **Manage Teams**: group GitHub and Jira users into teams, then open a team dashboard with PR velocity, burn-up charts and workload

**Tools**

- **Pomodoro**: focus timer with task tracking and breaks

You can hide tabs you don't use, and switch between light, dark and system themes, under **Settings → Appearance**.

## Prerequisites

- Node.js 22.12+
- Yarn
- A Jira account with an API token
- A GitHub personal access token

You only need Node.js and Yarn to run Dev Home yourself. To just use it, open [app.devhome.fyi](https://app.devhome.fyi/).

## Local Development

To run your own copy instead of using [app.devhome.fyi](https://app.devhome.fyi/):

1. Install dependencies:

```bash
yarn install
```

2. Start the Vite dev server, which also serves the Jira proxy at `/jira-proxy`:

```bash
yarn dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

4. Enter your credentials in **Settings** (the app will prompt you on first launch).

Credentials are stored in browser localStorage. GitHub requests go straight to `api.github.com`. Jira requests pass through the local proxy, which never logs or stores them.

## Required Token Permissions

The same summary is in the app: open **Settings → Integrations** and click **Which permissions does this token need?** under either token field.

### GitHub Personal Access Token

Create a token at https://github.com/settings/tokens. A **classic** token is recommended, with these scopes:

| Scope (classic token) | Why it's needed |
|---|---|
| `repo` | Read PRs, commits, check statuses and review threads across public and private repos, and merge your PRs from the **Merge** button |
| `read:org` | List organization members and repositories (Teams and All PRs) |
| `notifications` | Read your GitHub notifications (mentions and review requests) for the Comments tab |

A **fine-grained** token also works, with these permissions:

| Permission | Access | Why it's needed |
|---|---|---|
| Pull requests | Read | Search and read PRs you authored or are asked to review |
| Checks | Read | Read CI check runs on PRs |
| Commit statuses | Read | Read commit statuses on PRs |
| Contents | Read | Read repository contents and branch rules |
| Metadata | Read | Required for all fine-grained tokens |
| Members | Read (organization) | List organization members |

To use the **Merge** button with a fine-grained token, give **Contents** and **Pull requests** read and write access. Everything else works with read access alone.

GitHub's notifications API doesn't accept fine-grained tokens, so the **Comments** tab stays empty with one. Use a classic token if you need it.

### Jira API Token

Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens. Use a regular API token, not a scoped one: Dev Home calls your `*.atlassian.net` site directly, and scoped tokens only work through the `api.atlassian.com` gateway. The token has the same permissions as your Atlassian account, which needs:

| Capability | Why it's needed |
|---|---|
| Browse projects | Search for issues, boards and sprints |
| Browse issues | Read issue details (summary, status, priority and so on) |
| Read comments | Fetch comments on issues to find mentions of you |

No write permissions are needed. The app only reads data from Jira, and the Jira proxy only forwards read-only endpoints. On GitHub, the only write is the **Merge** button on your own ready PRs.

#### Jira Host Restriction

For security, the Jira proxy only accepts Jira base URLs that are `https://` on a host ending in `.atlassian.net`. If you need to use a self-hosted Jira instance or another domain, the operator can set the environment variable `JIRA_ALLOWED_HOSTS` to a comma-separated list of exact hostnames (e.g., `JIRA_ALLOWED_HOSTS=jira.example.com,jira-internal.corp`).

## Where is my data?

All personal data (notes, teams, filters, focus state, sprint snapshots) is stored **only in your browser's localStorage**. There is no server-side storage.

- **Jira and GitHub credentials** are stored in localStorage. GitHub credentials are sent directly to `api.github.com`. Jira credentials pass through the Jira proxy on each Jira request, and the proxy never logs or stores them. See [docs/deploy.md](docs/deploy.md#security-considerations) for details.
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

Your notes, teams, filters, and focus state will be imported into the browser. Settings and tokens are not part of the backup, so enter them again in Settings.

## Build and run

Build the static app and the Node server:

```bash
yarn build
```

This writes the static app to `dist/` and the Node server bundle to `dist-server/server.mjs`. To serve the build locally, with the Jira proxy, on port 3000 (set `PORT` to change it), run:

```bash
yarn start
```

## Install as an app

Dev Home is an installable web app (PWA). Open [app.devhome.fyi](https://app.devhome.fyi/) (or your own deployment, or `yarn start`, but not `yarn dev`), then:

- **Chrome / Edge:** click the install icon in the address bar.
- **Safari:** choose **Share → Add to Dock** (macOS) or **Share → Add to Home Screen** (iOS).

The installed app opens in its own window. Offline, it only works with your local data (notes, Kanban, Pomodoro and so on); Jira and GitHub need a connection, and their responses are never cached. When a new version is deployed, a "New version available" toast appears; click **Reload** to switch to it.

## Deployment

The recommended host is Cloudflare Workers (free plan): run `yarn wrangler login` once, then `yarn deploy:cf`. Docker and any Node.js host are also supported. See [docs/deploy.md](docs/deploy.md) for the full guide, including environment variables, rate limiting and security considerations.

## Troubleshooting

### "Jira base URL not allowed" error

By default, only `https://*.atlassian.net` URLs are accepted. If you need to use a self-hosted Jira instance, ask the operator to set the `JIRA_ALLOWED_HOSTS` environment variable with your Jira hostname.

### Data not syncing across devices

Personal data (notes, teams, filters) is stored in browser localStorage, which is device- and browser-specific. To sync data across devices:

1. Export your data from Settings → Data → Export
2. Import the JSON file on your other device

### Credentials prompts on every page refresh

Make sure third-party cookies are not blocked in your browser, as this can prevent localStorage from persisting. Check your browser's privacy/cookie settings.
