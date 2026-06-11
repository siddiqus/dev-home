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

## Setup

First, create an isolated worktree to review the changes without affecting the main working directory:

git fetch origin ${ctx.headBranch}
git worktree add .claude/worktrees/review-pr-${ctx.prNumber} origin/${ctx.headBranch}
cd .claude/worktrees/review-pr-${ctx.prNumber}

## Review Criteria

Analyze the diff between ${ctx.baseBranch} and ${ctx.headBranch} with these criteria:

1. **Coding Best Practices** — Design patterns, SOLID principles, DRY, appropriate abstractions
2. **Codebase Conventions** — Consistency with existing patterns, naming conventions, file structure, and style in this repository
3. **Regression Prevention** — Could these changes break existing functionality? Are there unintended side effects?
4. **Test Coverage** — Are there adequate tests? Are edge cases and error paths covered? Are existing tests updated for changed behavior?
5. **Code Clarity & Readability** — Is the code self-documenting? Are variable and function names meaningful? Is complexity minimized?
6. **Documentation** — Point out where documentation is necessary: complex logic, public APIs, non-obvious behavior, architectural decisions
7. **Security** — Check for injection vulnerabilities, authentication/authorization issues, data exposure, OWASP top 10
8. **Performance** — Unnecessary loops, N+1 queries, large memory allocations, missing indexes, unoptimized algorithms
9. **Error Handling** — Are errors handled gracefully? Are error messages helpful and actionable?

## Output

Leave inline review comments on specific lines using the GitHub CLI:
- Use \`gh api\` to post line-level review comments on the PR
- For overall feedback, use \`gh pr review ${ctx.prNumber} --repo ${ctx.repoFullName}\` with --approve, --request-changes, or --comment

Provide an overall assessment with a clear recommendation: approve, request changes, or comment only.

If a \`/review\` or \`/code-review\` skill is available, use it to augment your review.

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
