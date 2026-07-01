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

First, create an isolated worktree to review the changes without affecting the main working directory:

git fetch origin ${ctx.headBranch}
git worktree add .claude/worktrees/review-pr-${ctx.prNumber} origin/${ctx.headBranch}
cd .claude/worktrees/review-pr-${ctx.prNumber}

## Philosophy

Comment only on things that materially affect correctness, security, performance, scalability, or maintainability. A reviewer's job is to catch what breaks in production and what costs the team later — not to redecorate the code.

**Do NOT comment on:**
- Language syntax preferences, formatting, or style that a linter/formatter would handle
- Naming bikeshedding, comment wording, or other cosmetic nits
- Subjective "I would have written it differently" opinions with no concrete downside
- Restating what the code obviously does
- Speculative concerns with no realistic trigger in this codebase

If a finding wouldn't change whether you approve the PR, don't write it. Silence on a line means it's fine. A short review with three real issues beats a long one padded with nits.

## What to Look For

Analyze the diff between ${ctx.baseBranch} and ${ctx.headBranch}. Focus on hard engineering facts:

1. **Correctness & Edge Cases** — Logic bugs, off-by-one, null/undefined handling, race conditions, unhandled error paths, boundary conditions, incorrect assumptions about inputs or state.
2. **Regression Risk** — Could this break existing behavior or callers? Unintended side effects? Changed contracts that other code depends on?
3. **Security** — Injection, authn/authz gaps, secrets/data exposure, unsafe deserialization, SSRF, missing input validation. Flag concrete, exploitable holes — not theoretical hardening.
4. **Performance & Scale** — N+1 queries, missing indexes, unbounded loops/memory, blocking I/O on hot paths, algorithmic complexity that degrades with data growth, redundant work.
5. **Concurrency & State** — Shared mutable state, missing locks/atomicity, ordering assumptions, leaks (connections, listeners, timers).
6. **Consolidation** — If the diff introduces logic that clearly duplicates existing code, suggest consolidating it — but ONLY when the abstraction is a net win. Do not force shared helpers that couple unrelated callers, add premature indirection, or make the code harder to change later. When in doubt, leave duplication alone.
7. **Test Coverage** — Only where missing tests leave a real correctness or regression risk uncovered. Don't demand tests for trivial code.

## Output

Leave inline review comments on specific lines using the GitHub CLI:
- Use \`gh api\` to post line-level review comments on the PR
- For overall feedback, use \`gh pr review ${ctx.prNumber} --repo ${ctx.repoFullName}\` with --approve, --request-changes, or --comment

Each comment must state the concrete impact (what breaks, what's exploitable, what degrades) and a specific suggestion. If you can't articulate a real consequence, drop the comment.

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

This is a read-only analysis — do NOT make any code changes, commits, or pushes.

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

This is a read-only analysis — do NOT make any code changes or push anything.

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
You are generating a clear, structured PR description for PR #${ctx.prNumber} in ${ctx.repoFullName}.

This is a read-only task — do NOT make any code changes, commits, or pushes. The only write you perform is updating the PR description text on GitHub.

## Process

1. Analyze the full diff:
   \`git diff ${ctx.baseBranch}...origin/${ctx.headBranch}\`

2. Review individual commits for context:
   \`git log ${ctx.baseBranch}..origin/${ctx.headBranch} --oneline\`

3. Generate a structured PR description with these sections:

   **Summary** — What changed and why (2-3 sentences)

   **Changes** — Bulleted list of key changes, grouped by area (e.g., frontend, backend, tests, config)

   **Testing** — How the changes were tested or should be tested

   **Breaking Changes** — If any, describe what breaks and provide migration steps

4. Update the PR description on GitHub:
   \`gh pr edit ${ctx.prNumber} --repo ${ctx.repoFullName} --body "..."\`

This is a non-destructive action — it only updates the PR description, does not modify code.
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
