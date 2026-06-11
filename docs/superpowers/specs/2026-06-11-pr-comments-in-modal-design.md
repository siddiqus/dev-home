# PR Comments in Modal

**Date:** 2026-06-11
**Status:** Draft

## Overview

Add a Comments tab to the PR modal (`DescriptionModal`) so users can read PR discussion and code review feedback without leaving dev-home. The modal gets two top-level tabs — **Overview** (existing content: description, checks, Claude sessions) and **Comments** (lazy-loaded). Inside the Comments tab, a pill toggle switches between **Conversation** (general PR comments) and **Review** (inline code review comments). Every comment links back to GitHub.

## Architecture

**Approach: New Backend Endpoint + Lazy Frontend Fetch**

Comments are fetched on-demand when the user first clicks the Comments tab for a given PR. A new backend endpoint fetches both comment types via a single targeted GraphQL query for that specific PR.

```
User clicks "Comments" tab
  ↓
Frontend calls GET /api/github/prs/:owner/:repo/:number/comments
  ↓
Backend runs GraphQL query for that PR's comments + reviewThreads
  ↓
Backend returns { conversation: Comment[], review: ReviewComment[] }
  ↓
Frontend caches response until modal closes
```

### Why this approach

- Avoids bloating the bulk PR list query with full comment bodies for every PR
- Only fetches data the user actually wants to see
- Single GraphQL call gets both comment types for one PR
- Cache-until-close is simple and sufficient — comment data doesn't go stale in the span of a modal session

## Components

### 1. Backend: New Endpoint

**Route:** `GET /api/github/prs/:owner/:repo/:number/comments`

**GraphQL query:** Fetches a single PR by repo + number, requesting:

```graphql
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      comments(last: 100) {
        nodes {
          databaseId
          url
          body
          createdAt
          updatedAt
          author { login avatarUrl }
        }
      }
      reviewThreads(last: 100) {
        nodes {
          isResolved
          comments(last: 10) {
            nodes {
              databaseId
              url
              body
              createdAt
              updatedAt
              author { login avatarUrl }
              path
              line
            }
          }
        }
      }
    }
  }
}
```

**Response shape:**

```typescript
interface PRCommentsResponse {
  conversation: ConversationComment[];
  review: ReviewComment[];
}

interface ConversationComment {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
}

interface ReviewComment {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
  path: string;        // e.g. "src/auth/oauth.ts"
  line: number | null;  // line number, null if outdated
  is_resolved: boolean;
}
```

**Filtering:** Exclude bot comments using the existing `isBot()` helper. Do NOT filter out the user's own comments — unlike the mentions feed, this is a full conversation view.

**Sorting:** Conversation comments chronological (oldest first). Review comments chronological, with resolved threads pushed to the end.

### 2. Frontend: Types

Add to `src/types.ts`:

```typescript
export interface ConversationComment {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
}

export interface ReviewComment {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
  path: string;
  line: number | null;
  is_resolved: boolean;
}

export interface PRCommentsResponse {
  conversation: ConversationComment[];
  review: ReviewComment[];
}
```

### 3. Frontend: Service Function

Add to `src/services/github.ts`:

```typescript
export async function fetchPRComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRCommentsResponse>
```

Calls `GET /api/github/prs/${owner}/${repo}/${prNumber}/comments`.

### 4. Frontend: DescriptionModal Changes

**Tab bar:** Replace the current single-content layout with a two-tab layout using Bootstrap `Nav` tabs or a simple controlled state:

- **Overview** (default) — renders everything the modal currently shows: title section, description markdown, checks list, Claude sessions sidebar
- **Comments** — renders the comments view (see below)

**Tab state:** `activeTab: "overview" | "comments"`, reset to `"overview"` when the modal opens (in the existing `useEffect` on `show`).

**Comment count badge:** The Comments tab label shows a count badge. Before the lazy fetch, the badge is not shown. After `fetchPRComments()` completes, the badge shows the total count (conversation + review). This avoids adding a new field to the bulk PR query just for a count.

### 5. Frontend: Comments View

Rendered when the Comments tab is active. Contains:

**Loading state:** On first render, calls `fetchPRComments()` and shows a centered spinner. Caches the result in component state — subsequent tab switches reuse the cached data. Cache clears when the modal closes (state resets).

**Pill toggle:** A segmented control with two options:

- **Conversation (N)** — shows `conversation` comments
- **Review (N)** — shows `review` comments

Defaults to Conversation on first visit.

**Conversation comment card:**
- Row 1: Avatar (20px circle) + author name (bold) + relative timestamp + right-aligned "↗ GitHub" link
- Row 2+: Full comment body rendered with ReactMarkdown (same setup as the description: `remarkBreaks` plugin)

**Review comment card:**
- Row 1: `file:line` badge (monospace, muted background) + right-aligned "↗ GitHub" link
- Row 2: Avatar + author name + relative timestamp
- Row 3+: Full markdown body
- Resolved threads: entire card rendered at 45% opacity, with a small "Resolved" badge next to the file:line badge. Sorted to the bottom of the list.

**Empty states:**
- No conversation comments: "No comments on this PR yet."
- No review comments: "No review comments on this PR."
- Fetch error: "Failed to load comments." with a "Retry" button.

### 6. Data Flow

```
PRTable row click → setSelectedPR(pr) → DescriptionModal opens
  ↓
Modal defaults to Overview tab (existing behavior, unchanged)
  ↓
User clicks Comments tab
  ↓
First visit: fetchPRComments(owner, repo, number) → spinner → cache result
Subsequent visits: use cached data
  ↓
Pill toggle: Conversation | Review (default: Conversation)
  ↓
Render comment cards with markdown + GitHub links
  ↓
Modal closes → all state resets (tab, cache, pill selection)
```

### 7. Extracting owner/repo from PR Data

The `GitHubPR` type has `repo_full_name` (e.g. `"optimizely/cmp"`). Split on `/` to get `owner` and `repo`. The `number` field is already available directly.

## What This Does NOT Include

- Replying to or creating comments from within dev-home
- Showing diff context alongside review comments
- Real-time comment updates / polling
- Comment counts on the PR table rows (could be added later as a separate enhancement)
