import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  IconBookmark,
  IconTrash,
  IconDeviceFloppy,
  IconX,
  IconPencil,
  IconCheck,
} from "@tabler/icons-react";
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
  onUpdate: (
    id: number,
    data: { name?: string; filter_config?: { authors: string[]; repos: string[] } },
  ) => void;
  activeFilterId?: number | null;
  onClearActive?: () => void;
  currentAuthors: string[];
  currentRepos: string[];
}

export const SavedFiltersDropdown: React.FC<SavedFiltersDropdownProps> = ({
  filters,
  onApply,
  onDelete,
  canSave,
  onSave,
  onUpdate,
  activeFilterId,
  onClearActive,
  currentAuthors,
  currentRepos,
}) => {
  const [open, setOpen] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [editingFilterId, setEditingFilterId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [showUpdatedFeedback, setShowUpdatedFeedback] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (editingFilterId !== null) {
      setTimeout(() => {
        editInputRef.current?.focus();
        editInputRef.current?.select();
      }, 0);
    }
  }, [editingFilterId]);

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

  const hasFilterDiverged = useMemo(() => {
    if (activeFilterId == null) return false;
    const active = filters.find((f) => f.id === activeFilterId);
    if (!active) return false;
    const sortedA = (a: string[]) => [...a].sort();
    return (
      JSON.stringify(sortedA(currentAuthors)) !== JSON.stringify(sortedA(active.authors)) ||
      JSON.stringify(sortedA(currentRepos)) !== JSON.stringify(sortedA(active.repos))
    );
  }, [activeFilterId, filters, currentAuthors, currentRepos]);

  const handleUpdateFilter = () => {
    if (activeFilterId == null) return;
    onUpdate(activeFilterId, { filter_config: { authors: currentAuthors, repos: currentRepos } });
    setShowUpdatedFeedback(true);
    setTimeout(() => setShowUpdatedFeedback(false), 1500);
  };

  const handleRename = (id: number) => {
    if (!editName.trim()) return;
    onUpdate(id, { name: editName.trim() });
    setEditingFilterId(null);
    setEditName("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === "Enter") {
      handleRename(id);
    } else if (e.key === "Escape") {
      setEditingFilterId(null);
      setEditName("");
    }
  };

  const activeFilterName = useMemo(() => {
    if (activeFilterId == null) return undefined;
    return filters.find((f) => f.id === activeFilterId)?.name;
  }, [activeFilterId, filters]);

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
        className={`btn btn-sm d-flex align-items-center gap-1 ${activeFilterName ? "btn-outline-primary saved-filter-active-btn" : "btn-outline-secondary"}`}
        style={{ fontSize: "0.8125rem", padding: "0 8px", height: 28 }}
        onClick={() => {
          setOpen(!open);
          setShowSaveInput(false);
        }}
      >
        <IconBookmark size={14} />
        {activeFilterName || "Saved"}
        {!activeFilterName && filters.length > 0 && (
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
        {activeFilterName && onClearActive && (
          <IconX
            size={14}
            style={{ opacity: 0.7, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onClearActive();
            }}
          />
        )}
      </button>

      {/* Update button (appears when active filter diverges) */}
      {activeFilterId != null && hasFilterDiverged && !showUpdatedFeedback && (
        <button
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          style={{ fontSize: "0.8125rem", padding: "0 8px", height: 28 }}
          onClick={handleUpdateFilter}
        >
          <IconDeviceFloppy size={14} />
          Update Filter
        </button>
      )}

      {/* Save current filter button */}
      {canSave && !showSaveInput && (
        <button
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          style={{ fontSize: "0.8125rem", padding: "0 8px", height: 28 }}
          onClick={() => {
            setShowSaveInput(true);
            setOpen(false);
          }}
          title={hasFilterDiverged ? "Save as a new filter" : "Save current filter"}
        >
          <IconDeviceFloppy size={14} />
          {hasFilterDiverged ? "Save as new" : "Save"}
        </button>
      )}

      {/* Updated feedback */}
      {showUpdatedFeedback && (
        <span
          className="btn btn-sm d-flex align-items-center gap-1 saved-filter-updated-btn"
          style={{ fontSize: "0.8125rem", padding: "0 8px", height: 28 }}
        >
          <IconCheck size={14} />
          Updated!
        </span>
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
                className={`saved-filter-item ${filter.id === activeFilterId ? "saved-filter-item-active" : ""}`}
                onMouseDown={(e) => {
                  if (editingFilterId === filter.id) return;
                  e.preventDefault();
                  onApply(filter);
                  setOpen(false);
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingFilterId === filter.id ? (
                    <input
                      ref={editInputRef}
                      className="saved-filter-rename-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => handleRenameKeyDown(e, filter.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div>{filter.name}</div>
                  )}
                  <div className="saved-filter-meta">{formatMeta(filter)}</div>
                </div>
                <div className="saved-filter-actions">
                  {editingFilterId === filter.id ? (
                    <>
                      <span
                        className="saved-filter-edit"
                        style={{ opacity: 1, color: "var(--color-status-success, #3fb950)" }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRename(filter.id);
                        }}
                      >
                        <IconCheck size={14} />
                      </span>
                      <span
                        className="saved-filter-edit"
                        style={{ opacity: 1 }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingFilterId(null);
                          setEditName("");
                        }}
                      >
                        <IconX size={14} />
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className="saved-filter-edit"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingFilterId(filter.id);
                          setEditName(filter.name);
                        }}
                      >
                        <IconPencil size={14} />
                      </span>
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
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
