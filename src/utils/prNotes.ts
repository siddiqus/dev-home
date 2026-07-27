import { GitHubPR, Note } from "../types";

// `${pr.repo_full_name}#${pr.number}`, e.g. "octo/repo#42"
export function prNoteKey(pr: Pick<GitHubPR, "repo_full_name" | "number">): string {
  return `${pr.repo_full_name}#${pr.number}`;
}

// Normalize a note's reference_id to the canonical PR key form "owner/repo#number", or null.
export function normalizeNoteRef(referenceId: string | null | undefined): string | null {
  // null/undefined/empty/whitespace-only → null
  if (!referenceId || !referenceId.trim()) {
    return null;
  }

  const trimmed = referenceId.trim();

  // Already canonical owner/repo#number (match /^[\w.-]+\/[\w.-]+#\d+$/)
  if (/^[\w.-]+\/[\w.-]+#\d+$/.test(trimmed)) {
    return trimmed;
  }

  // GitHub PR URL: https://github.com/<owner>/<repo>/pull/<n>
  // Tolerate: http or https; optional trailing /; trailing ?query and/or #fragment
  const githubPrPattern =
    /^https?:\/\/github\.com\/([^\s/]+)\/([^\s/]+)\/pull\/(\d+)(?:\/)?(?:\?[^#]*)?(?:#.*)?$/i;
  const match = trimmed.match(githubPrPattern);

  if (match) {
    const [, owner, repo, number] = match;
    return `${owner}/${repo}#${number}`;
  }

  // Anything else → null
  return null;
}

// Notes whose reference_id resolves to this PR's key, input order preserved.
export function notesForPr(notes: Note[], pr: Pick<GitHubPR, "repo_full_name" | "number">): Note[] {
  const targetKey = prNoteKey(pr);
  return notes.filter((note) => normalizeNoteRef(note.reference_id) === targetKey);
}
