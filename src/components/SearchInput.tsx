import React, { forwardRef, useRef, useCallback, useImperativeHandle } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import "./SearchInput.css";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  expandOnFocus?: boolean;
  autoFocus?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      placeholder = "Search...",
      className,
      expandOnFocus = false,
      autoFocus = false,
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const handleClear = useCallback(() => {
      onChange("");
      inputRef.current?.focus();
    }, [onChange]);

    return (
      <div
        className={
          "search-input-wrapper" +
          (expandOnFocus ? " search-input--expand" : "") +
          (className ? ` ${className}` : "")
        }
      >
        <IconSearch size={14} className="search-input-icon" />
        <input
          ref={inputRef}
          type="text"
          className="search-input-field"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
        />
        {value && (
          <button type="button" className="search-input-clear" onClick={handleClear}>
            <IconX size={12} />
          </button>
        )}
      </div>
    );
  },
);
