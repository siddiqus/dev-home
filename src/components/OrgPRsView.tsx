import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Spinner from "react-bootstrap/Spinner";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import { IconSearch, IconX, IconRefresh } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { fetchOrgPRs, fetchOrgMembers, OrgMember } from "../services/github";
import { PRTable } from "./PRTable";

// --- localStorage caching ---

const MEMBERS_CACHE_KEY = "dev-home-org-members-cache";
const PRS_CACHE_KEY = "dev-home-org-prs-cache";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function loadCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function saveCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}

interface PRsCacheData {
  prs: GitHubPR[];
  hasNextPage: boolean;
  endCursor: string | null;
  author: string;
}

// --- SearchableAuthorSelect ---

interface SearchableAuthorSelectProps {
  members: OrgMember[];
  value: string;
  onChange: (login: string) => void;
}

const SearchableAuthorSelect: React.FC<SearchableAuthorSelectProps> = ({
  members,
  value,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return members;
    const lower = search.toLowerCase();
    return members.filter((m) => m.login.toLowerCase().includes(lower));
  }, [members, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (login: string) => {
    onChange(login);
    setSearch("");
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setSearch("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: 240 }}>
      <div
        className="d-flex align-items-center"
        style={{
          border: "1px solid var(--border-color, #d0d7de)",
          borderRadius: 6,
          padding: "2px 8px",
          fontSize: "0.8125rem",
          cursor: "pointer",
          background: "var(--input-bg, #fff)",
        }}
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
      >
        <IconSearch size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
        {open ? (
          <Form.Control
            ref={inputRef}
            type="text"
            size="sm"
            placeholder="Search authors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              border: "none",
              boxShadow: "none",
              padding: "2px 6px",
              fontSize: "0.8125rem",
              background: "transparent",
            }}
          />
        ) : (
          <span className="text-truncate" style={{ padding: "3px 6px", flex: 1 }}>
            {value || "All authors"}
          </span>
        )}
        {value && (
          <IconX
            size={14}
            style={{ opacity: 0.5, flexShrink: 0, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          />
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 1000,
            marginTop: 4,
            border: "1px solid var(--border-color, #d0d7de)",
            borderRadius: 6,
            background: "var(--card-bg, #fff)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          <div
            className={`d-flex align-items-center gap-2 px-3 py-2 ${!value ? "fw-bold" : ""}`}
            style={{ cursor: "pointer", fontSize: "0.8125rem" }}
            onMouseDown={() => handleSelect("")}
          >
            All authors
          </div>
          {filtered.map((m) => (
            <div
              key={m.login}
              className={`d-flex align-items-center gap-2 px-3 py-2 ${value === m.login ? "fw-bold" : ""}`}
              style={{ cursor: "pointer", fontSize: "0.8125rem" }}
              onMouseDown={() => handleSelect(m.login)}
            >
              <img
                src={m.avatar_url}
                alt={m.login}
                className="avatar-sm"
                style={{ width: 18, height: 18 }}
              />
              {m.login}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-secondary-custom" style={{ fontSize: "0.8125rem" }}>
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- OrgPRsView ---

interface OrgPRsViewProps {
  configured: boolean;
  jiraBaseUrl: string;
}

export const OrgPRsView: React.FC<OrgPRsViewProps> = ({ configured, jiraBaseUrl }) => {
  const cachedPRs = useRef(loadCache<PRsCacheData>(PRS_CACHE_KEY));
  const cachedMembers = useRef(loadCache<OrgMember[]>(MEMBERS_CACHE_KEY));

  const [prs, setPrs] = useState<GitHubPR[]>(cachedPRs.current?.prs ?? []);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(cachedPRs.current?.hasNextPage ?? false);
  const [endCursor, setEndCursor] = useState<string | null>(cachedPRs.current?.endCursor ?? null);
  const [author, setAuthor] = useState(cachedPRs.current?.author ?? "");
  const [members, setMembers] = useState<OrgMember[]>(cachedMembers.current ?? []);

  // Load org members (from cache or network)
  const loadMembers = useCallback(
    async (skipCache = false) => {
      if (!configured) return;
      if (!skipCache && members.length > 0) return;
      try {
        const data = await fetchOrgMembers();
        setMembers(data);
        saveCache(MEMBERS_CACHE_KEY, data);
      } catch (err) {
        console.error("Failed to fetch org members:", err);
      }
    },
    [configured, members.length],
  );

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Fetch first page when author filter changes
  const fetchFirstPage = useCallback(
    async (skipCache = false) => {
      if (!configured) return;

      // Use cache if available and author matches
      if (!skipCache && cachedPRs.current && cachedPRs.current.author === author) {
        // Already initialized from cache in useState
        cachedPRs.current = null; // consume cache so subsequent calls fetch fresh
        return;
      }

      setLoading(true);
      try {
        const result = await fetchOrgPRs(undefined, author);
        setPrs(result.prs);
        setHasNextPage(result.pageInfo.hasNextPage);
        setEndCursor(result.pageInfo.endCursor);
        saveCache(PRS_CACHE_KEY, {
          prs: result.prs,
          hasNextPage: result.pageInfo.hasNextPage,
          endCursor: result.pageInfo.endCursor,
          author,
        });
      } catch (err) {
        console.error("Failed to fetch org PRs:", err);
      } finally {
        setLoading(false);
      }
    },
    [configured, author],
  );

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  // Fetch next page
  const fetchNextPage = useCallback(async () => {
    if (!hasNextPage || !endCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchOrgPRs(endCursor, author);
      const merged = [...prs, ...result.prs];
      setPrs(merged);
      setHasNextPage(result.pageInfo.hasNextPage);
      setEndCursor(result.pageInfo.endCursor);
      saveCache(PRS_CACHE_KEY, {
        prs: merged,
        hasNextPage: result.pageInfo.hasNextPage,
        endCursor: result.pageInfo.endCursor,
        author,
      });
    } catch (err) {
      console.error("Failed to fetch more org PRs:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasNextPage, endCursor, author, loadingMore, prs]);

  // Refresh: clear cache and re-fetch everything
  const handleRefresh = useCallback(() => {
    cachedPRs.current = null;
    localStorage.removeItem(PRS_CACHE_KEY);
    localStorage.removeItem(MEMBERS_CACHE_KEY);
    loadMembers(true);
    fetchFirstPage(true);
  }, [loadMembers, fetchFirstPage]);

  if (loading && prs.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar: author filter (left) + refresh (right) */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <SearchableAuthorSelect members={members} value={author} onChange={setAuthor} />
        <div className="d-flex align-items-center gap-2">
          {loading && <Spinner animation="border" size="sm" variant="secondary" />}
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh"
          >
            <IconRefresh size={14} />
          </Button>
        </div>
      </div>

      <PRTable prs={prs} loading={loading} jiraBaseUrl={jiraBaseUrl} variant="org-prs" />

      {/* Load more button */}
      {hasNextPage && (
        <div className="d-flex justify-content-center py-3">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={fetchNextPage}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </>
  );
};
