import { useMemo, useState } from "react";
import Offcanvas from "react-bootstrap/Offcanvas";
import { IconCheck, IconSearch } from "@tabler/icons-react";
import { useBackClose } from "../../hooks/useBackClose";

export interface SheetItem {
  value: string;
  label: string;
  avatar?: string;
}

interface Props {
  show: boolean;
  onHide(): void;
  title: string;
  searchPlaceholder: string;
  items: SheetItem[];
  values: string[];
  onChange(values: string[]): void;
}

/**
 * A bottom sheet for picking several values (PR search's authors and repos): a
 * search box, then a checkbox row per item. What was picked when the sheet
 * opened stays on top, so rows don't jump as they're ticked.
 */
export function PhoneFilterSheet({
  show,
  onHide,
  title,
  searchPlaceholder,
  items,
  values,
  onChange,
}: Props) {
  useBackClose(show, onHide);
  const [query, setQuery] = useState("");
  const [pickedAtOpen, setPickedAtOpen] = useState<string[]>([]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
    const first = new Set(pickedAtOpen);
    return [
      ...matching.filter((i) => first.has(i.value)),
      ...matching.filter((i) => !first.has(i.value)),
    ];
  }, [items, query, pickedAtOpen]);

  const toggle = (value: string) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

  return (
    <Offcanvas
      show={show}
      onHide={onHide}
      onEnter={() => {
        setPickedAtOpen(values);
        setQuery("");
      }}
      placement="bottom"
      className="phone-sheet"
      aria-labelledby={`phone-sheet-${title}`}
    >
      <Offcanvas.Header closeButton>
        <Offcanvas.Title id={`phone-sheet-${title}`}>{title}</Offcanvas.Title>
        {values.length > 0 && (
          <button type="button" className="phone-sheet__clear" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </Offcanvas.Header>
      <Offcanvas.Body className="phone-sheet__body">
        <label className="phone-sheet__search">
          <IconSearch size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </label>
        <div className="phone-sheet__rows">
          {rows.map((item) => {
            const checked = values.includes(item.value);
            return (
              <label key={item.value} className="phone-sheet__row">
                <input
                  type="checkbox"
                  className="visually-hidden"
                  checked={checked}
                  onChange={() => toggle(item.value)}
                  aria-label={item.label}
                />
                {item.avatar && <img className="phone-sheet__avatar" src={item.avatar} alt="" />}
                <span className="phone-sheet__label">{item.label}</span>
                {checked && (
                  <IconCheck size={16} className="phone-sheet__check" aria-hidden="true" />
                )}
              </label>
            );
          })}
          {rows.length === 0 && <div className="phone-sheet__none">No matches</div>}
        </div>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
