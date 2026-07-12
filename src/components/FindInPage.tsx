import { useState, useEffect, useRef, useCallback } from "react";
import { IconSearch, IconX, IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import "./FindInPage.css";

export function FindInPage() {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchingRef = useRef(false);
  const lastForwardRef = useRef(true);

  const close = useCallback(() => {
    setVisible(false);
    setQuery("");
    setMatchInfo(null);
    window.electronAPI?.stopFindInPage();
  }, []);

  // Navigate to next/previous match (query hasn't changed, so findNext=true)
  const navigate = useCallback(
    (forward: boolean) => {
      if (query) {
        lastForwardRef.current = forward;
        searchingRef.current = true;
        window.electronAPI?.findInPage(query, forward, true);
      }
    },
    [query],
  );

  // Start a new search (query changed, so findNext=false)
  const startSearch = useCallback((text: string) => {
    if (text) {
      lastForwardRef.current = true;
      searchingRef.current = true;
      window.electronAPI?.findInPage(text, true, false);
    } else {
      setMatchInfo(null);
      window.electronAPI?.stopFindInPage();
    }
  }, []);

  // Debounced handler for input changes
  const onQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => startSearch(text), 200);
    },
    [startSearch],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Listen for toggle-find from Electron menu (Cmd+F)
  useEffect(() => {
    const cleanup = window.electronAPI?.onToggleFind(() => {
      setVisible((prev) => {
        if (prev) {
          setQuery("");
          setMatchInfo(null);
          window.electronAPI?.stopFindInPage();
          return false;
        }
        return true;
      });
    });
    return cleanup;
  }, []);

  // Listen for find results — re-focus input since findInPage can steal focus
  useEffect(() => {
    const cleanup = window.electronAPI?.onFindResult((result) => {
      // The find bar lives inside the searched page, so findInPage counts the
      // query text in our own input as a match. The input's value is exactly
      // the query, so it contributes exactly one phantom match — discount it.
      const selfMatch = inputRef.current?.value ? 1 : 0;
      const total = Math.max(0, result.matches - selfMatch);
      const current = result.activeMatchOrdinal;

      // FindInPage is rendered last in the DOM, so the phantom match sorts last.
      // If navigation lands on it (current > total), skip past it in the same
      // direction so the user never sees "N+1 of N" or a highlight on their
      // own input. Exactly one phantom exists, so this resolves in one hop.
      if (total > 0 && current > total) {
        window.electronAPI?.findInPage(inputRef.current?.value ?? "", lastForwardRef.current, true);
        return;
      }

      setMatchInfo({ current, total });
      searchingRef.current = false;
      // findInPage may select matched text elsewhere and steal focus from our input.
      // Restore focus + cursor to end so the user can keep typing.
      const input = inputRef.current;
      if (input && document.activeElement !== input) {
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
      }
    });
    return cleanup;
  }, []);

  // Focus input when bar becomes visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  // Escape to close
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, close]);

  if (!visible) return null;

  return (
    <div className="find-bar">
      <IconSearch size={14} className="find-bar-icon" />
      <input
        ref={inputRef}
        className="find-bar-input"
        type="text"
        placeholder="Find in page..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onBlur={() => {
          // Only re-focus if findInPage stole focus mid-search
          if (searchingRef.current) {
            requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            navigate(!e.shiftKey);
          }
        }}
      />
      {matchInfo && query && (
        // Rendered as CSS generated content (::after) so find-in-page can't match
        // the count text itself (e.g. searching a digit or "of" would self-match).
        <span
          className="find-bar-count"
          data-count={
            matchInfo.total === 0 ? "No results" : `${matchInfo.current} of ${matchInfo.total}`
          }
        />
      )}
      <button
        className="find-bar-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => navigate(false)}
        disabled={!query}
        title="Previous match (Shift+Enter)"
      >
        <IconChevronUp size={14} />
      </button>
      <button
        className="find-bar-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => navigate(true)}
        disabled={!query}
        title="Next match (Enter)"
      >
        <IconChevronDown size={14} />
      </button>
      <button
        className="find-bar-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={close}
        title="Close (Escape)"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}
