import { useCallback } from "react";
import { useToast, type ToastState } from "../components/Toast";
import { copyText } from "../utils/clipboard";

/**
 * Clipboard actions for PR rows, confirmed with a toast. Render
 * `<Toast {...toast} />` once alongside the rows, or pass a toast that's
 * already rendered higher up.
 */
export function usePRCopyActions(external?: ToastState) {
  const own = useToast();
  const toast = external ?? own;
  const showToast = toast.show;

  const copy = useCallback(
    async (text: string, confirmation: string) => {
      try {
        await copyText(text);
        showToast(confirmation);
      } catch {
        showToast("Couldn't copy to clipboard");
      }
    },
    [showToast],
  );

  const onCopyBranch = useCallback(
    (branch: string) => copy(branch, "Copied branch name to clipboard"),
    [copy],
  );
  const onCopyLink = useCallback((url: string) => copy(url, "Copied PR link to clipboard"), [copy]);
  const onCopyRef = useCallback(
    (ref: string) => copy(ref, "Copied PR reference to clipboard"),
    [copy],
  );

  const onCopyTicket = useCallback(
    (key: string) => copy(key, "Copied ticket key to clipboard"),
    [copy],
  );

  return { copy, onCopyBranch, onCopyLink, onCopyRef, onCopyTicket, toast };
}
