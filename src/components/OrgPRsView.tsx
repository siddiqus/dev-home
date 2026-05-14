import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Spinner from "react-bootstrap/Spinner";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import { IconSearch, IconX } from "@tabler/icons-react";
import { GitHubPR } from "../types";
import { fetchOrgPRs, fetchOrgMembers, OrgMember } from "../services/github";
import { PRTable } from "./PRTable";

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

  // Close dropdown when clicking outside
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

interface OrgPRsViewProps {
  configured: boolean;
  jiraBaseUrl: string;
}

export const OrgPRsView: React.FC<OrgPRsViewProps> = ({ configured, jiraBaseUrl }) => {
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [author, setAuthor] = useState("");
  const [members, setMembers] = useState<OrgMember[]>([]);

  // Load org members for filter dropdown
  useEffect(() => {
    if (!configured) return;
    fetchOrgMembers()
      .then(setMembers)
      .catch((err) => console.error("Failed to fetch org members:", err));
  }, [configured]);

  // Fetch first page when author filter changes
  const fetchFirstPage = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const result = await fetchOrgPRs(undefined, author);
      setPrs(result.prs);
      setHasNextPage(result.pageInfo.hasNextPage);
      setEndCursor(result.pageInfo.endCursor);
    } catch (err) {
      console.error("Failed to fetch org PRs:", err);
    } finally {
      setLoading(false);
    }
  }, [configured, author]);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  // Fetch next page
  const fetchNextPage = useCallback(async () => {
    if (!hasNextPage || !endCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchOrgPRs(endCursor, author);
      setPrs((prev) => [...prev, ...result.prs]);
      setHasNextPage(result.pageInfo.hasNextPage);
      setEndCursor(result.pageInfo.endCursor);
    } catch (err) {
      console.error("Failed to fetch more org PRs:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasNextPage, endCursor, author, loadingMore]);

  if (loading && prs.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="secondary" />
      </div>
    );
  }

  return (
    <>
      {/* Author filter */}
      <div className="d-flex align-items-center gap-2 mb-3">
        <SearchableAuthorSelect members={members} value={author} onChange={setAuthor} />
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
