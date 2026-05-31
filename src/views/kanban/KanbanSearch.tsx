import React from "react";
import { IconSearch, IconX } from "@tabler/icons-react";

interface KanbanSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const KanbanSearch: React.FC<KanbanSearchProps> = ({
  value,
  onChange,
  placeholder = "Search tiles...",
}) => (
  <div className="kanban-search-wrapper">
    <IconSearch size={14} className="kanban-search-icon" />
    <input
      type="text"
      className="kanban-search-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    {value && (
      <button className="kanban-search-clear" onClick={() => onChange("")}>
        <IconX size={14} />
      </button>
    )}
  </div>
);
