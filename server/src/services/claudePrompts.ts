type ClaudeAction = "review" | "explain_comments" | "investigate_ci" | "summarize" | "custom";

export interface PromptContext {
  prNumber: number;
  repoFullName: string;
  headBranch: string;
  baseBranch: string;
  cwd: string;
  customPrompt?: string;
}

export function buildPrompt(action: ClaudeAction, ctx: PromptContext): string {
  switch (action) {
    case "review":
      return buildReviewPrompt(ctx);
    case "explain_comments":
      return buildExplainCommentsPrompt(ctx);
    case "investigate_ci":
      return buildInvestigateCiPrompt(ctx);
    case "summarize":
      return buildSummarizePrompt(ctx);
    case "custom":
      return buildCustomPrompt(ctx);
  }
}

function buildReviewPrompt(ctx: PromptContext): string {
  return `
You are a senior software engineer conducting a thorough code review of PR #${ctx.prNumber} in ${ctx.repoFullName}.

This is a read-only review. Do NOT modify, fix, or refactor any code. Do NOT commit or push. Your only output is review comments — describe issues and suggested changes in comments, but never edit the source files yourself.

## Setup

Check out the PR in an isolated worktree so you review it with the full workspace context, not just the diff:

git fetch origin ${ctx.baseBranch} ${ctx.headBranch}
git worktree remove --force .claude/worktrees/review-pr-${ctx.prNumber} 2>/dev/null || true
git worktree add --detach .claude/worktrees/review-pr-${ctx.prNumber} origin/${ctx.headBranch}
cd .claude/worktrees/review-pr-${ctx.prNumber}
git diff origin/${ctx.baseBranch}...HEAD

Do the whole review from inside this worktree. The diff tells you what changed; the worktree tells you whether it's right. For every changed function, type, or contract:
- Read the full file, not just the hunk
- Find its callers and callees (grep/search the worktree) and check they still hold up under the new behavior
- Look at how similar problems are already solved elsewhere in the repo, so you can judge consistency and spot duplicated or diverging logic
- Check related config, schemas, migrations, and tests that the change should have touched but didn't

## Philosophy

Comment only on things that materially affect correctness, security, performance, scalability, or maintainability. Be adversarial about correctness and rigorous about quality, but never pedantic. A reviewer's job is to catch what breaks in production and what costs the team later — not to redecorate the code.

**Do NOT comment on:**
- Language syntax preferences, formatting, or style that a linter/formatter would handle
- Naming bikeshedding, comment wording, or other cosmetic nits
- Subjective "I would have written it differently" opinions with no concrete downside
- Restating what the code obviously does
- Speculative concerns with no realistic trigger in this codebase

If a finding wouldn't change whether you approve the PR, don't write it. Silence on a line means it's fine. A short review with three real issues beats a long one padded with nits.

## What to Look For

Analyze the diff between ${ctx.baseBranch} and ${ctx.headBranch} in the context of the surrounding codebase. Do two passes.

### Pass 1 — Adversarial review

Assume the change is broken and try to prove it. Act as an attacker, a hostile input source, and an unlucky production environment. For each changed code path, actively construct the inputs and states that would make it fail, then trace them through the code to confirm whether they actually do:

- **Edge cases** — empty/null/undefined, zero, negative, very large, NaN, empty strings/arrays/maps, duplicates, unicode, unexpected types or shapes from external APIs, missing optional fields, first/last iteration, pagination boundaries, timezones and DST.
- **Failure paths** — what happens when a network call, DB query, file read, or parse throws or times out? Partial failures mid-operation? Retries that double-apply? Errors that are swallowed or leave state inconsistent?
- **Concurrency & ordering** — two requests at once, events arriving out of order, re-entrancy, stale reads, unmount/cancel mid-flight, leaks (connections, listeners, timers, subscriptions).
- **Hostile input** — injection (SQL, shell, path, HTML), authn/authz bypass, secrets or data exposure, SSRF, unsafe deserialization, missing validation at trust boundaries. Flag concrete, exploitable holes — not theoretical hardening.
- **Broken contracts** — callers found in the worktree that rely on the old behavior, signature, return shape, or side effects; backward-compatibility of persisted data and public APIs.
- **Scale** — N+1 queries, missing indexes, unbounded loops/memory, blocking I/O on hot paths, complexity that degrades with data growth.

Only report a finding when you can describe the concrete scenario (inputs/state → wrong result, crash, or exploit). If you tried to break something and it held up, say nothing about it.

### Pass 2 — Code quality & anti-patterns

Judge the change against how this codebase already works (use the worktree to compare). Flag issues that carry a real maintenance or correctness cost:

- **Anti-patterns** — god functions, deep nesting that hides logic bugs, boolean-flag parameters that fork behavior, stringly-typed state, magic values with meaning, copy-pasted blocks that will drift, mutation of shared/input objects, catch-and-ignore, \`any\`/unchecked casts that defeat the type system, leaky abstractions, wrong layer (e.g. business logic in UI or transport code).
- **Inconsistency with the codebase** — re-implementing an existing helper/util, bypassing an established pattern (error handling, data fetching, logging, config), or introducing a second way of doing something the repo already does one way.
- **Consolidation** — suggest consolidating duplicated logic ONLY when the abstraction is a net win. Do not force shared helpers that couple unrelated callers, add premature indirection, or make the code harder to change later. When in doubt, leave duplication alone.
- **Dead or misleading code** — unused branches, stale comments that contradict the code, leftover debug code, TODOs that hide incomplete behavior.
- **Test coverage** — only where missing tests leave a real correctness or regression risk uncovered (especially the edge cases from Pass 1). Don't demand tests for trivial code.

## Output

Leave inline review comments on specific lines using the GitHub CLI:
- Use \`gh api\` to post line-level review comments on the PR
- For overall feedback, use \`gh pr review ${ctx.prNumber} --repo ${ctx.repoFullName}\` with --approve, --request-changes, or --comment

Each comment must state the concrete impact (what breaks, what's exploitable, what degrades, or what it costs to maintain) and a specific suggestion. For adversarial findings, include the triggering scenario. If you can't articulate a real consequence, drop the comment.

End every review comment with a newline and the tag: \`🤖 Generated by Claude\`

Provide an overall assessment with a clear recommendation: approve, request changes, or comment only. If the PR is solid, say so plainly and approve — don't manufacture findings to look thorough.

If a \`/review\` or \`/code-review\` skill is available, use it to augment your review.

## Mandates
DO NOT APPROVE OR REJECT A PR
DO NOT MAKE ANY CHANGES TO THE PR CODE

## Cleanup

After completing the review, clean up the worktree:

cd ${ctx.cwd}
git worktree remove .claude/worktrees/review-pr-${ctx.prNumber}
`.trim();
}

function buildInvestigateCiPrompt(ctx: PromptContext): string {
  return `
You are investigating CI failures on PR #${ctx.prNumber} in ${ctx.repoFullName}.

This is a read-only analysis — do NOT make any code changes, commits, or pushes or updates to anything regarding this PR.

## Process

1. Check CI status: \`gh pr checks ${ctx.prNumber} --repo ${ctx.repoFullName}\`

2. For each failing check, fetch the logs to understand the failure. Use \`gh run view\` or \`gh api\` to get workflow run logs.

3. Analyze the root cause systematically. Common causes include:
   - Test assertion failures
   - TypeScript/type errors
   - Linting or formatting violations
   - Build/compilation errors
   - Dependency resolution issues
   - Flaky tests or environment-specific failures

4. For each failure, provide:
   - **What failed** — The specific check, test, or step that failed
   - **Root cause** — Why it failed based on the logs
   - **Suggested fix** — What code changes would resolve it, with file paths and code snippets
   - **Confidence** — How confident you are in the diagnosis (high/medium/low)

5. At the end, provide a prioritized summary of all failures and suggested fixes.
`.trim();
}

function buildExplainCommentsPrompt(ctx: PromptContext): string {
  return `
You are explaining the review comments on PR #${ctx.prNumber} in ${ctx.repoFullName}.

This is a read-only analysis — do NOT make any code changes, commits, or pushes or updates to anything regarding this PR.

## Process

1. Fetch all review comments:
   - \`gh api repos/${ctx.repoFullName}/pulls/${ctx.prNumber}/comments\`
   - \`gh pr view ${ctx.prNumber} --repo ${ctx.repoFullName} --comments\`

2. For each review comment, provide a clear explanation:
   - **What the reviewer is asking for** — Restate the feedback in plain language
   - **Why it matters** — Explain the underlying concern (best practices, security, performance, maintainability, readability, etc.)
   - **What changes would satisfy the feedback** — Describe the specific code changes needed
   - **Code examples** — If applicable, show a before/after code snippet

3. Group explanations by file or topic for readability.

4. At the end, provide a summary of the overall review feedback themes (e.g., "The review mainly focuses on test coverage gaps and inconsistent error handling patterns").
`.trim();
}

function buildSummarizePrompt(ctx: PromptContext): string {
  return `
You are explaining PR #${ctx.prNumber} in ${ctx.repoFullName} to a reader who wants to understand what it actually does.

This is a read-only analysis — do NOT make any code changes, commits, or pushes, and do NOT modify the PR itself (no description edits, comments, labels, or reviews). Your only output is the explanation you print back here.

## Gather context

1. Read the PR title and description:
   \`gh pr view ${ctx.prNumber} --repo ${ctx.repoFullName}\`

2. Read the actual code changes — this is the source of truth:
   \`gh pr diff ${ctx.prNumber} --repo ${ctx.repoFullName}\`

3. Skim the commit messages for intent:
   \`git fetch origin ${ctx.headBranch}\` then \`git log ${ctx.baseBranch}..origin/${ctx.headBranch} --oneline\`

4. Create a worktree in the current ${ctx.cwd}, checkout the pr code and use the surrounding code context to summarize the changes including codebase context.

## Your job

Go beyond restating the diff. Read the code changes and work out what they genuinely do, then explain it in simple, plain language a busy teammate can follow without knowing this codebase. Avoid jargon where a plain word works; when a technical term is unavoidable, say briefly what it means.

If the PR contains several distinct changes, break the explanation down per change. Otherwise treat it as one. For the change (or each distinct change), cover:

**What is the change** — In plain terms, what was actually added, removed, or modified, and what the code does now.

**Why is it there** — The problem it solves or the goal behind it. Use the title, description, and commits — but if they don't explain the "why", infer it from the code and clearly mark it as your inference.

**Assumptions** — What the change takes for granted to work correctly (expected inputs, data shape, ordering, environment, that another system behaves a certain way, etc.). Call out anything that looks fragile.

**Impact** — What this affects: behavior users will notice, other code or callers that depend on it, performance, data, and backward compatibility / breaking changes. Note anything to watch out for.

## Notes

- Base the explanation on the real code changes, not just the PR description — the description can be incomplete or out of date.
- If part of the diff is unclear or you can't determine intent, say so plainly instead of guessing confidently.
- Keep it concise and skimmable — short paragraphs and bullets, not walls of text.
`.trim();
}

function buildCustomPrompt(ctx: PromptContext): string {
  return `
You are working in repository ${ctx.repoFullName} on PR #${ctx.prNumber}.
Branch: ${ctx.headBranch} → ${ctx.baseBranch}
Repository path: ${ctx.cwd}

${ctx.customPrompt || ""}
`.trim();
}
