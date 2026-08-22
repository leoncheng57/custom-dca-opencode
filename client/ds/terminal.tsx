// client/ds/terminal.tsx — xterm.js wrapped as a design-system primitive.
//
// The VT emulator itself is not something to hand-roll (control sequences,
// wide characters, mouse reporting, reflow), so @xterm/xterm carries that. What
// this file owns is everything around it:
//
//   - theme colours read from the app's semantic tokens rather than xterm's
//     defaults, so the terminal follows light/dark with everything else
//   - a `readOnly` mode that disables the caret and drops keystrokes, matching
//     the server's read-only mode instead of merely looking disabled
//   - fit-on-resize, reported upward so the caller can tell the server
//
// It is deliberately transport-agnostic: it takes `onData` and exposes a
// `write` handle. The WebSocket lives in the page, not in here, so this
// primitive can be tested and reused without one.

import * as React from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { cn } from "./utils.js";

export interface TerminalHandle {
  /** Append raw terminal output. */
  write: (data: string) => void;
  /** Print a BFF-authored line, visually distinct from process output. */
  notice: (message: string) => void;
  clear: () => void;
  focus: () => void;
  /** Current geometry, for reporting a resize to the server. */
  size: () => { rows: number; cols: number };
}

export interface TerminalProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onResize"> {
  /** Keystrokes. Never called when readOnly. */
  onData?: (data: string) => void;
  /** Fired after a fit changes the geometry. */
  onResize?: (size: { rows: number; cols: number }) => void;
  readOnly?: boolean;
}

/**
 * Read from the live CSS custom properties rather than duplicating hex values,
 * so this honours the theme switch and the "never raw hex" rule at the same
 * time. Falls back only if a token is somehow missing.
 */
function themeFromTokens(element: HTMLElement): Record<string, string> {
  const styles = getComputedStyle(element);
  const token = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback;
  const background = token("--color-background-surface-neutral-muted", "#22252c");
  const foreground = token("--color-text-default", "#e5e7eb");
  return {
    background,
    foreground,
    cursor: token("--color-text-info", "#60a5fa"),
    cursorAccent: background,
    selectionBackground: token("--color-background-surface-info-muted", "#1e3a5f"),
  };
}

const Terminal = React.forwardRef<TerminalHandle, TerminalProps>(
  ({ className, onData, onResize, readOnly = false, ...props }, ref) => {
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    const termRef = React.useRef<XTerm | null>(null);
    const fitRef = React.useRef<FitAddon | null>(null);
    // Held in refs so the effect below can stay mount-only: recreating the
    // emulator on every render would wipe the scrollback.
    const onDataRef = React.useRef(onData);
    const onResizeRef = React.useRef(onResize);
    const readOnlyRef = React.useRef(readOnly);
    onDataRef.current = onData;
    onResizeRef.current = onResize;
    readOnlyRef.current = readOnly;

    React.useImperativeHandle(
      ref,
      (): TerminalHandle => ({
        write: (data) => termRef.current?.write(data),
        notice: (message) => termRef.current?.writeln(`\r\n\u001b[2m— ${message}\u001b[0m`),
        clear: () => termRef.current?.clear(),
        focus: () => termRef.current?.focus(),
        size: () => ({ rows: termRef.current?.rows ?? 24, cols: termRef.current?.cols ?? 80 }),
      }),
      [],
    );

    React.useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const term = new XTerm({
        convertEol: false,
        cursorBlink: !readOnlyRef.current,
        disableStdin: readOnlyRef.current,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: 13,
        scrollback: 5_000,
        theme: themeFromTokens(host),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      termRef.current = term;
      fitRef.current = fit;

      const disposable = term.onData((data) => {
        // Belt and braces: disableStdin already blocks this, but a read-only
        // terminal must never emit input even if that option regresses.
        if (readOnlyRef.current) return;
        onDataRef.current?.(data);
      });

      const applyFit = (): void => {
        try {
          fit.fit();
        } catch {
          // fit() throws while the host is display:none or zero-sized, which
          // happens routinely during layout; the next observation retries.
          return;
        }
        onResizeRef.current?.({ rows: term.rows, cols: term.cols });
      };
      applyFit();

      const observer = new ResizeObserver(applyFit);
      observer.observe(host);

      return () => {
        observer.disconnect();
        disposable.dispose();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
    }, []);

    // Theme changes swap the token values on :root; re-read them rather than
    // rebuilding the emulator.
    React.useEffect(() => {
      const host = hostRef.current;
      const term = termRef.current;
      if (!host || !term) return;
      const update = (): void => {
        term.options.theme = themeFromTokens(host);
      };
      const observer = new MutationObserver(update);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    }, []);

    React.useEffect(() => {
      const term = termRef.current;
      if (!term) return;
      term.options.disableStdin = readOnly;
      term.options.cursorBlink = !readOnly;
    }, [readOnly]);

    return (
      <div
        ref={hostRef}
        className={cn(
          "h-full w-full overflow-hidden rounded-[var(--border-radius-8)] border border-[var(--color-border-default)]",
          "bg-[var(--color-background-surface-neutral-muted)] p-2",
          className,
        )}
        {...props}
      />
    );
  },
);
Terminal.displayName = "Terminal";

export { Terminal };
