import {
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "@tabler/icons-react";
import type { GitHubPR } from "../types";
import type { MergeMethod, MergeOptions } from "../api/github";
import { MergeContext, useCanMerge } from "../context/MergeContext";
import { blurOnPointer } from "../views/workday/pointer";
import { Badge } from "./primitives/Badge";
import "./MergeButton.css";

/** How long a "Squash & merge?" waits for its second click. */
const CONFIRM_MS = 4000;

const CONFIRM_LABEL: Record<MergeMethod, string> = {
  SQUASH: "Squash & merge?",
  REBASE: "Rebase & merge?",
  MERGE: "Merge commit?",
};

/** github.com's names, for the caret menu. */
const METHOD_LABEL: Record<MergeMethod, string> = {
  MERGE: "Create a merge commit",
  SQUASH: "Squash and merge",
  REBASE: "Rebase and merge",
};

/** The button sits in clickable rows: its clicks and keys stay its own. */
const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * The Merge split button that takes the "Ready to merge" chip's place on my own
 * ready PRs; `fallback` (the chip) everywhere else.
 */
export function MergeButton({ pr, fallback }: { pr: GitHubPR; fallback: ReactNode }) {
  return useCanMerge(pr) ? <MergeControl pr={pr} /> : <>{fallback}</>;
}

type Phase = "idle" | "loading" | "confirm" | "merging";

/**
 * The first click looks up the repo's merge methods (once per session) and asks
 * to confirm with my default for 4s; a second click merges. The caret lists the
 * other methods the repo allows. A branch with a merge queue gets "Add to merge
 * queue?" and no caret: the queue picks the method.
 */
function MergeControl({ pr }: { pr: GitHubPR }) {
  const api = useContext(MergeContext)!;
  const [options, setOptions] = useState<MergeOptions | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [method, setMethod] = useState<MergeMethod | null>(null);
  /** Open caret menu's fixed position (it's portalled out of clipping rows). */
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const caretRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // An unanswered confirm lapses back to Merge.
  useEffect(() => {
    if (phase !== "confirm") return;
    const timer = setTimeout(() => setPhase("idle"), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [phase, method]);

  // The menu closes on Escape, a click elsewhere, or a scroll that would strand it.
  useEffect(() => {
    if (!menu) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.focus({ preventScroll: true });
    const close = () => setMenu(null);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
      caretRef.current?.focus();
    };
    const onDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !caretRef.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const outcome = api.done.get(pr.html_url);
  if (outcome) {
    return (
      <Badge variant="success">
        <span aria-hidden="true">✓ </span>
        <span>{outcome === "queued" ? "Queued" : "Merged"}</span>
      </Badge>
    );
  }

  const busy = phase === "loading" || phase === "merging";

  const load = async () => {
    if (options) return options;
    setPhase("loading");
    const loaded = await api.prepare(pr);
    setPhase("idle");
    if (loaded) setOptions(loaded);
    return loaded;
  };

  const confirm = (m: MergeMethod) => {
    setMethod(m);
    setPhase("confirm");
  };

  const onMain = async (e: MouseEvent) => {
    e.stopPropagation();
    // Drop pointer focus, so the deck's next Enter can't press this again.
    blurOnPointer(e);
    if (busy) return;
    if (phase === "confirm" && options && method) {
      setPhase("merging");
      if (!(await api.merge(pr, options, method))) setPhase("idle");
      return;
    }
    const loaded = await load();
    if (loaded) confirm(loaded.methods[0] ?? "MERGE");
  };

  const onCaret = async (e: MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (menu) {
      setMenu(null);
      return;
    }
    const loaded = await load();
    if (!loaded) return;
    // Nothing to pick after all: straight to the confirm.
    if (loaded.queue || loaded.methods.length < 2) {
      confirm(loaded.methods[0] ?? "MERGE");
      return;
    }
    const rect = caretRef.current?.getBoundingClientRect();
    if (rect) setMenu({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  };

  const confirming = phase === "confirm" && !!method && !!options;
  const label =
    phase === "merging"
      ? options?.queue
        ? "Queueing…"
        : "Merging…"
      : confirming
        ? options.queue
          ? "Add to merge queue?"
          : CONFIRM_LABEL[method]
        : null;
  // A queue or a single allowed method leaves nothing to pick.
  const showCaret =
    phase !== "merging" && !(options && (options.queue || options.methods.length < 2));
  const selected = method ?? options?.methods[0];

  return (
    <span
      className={`merge-btn${confirming ? " merge-btn--confirm" : ""}${busy ? " merge-btn--busy" : ""}`}
    >
      <button
        type="button"
        className="merge-btn-main"
        title={confirming ? "Click again to confirm" : undefined}
        aria-busy={busy || undefined}
        onClick={onMain}
        onKeyDown={stop}
      >
        {label ?? (
          <>
            <span aria-hidden="true">✓ </span>Merge
          </>
        )}
      </button>
      {showCaret && (
        <button
          ref={caretRef}
          type="button"
          className="merge-btn-caret"
          aria-label="Merge methods"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={onCaret}
          onKeyDown={stop}
        >
          <IconChevronDown size={12} stroke={2.2} />
        </button>
      )}
      {menu &&
        options &&
        createPortal(
          // Portalled, but React still bubbles its events to the row: stop them here.
          <div
            ref={menuRef}
            role="menu"
            aria-label="Merge method"
            className="merge-menu"
            style={{ top: menu.top, right: menu.right }}
            onClick={stop}
            onKeyDown={onMenuKey}
            onMouseDown={stop}
          >
            {options.methods.map((m) => (
              <button
                key={m}
                type="button"
                role="menuitemradio"
                aria-checked={m === selected}
                className="merge-menu-item"
                onClick={() => {
                  setMenu(null);
                  confirm(m);
                }}
              >
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
