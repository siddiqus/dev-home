import React, { useState, useEffect, useRef } from "react";
import { IconBookmark, IconTrash, IconDeviceFloppy, IconX } from "@tabler/icons-react";
import "./SavedFiltersDropdown.css";

export interface SavedFilter {
  id: number;
  name: string;
  authors: string[];
  repos: string[];
}

interface SavedFiltersDropdownProps {
  filters: SavedFilter[];
  onApply: (filter: SavedFilter) => void;
  onDelete: (id: number) => void;
  canSave: boolean;
  onSave: (name: string) => void;
}

export const SavedFiltersDropdown: React.FC<SavedFiltersDropdownProps> = ({
  filters,
  onApply,
  onDelete,
  canSave,
  onSave,
}) => {
  const [open, setOpen] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [filterName, setFilterName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSaveInput(false);
        setFilterName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (showSaveInput) {
      setTimeout(() => saveInputRef.current?.focus(), 0);
    }
  }, [showSaveInput]);

  const handleSave = () => {
    if (!filterName.trim()) return;
    onSave(filterName.trim());
    setFilterName("");
    setShowSaveInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setShowSaveInput(false);
      setFilterName("");
    }
  };

  const formatMeta = (filter: SavedFilter) => {
    const parts: string[] = [];
    if (filter.authors.length > 0) {
      parts.push(`${filter.authors.length} author${filter.authors.length > 1 ? "s" : ""}`);
    }
    if (filter.repos.length > 0) {
      parts.push(`${filter.repos.length} repo${filter.repos.length > 1 ? "s" : ""}`);
    }
    return parts.join(", ");
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}
    >
      {/* Saved filters dropdown trigger */}
      <button
        className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
        style={{ fontSize: "0.8125rem", padding: "0 8px", height: 28 }}
        onClick={() => {
          setOpen(!open);
          setShowSaveInput(false);
        }}
      >
        <IconBookmark size={14} />
        Saved
        {filters.length > 0 && (
          <span
            style={{
              fontSize: "0.6875rem",
              background: "rgba(56, 139, 253, 0.15)",
              color: "#58a6ff",
              padding: "0 5px",
              borderRadius: 8,
              lineHeight: "1.3",
            }}
          >
            {filters.length}
          </span>
        )}
      </button>

      {/* Save current filter button */}
      {canSave && !showSaveInput && (
        <button
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          style={{ fontSize: "0.8125rem", padding: "0 8px", height: 28 }}
          onClick={() => {
            setShowSaveInput(true);
            setOpen(false);
          }}
          title="Save current filter"
        >
          <IconDeviceFloppy size={14} />
        </button>
      )}

      {/* Inline save input */}
      {showSaveInput && (
        <div className="save-filter-inline">
          <input
            ref={saveInputRef}
            type="text"
            placeholder="Filter name..."
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="btn btn-outline-secondary btn-sm"
            style={{ fontSize: "0.8125rem", padding: "0 8px", height: 28 }}
            onClick={handleSave}
            disabled={!filterName.trim()}
          >
            Save
          </button>
          <IconX
            size={14}
            style={{ opacity: 0.5, cursor: "pointer" }}
            onClick={() => {
              setShowSaveInput(false);
              setFilterName("");
            }}
          />
        </div>
      )}

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 1000,
            marginTop: 4,
            minWidth: 220,
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-bg-panel)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {filters.length === 0 ? (
            <div
              className="px-3 py-2"
              style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}
            >
              No saved filters
            </div>
          ) : (
            filters.map((filter) => (
              <div
                key={filter.id}
                className="saved-filter-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onApply(filter);
                  setOpen(false);
                }}
              >
                <div>
                  <div>{filter.name}</div>
                  <div className="saved-filter-meta">{formatMeta(filter)}</div>
                </div>
                <span
                  className="saved-filter-delete"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(filter.id);
                  }}
                >
                  <IconTrash size={14} />
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
