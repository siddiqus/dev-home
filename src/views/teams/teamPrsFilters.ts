/**
 * Resolve the GitHub authors to query PRs for on the Team PRs tab.
 *
 * Authors are locked to the team roster: an empty `selected` list means "all
 * members", any selection narrows to those members (intersected with the
 * roster). Blank/missing GitHub usernames are dropped and the result is deduped,
 * preserving roster order.
 */
export function effectiveAuthors(
  roster: Array<{ github_username: string }>,
  selected: string[],
): string[] {
  const usable: string[] = [];
  const seen = new Set<string>();
  for (const member of roster) {
    const username = member.github_username?.trim();
    if (!username || seen.has(username)) continue;
    seen.add(username);
    usable.push(username);
  }

  if (selected.length === 0) return usable;

  const selectedSet = new Set(selected);
  return usable.filter((username) => selectedSet.has(username));
}
