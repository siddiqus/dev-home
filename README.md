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
