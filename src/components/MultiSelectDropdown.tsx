import React, { useState, useEffect, useRef, useMemo } from "react";
import Form from "react-bootstrap/Form";
import { IconSearch, IconX, IconCheck } from "@tabler/icons-react";
import { DropdownItem } from "./SearchableDropdown";
import { Avatar } from "./primitives/Avatar";
import "./MultiSelectDropdown.css";

interface MultiSelectDropdownProps {
  items: DropdownItem[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  allLabel: string;
  width?: number;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  items,
  values,
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

  // Derive a noun from allLabel for count display (e.g., "All authors" -> "authors")
  const noun = useMemo(() => {
    const parts = allLabel.split(" ");
    return parts.length > 1 ? parts.slice(1).join(" ") : allLabel;
  }, [allLabel]);

  const triggerLabel = useMemo(() => {
    if (values.length === 0) return allLabel;
    if (values.length === 1) {
      const item = items.find((i) => i.value === values[0]);
      return item ? item.label : values[0];
    }
    return `${values.length} ${noun}`;
  }, [items, values, allLabel, noun]);

  const selectedSet = useMemo(() => new Set(values), [values]);

  // Build tooltip lines listing all selected item labels
  const selectedLabels = useMemo(() => {
    if (values.length <= 1) return [];
    const itemMap = new Map(items.map((i) => [i.value, i.label]));
    return values.map((v) => itemMap.get(v) || v);
  }, [items, values]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleToggle = (val: string) => {
    if (selectedSet.has(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  };

  const handleClearAll = () => {
    onChange([]);
    setSearch("");
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width }}>
      <div
        className="d-flex align-items-center"
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          padding: "0 8px",
          height: 28,
          fontSize: "0.8125rem",
          cursor: "pointer",
          background: "var(--color-bg-input)",
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
            {triggerLabel}
          </span>
        )}
        {values.length > 1 && (
          <span className="multi-select-count-wrapper">
            <span className="multi-select-count">{values.length}</span>
            <span className="multi-select-tooltip">
              {selectedLabels.map((label) => (
                <span key={label} className="multi-select-tooltip-item">
                  {label}
                </span>
              ))}
            </span>
          </span>
        )}
        {values.length > 0 && (
          <IconX
            size={14}
            style={{ opacity: 0.5, flexShrink: 0, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              handleClearAll();
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
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-bg-panel)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {/* "All" option -- clears selection */}
          <div
            className={`multi-select-item ${values.length === 0 ? "fw-bold" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              handleClearAll();
            }}
          >
            <span className="multi-select-check">
              {values.length === 0 && <IconCheck size={14} />}
            </span>
            {allLabel}
          </div>

          {filtered.map((item) => (
            <div
              key={item.value}
              className={`multi-select-item ${selectedSet.has(item.value) ? "fw-bold" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleToggle(item.value);
              }}
            >
              <span className="multi-select-check">
                {selectedSet.has(item.value) && <IconCheck size={14} />}
              </span>
              {item.icon && (
                <Avatar
                  src={item.icon}
                  alt={item.label}
                  size="sm"
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
