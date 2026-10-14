import { useState, type KeyboardEvent } from "react";

export interface DeckNoteComposerProps {
  /** Saves the trimmed text; the composer stays open (and editable) if it rejects. */
  onSave(text: string): Promise<void>;
  onCancel(): void;
}

/** The inline one-line note composer under the selected PR row (spec §5.10). */
export function DeckNoteComposer({ onSave, onCancel }: DeckNoteComposerProps) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
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
      onSave(value).catch(() => setSaving(false));
    }
  };
  return (
    <div className="deck-note-composer">
      <span aria-hidden="true">📝</span>
      <input
        type="text"
        className="form-control form-control-sm"
        aria-label="New note"
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
