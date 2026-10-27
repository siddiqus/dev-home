/**
 * Copies text to the clipboard. The Clipboard API only exists on secure origins
 * (https, localhost); on plain http, such as the dev server opened on a phone by
 * its LAN address, this falls back to selecting the text and execCommand("copy").
 * Rejects if neither works.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission or focus refused: try the fallback.
    }
  }
  if (!copyBySelection(text)) throw new Error("Couldn't copy to clipboard");
}

/**
 * Selects the text in an off-screen span and copies the selection. A range,
 * not a focused textarea: an open modal's focus trap can't pull it away, and
 * phones don't flash the keyboard. Runs synchronously, inside the tap.
 */
function copyBySelection(text: string): boolean {
  const span = document.createElement("span");
  span.textContent = text;
  span.style.cssText =
    "position:fixed;top:0;clip:rect(0,0,0,0);white-space:pre;user-select:text;-webkit-user-select:text";
  document.body.appendChild(span);
  const selection = document.getSelection();
  try {
    const range = document.createRange();
    range.selectNodeContents(span);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    selection?.removeAllRanges();
    span.remove();
  }
}
