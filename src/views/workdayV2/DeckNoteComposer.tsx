import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface DeckNoteComposerProps {
  /** What the note is for, shown before the input, e.g. "#1203". */
  target?: string;
  /** Saves the trimmed text; the composer stays open (and editable) if it rejects. */
  onSave(text: string): Promise<void>;
  onCancel(): void;
}

/** The inline one-line note composer under the card's PR list (spec §5.10). */
export function DeckNoteComposer({ target, onSave, onCancel }: DeckNoteComposerProps) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Disabling the input while saving drops its focus; a failed save hands it back.
  const refocus = useRef(false);
  useEffect(() => {
    if (saving || !refocus.current) return;
    refocus.current = false;
    inputRef.current?.focus();
  }, [saving]);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      const value = text.trim();
      if (!value || saving) return;
      setSaving(true);
      onSave(value).catch(() => {
        refocus.current = true;
        setSaving(false);
      });
    }
  };
  return (
    <div className={`deck-note-composer${target ? " deck-note-composer--pr" : ""}`}>
      <span aria-hidden="true">📝</span>
      {target && (
        <span className="deck-note-target" aria-hidden="true">
          {target}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        className="form-control form-control-sm"
        aria-label={target ? `New note on ${target}` : "New note"}
        placeholder="Add a note · ⏎ save · Esc cancel"
        value={text}
        disabled={saving}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
