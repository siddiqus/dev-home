import Modal from "react-bootstrap/Modal";

/** Focus mode's keyboard map (spec §5.12). */
export const SHORTCUTS: readonly { keys: string[]; label: string }[] = [
  { keys: ["→", "←"], label: "Next / previous ticket" },
  { keys: ["↑", "↓"], label: "Next / previous PR on the card" },
  { keys: ["Space"], label: "Toggle “I'm on it” on the selected PR or ticket" },
  { keys: ["⏎"], label: "Open the selected PR in the PR modal" },
  { keys: ["⌘⏎"], label: "Open the selected PR on GitHub" },
  { keys: ["."], label: "Add note to the selected PR" },
  { keys: ["x"], label: "Close tab" },
  { keys: ["u"], label: "Mark the selected PR unread" },
  { keys: ["n"], label: "Next ticket with unseen activity" },
  { keys: ["g c"], label: "Show only current (toggle)" },
  { keys: ["r"], label: "Refresh" },
  { keys: ["⌘K"], label: "Finder" },
  { keys: ["F", "L", "S"], label: "Focus / List View / Standup Sheet" },
  { keys: ["?"], label: "Show the shortcut sheet" },
];

export interface ShortcutSheetProps {
  show: boolean;
  onHide(): void;
}

/** The `?` shortcut sheet. No transition, so it stays still under reduced motion. */
export function ShortcutSheet({ show, onHide }: ShortcutSheetProps) {
  return (
    <Modal
      show={show}
      onHide={onHide}
      animation={false}
      className="deck-shortcuts"
      aria-labelledby="deck-shortcuts-title"
    >
      <Modal.Header closeButton>
        <Modal.Title id="deck-shortcuts-title" as="h2" className="h6 mb-0">
          Keyboard shortcuts
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <table className="deck-shortcuts-table">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.label}>
                <td className="deck-shortcuts-keys">
                  {s.keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && " / "}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </td>
                <td>{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="deck-shortcuts-foot">
          Shortcuts are ignored while typing and while a modal or drawer is open.
        </p>
      </Modal.Body>
    </Modal>
  );
}
