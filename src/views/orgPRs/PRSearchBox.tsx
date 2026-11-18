import { useRef, useState, type Ref } from "react";
import { IconRefresh, IconSearch, IconX } from "@tabler/icons-react";
import type { GitHubPR } from "../../types";
import { fetchPR } from "../../services/github";
import { parsePRLink, type PRLink } from "./prLink";
import "./PRSearchBox.css";

interface Props {
  /** The searched text (trimmed). */
  query: string;
  onSearch(text: string): void;
  /** A pasted or entered PR link loaded. */
  onOpenPR(pr: GitHubPR): void;
  onLinkError(message: string): void;
  /** The search behind the results is loading. */
  busy?: boolean;
  /** A "/" shortcut hint while empty (desktop). */
  slashHint?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

const PR_SEARCH_PLACEHOLDER = "Search PRs or paste a link…";

/** The empty list for a text search, on either tab. */
export function noMatches(query: string, merged: boolean) {
  return {
    title: `No ${merged ? "merged" : "open"} PRs match "${query}"`,
    description: `Try ${merged ? "Open" : "Merged"}, or clear the box.`,
  };
}

/**
 * PR search's one box: a pasted PR link opens that PR (one fetch, no Enter
 * needed) and the box clears; anything else searches GitHub on Enter. Until
 * then the results stay as they were, and "↵ Search" says the text isn't
 * searched yet. Emptying the box drops the text from the search.
 */
export function PRSearchBox({
  query,
  onSearch,
  onOpenPR,
  onLinkError,
  busy,
  slashHint,
  inputRef,
}: Props) {
  const [draft, setDraft] = useState(query);
  const [opening, setOpening] = useState(false);
  const pasted = useRef(false);
  const openSeq = useRef(0);

  const openLink = (link: PRLink) => {
    const seq = ++openSeq.current;
    const [owner, repo] = link.repo.split("/");
    setOpening(true);
    fetchPR(owner, repo, link.number).then(
      (pr) => {
        if (seq !== openSeq.current) return;
        setOpening(false);
        setDraft("");
        onOpenPR(pr);
      },
      () => {
        if (seq !== openSeq.current) return;
        setOpening(false);
        onLinkError(`Couldn't load ${link.repo}#${link.number}`);
      },
    );
  };

  const onChange = (value: string) => {
    setDraft(value);
    const link = pasted.current ? parsePRLink(value) : null;
    pasted.current = false;
    if (link) openLink(link);
    else if (!value.trim() && query) onSearch("");
  };

  const submit = () => {
    const link = parsePRLink(draft);
    if (link) openLink(link);
    else onSearch(draft);
  };

  const clear = () => {
    openSeq.current++;
    setOpening(false);
    setDraft("");
    if (query) onSearch("");
  };

  const text = draft.trim();
  const pending = !!text && text !== query && !opening && !parsePRLink(text);

  return (
    <div className="pr-search-box">
      {opening || busy ? (
        <IconRefresh size={15} className="pr-search-box__icon spin" aria-hidden="true" />
      ) : (
        <IconSearch size={15} className="pr-search-box__icon" aria-hidden="true" />
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={draft}
        placeholder={PR_SEARCH_PLACEHOLDER}
        aria-label={PR_SEARCH_PLACEHOLDER}
        aria-busy={opening || busy || undefined}
        onPaste={() => (pasted.current = true)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          submit();
        }}
      />
      {pending && <kbd className="pr-search-box__hint">↵ Search</kbd>}
      {!draft && slashHint && <kbd className="pr-search-box__hint">/</kbd>}
      {draft && (
        <button
          type="button"
          className="pr-search-box__clear"
          onClick={clear}
          aria-label="Clear search"
        >
          <IconX size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
