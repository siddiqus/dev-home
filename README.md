# Dev Home Dashboard

A developer dashboard built with Electron, React, and Express that integrates with JIRA and GitHub to provide a unified view of issues and pull requests.

## Prerequisites

- Node.js (v18+)
- Yarn
- A JIRA account with an API token
- A GitHub personal access token

## Setup

Install dependencies:

```bash
yarn install
cd server && yarn install && cd ..
```

JIRA and GitHub credentials can be configured from the in-app settings.

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

## Development

Run the frontend and backend concurrently:

```bash
yarn dev
```

Or run them separately:

```bash
yarn dev:app      # Frontend only (Vite)
yarn dev:server   # Backend only (Express with hot-reload)
```

## Build

```bash
yarn build        # Build frontend + backend
```

## Packaging

Package the app into a distributable Electron application. All packaging commands run the icon generation and full build automatically before packaging.

```bash
yarn pack         # Build and create an unpacked app directory (in release/)
yarn dist         # Build and package for the current platform
yarn dist:mac     # Build and package as a macOS DMG (arm64)
```

The packaged output is written to the `release/` directory.

## Troubleshooting

### macOS: "Dev Home is damaged and can't be opened"

This is **not** an actual corruption — the app simply isn't code-signed/notarized with an Apple Developer ID, so macOS Gatekeeper quarantines it after download and refuses to open it.

To fix, run this in Terminal after dragging Dev Home into Applications:

```bash
xattr -dr com.apple.quarantine "/Applications/Dev Home.app"
```

Then open the app normally. If the error persists, clear all extended attributes instead:

```bash
xattr -cr "/Applications/Dev Home.app"
```
