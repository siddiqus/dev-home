import React, { useState, useEffect, useRef, useMemo } from "react";
import Form from "react-bootstrap/Form";
import { IconSearch, IconX } from "@tabler/icons-react";

export interface DropdownItem {
  value: string;
  label: string;
  icon?: string;
}

interface SearchableDropdownProps {
  items: DropdownItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  allLabel: string;
  width?: number;
}

export const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  items,
  value,
  onChange,
  placeholder,
  allLabel,
  width = 240,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search) return items;
    const lower = search.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(lower));
  }, [items, search]);

  const selectedLabel = useMemo(() => {
    if (!value) return allLabel;
    const item = items.find((i) => i.value === value);
    return item ? item.label : value;
  }, [items, value, allLabel]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setSearch("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width }}>
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
            placeholder={placeholder}
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
            {selectedLabel}
          </span>
        )}
        {value && (
          <IconX
            size={14}
            style={{ opacity: 0.5, flexShrink: 0, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setSearch("");
              setOpen(false);
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
            className={`searchable-dropdown-item d-flex align-items-center gap-2 px-3 py-2 ${!value ? "fw-bold" : ""}`}
            onMouseDown={() => handleSelect("")}
          >
            {allLabel}
          </div>
          {filtered.map((item) => (
            <div
              key={item.value}
              className={`searchable-dropdown-item d-flex align-items-center gap-2 px-3 py-2 ${value === item.value ? "fw-bold" : ""}`}
              onMouseDown={() => handleSelect(item.value)}
            >
              {item.icon && (
                <img
                  src={item.icon}
                  alt={item.label}
                  className="avatar-sm"
                  style={{ width: 18, height: 18 }}
                />
              )}
              {item.label}
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
