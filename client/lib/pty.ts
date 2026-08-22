// client/lib/pty.ts — pure helpers for the terminal page.
//
// Split out of the page so the branching that matters (which events force a
// refresh, what a PTY is called, when input is possible) is unit-testable in
// the node environment the rest of the suite uses.

import type { Pty, PtyCapabilities } from "./api.js";

/**
 * Upstream carries pty.created / pty.updated / pty.exited / pty.deleted on the
 * same bus as everything else. Match on the prefix rather than an allowlist:
 * a new pty.* event we have not heard of should still refresh the list, and
 * refreshing is harmless.
 */
export function isPtyEvent(type: unknown): boolean {
  return typeof type === "string" && type.startsWith("pty.");
}

export function ptyLabel(pty: Pty): string {
  return pty.title?.trim() || pty.id;
}

/** Shorten a cwd for a list row without hiding which project it is in. */
export function ptyLocation(pty: Pty, directory: string): string {
  if (!pty.cwd) return "";
  if (pty.cwd === directory) return ".";
  return pty.cwd.startsWith(`${directory}/`) ? pty.cwd.slice(directory.length + 1) : pty.cwd;
}

export function ptyStatusLabel(pty: Pty): string {
  if (pty.status === "running") return `running · pid ${pty.pid}`;
  return typeof pty.exitCode === "number" ? `exited (${pty.exitCode})` : "exited";
}

/**
 * Whether this browser may type into this terminal right now.
 *
 * Two independent gates, and both must hold:
 *   - the server permits input at all (PTY_ENABLED=interactive)
 *   - the viewport is not a phone
 *
 * The second is a product decision, recorded in AGENTS.md #16: an xterm.js
 * canvas driven by a soft keyboard has no arrow keys, no Ctrl, and no Tab, so
 * "interactive" on a phone means a terminal you can break something in but not
 * work in. Read-only is the honest phone experience, and it is the one #58
 * actually asked for.
 */
export function ptyInputAllowed(
  capabilities: PtyCapabilities | null,
  options: { compactViewport: boolean; pty: Pty | null },
): boolean {
  if (!capabilities?.canInput) return false;
  if (options.compactViewport) return false;
  return options.pty?.status === "running";
}

/** Why input is unavailable, in words a user can act on. Null when it is. */
export function ptyInputBlockedReason(
  capabilities: PtyCapabilities | null,
  options: { compactViewport: boolean; pty: Pty | null },
): string | null {
  if (!capabilities) return "Terminals are disabled on this server.";
  if (!capabilities.canInput) {
    return "This server runs terminals in read-only mode. Set PTY_ENABLED=interactive to type.";
  }
  if (options.compactViewport) {
    return "Read-only on small screens: a soft keyboard cannot send Ctrl, Tab or arrow keys.";
  }
  if (options.pty && options.pty.status !== "running") return "This terminal has exited.";
  return null;
}
