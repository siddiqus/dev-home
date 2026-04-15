import { useState, useEffect, useRef, useCallback } from "react";
import { IconSearch, IconX, IconChevronUp, IconChevronDown } from "@tabler/icons-react";

export function FindInPage() {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchingRef = useRef(false);

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
        searchingRef.current = true;
        window.electronAPI?.findInPage(query, forward, true);
      }
    },
    [query],
  );

  // Start a new search (query changed, so findNext=false)
  const startSearch = useCallback((text: string) => {
    if (text) {
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
      setMatchInfo({ current: result.activeMatchOrdinal, total: result.matches });
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
        <span className="find-bar-count">
          {matchInfo.total === 0 ? "No results" : `${matchInfo.current} of ${matchInfo.total}`}
        </span>
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
