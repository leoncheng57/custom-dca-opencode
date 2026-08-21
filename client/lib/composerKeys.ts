// Enter-to-send policy for the composer, kept pure so every branch is unit
// testable. The coarse-pointer branch in particular cannot be exercised in the
// e2e suite: Playwright launches Chromium with a browser-level
// `--blink-settings=primaryPointerType=fine`, so per-context touch emulation
// does not move the `(pointer: coarse)` media query.

export interface ComposerKeyPress {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  /** True while an IME is composing a candidate. */
  isComposing: boolean;
  /** Safari reports composition as keyCode 229 rather than `isComposing`. */
  keyCode: number;
}

/**
 * Enter submits on a fine pointer; on a coarse one it stays a newline, because
 * Enter is the key users reach for on a soft keyboard. Cmd/Ctrl+Enter submits
 * anywhere. Shift+Enter is always a newline.
 *
 * Returns whether the key press should submit and whether the browser default
 * (inserting a newline) must be suppressed. Those differ for an empty draft:
 * Enter is swallowed rather than silently adding a blank line the user did not
 * ask for.
 */
export function composerEnterAction(
  press: ComposerKeyPress,
  options: { coarsePointer: boolean; canSubmit: boolean },
): { submit: boolean; preventDefault: boolean } {
  const inert = { submit: false, preventDefault: false };
  if (press.key !== "Enter" || press.shiftKey) return inert;
  if (press.isComposing || press.keyCode === 229) return inert;

  const submitModifier = press.metaKey || press.ctrlKey;
  if (!submitModifier && options.coarsePointer) return inert;

  return { submit: options.canSubmit, preventDefault: true };
}
