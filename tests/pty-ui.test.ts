import { describe, expect, it } from "vitest";

import type { Pty, PtyCapabilities } from "../client/lib/api.js";
import {
  isPtyEvent,
  ptyInputAllowed,
  ptyInputBlockedReason,
  ptyLabel,
  ptyLocation,
  ptyStatusLabel,
} from "../client/lib/pty.js";

const running: Pty = {
  id: "pty_1",
  title: "shell",
  command: "/bin/zsh",
  args: ["-l"],
  cwd: "/tmp/project/packages/api",
  status: "running",
  pid: 4242,
};

const interactive: PtyCapabilities = {
  mode: "interactive",
  canCreate: true,
  canInput: true,
  canKill: true,
  canUpdate: true,
  shellPinned: false,
};

const readOnly: PtyCapabilities = {
  mode: "read-only",
  canCreate: false,
  canInput: false,
  canKill: true,
  canUpdate: false,
  shellPinned: false,
};

describe("pty event routing", () => {
  it("refreshes on any pty.* event, including ones we have not seen", () => {
    for (const type of ["pty.created", "pty.updated", "pty.exited", "pty.deleted", "pty.something-new"]) {
      expect(isPtyEvent(type)).toBe(true);
    }
  });

  it("ignores everything else, including the heartbeat absent from the typed union", () => {
    for (const type of ["session.idle", "server.heartbeat", "notification.recorded", undefined, 7]) {
      expect(isPtyEvent(type)).toBe(false);
    }
  });
});

describe("pty presentation", () => {
  it("falls back to the id when a terminal has no title", () => {
    expect(ptyLabel(running)).toBe("shell");
    expect(ptyLabel({ ...running, title: "   " })).toBe("pty_1");
  });

  it("shows a cwd relative to the project, and '.' at its root", () => {
    expect(ptyLocation(running, "/tmp/project")).toBe("packages/api");
    expect(ptyLocation({ ...running, cwd: "/tmp/project" }, "/tmp/project")).toBe(".");
    // A cwd that is not below the project is shown in full rather than mangled.
    expect(ptyLocation({ ...running, cwd: "/etc" }, "/tmp/project")).toBe("/etc");
  });

  it("reports status honestly, including a missing exit code", () => {
    expect(ptyStatusLabel(running)).toBe("running · pid 4242");
    expect(ptyStatusLabel({ ...running, status: "exited", exitCode: 1 })).toBe("exited (1)");
    expect(ptyStatusLabel({ ...running, status: "exited" })).toBe("exited");
  });
});

describe("when this browser may type", () => {
  it("allows input on a desktop against an interactive server", () => {
    expect(ptyInputAllowed(interactive, { compactViewport: false, pty: running })).toBe(true);
    expect(ptyInputBlockedReason(interactive, { compactViewport: false, pty: running })).toBeNull();
  });

  it("never allows input when the server is read-only", () => {
    expect(ptyInputAllowed(readOnly, { compactViewport: false, pty: running })).toBe(false);
    expect(ptyInputBlockedReason(readOnly, { compactViewport: false, pty: running })).toMatch(/read-only mode/);
  });

  it("is read-only on a phone even when the server permits input", () => {
    // Recorded decision: a soft keyboard cannot send Ctrl, Tab or arrows, so
    // "interactive" on a phone is a terminal you can break things in but not
    // work in.
    expect(ptyInputAllowed(interactive, { compactViewport: true, pty: running })).toBe(false);
    expect(ptyInputBlockedReason(interactive, { compactViewport: true, pty: running })).toMatch(/small screens/);
  });

  it("refuses input to an exited terminal", () => {
    const exited: Pty = { ...running, status: "exited", exitCode: 0 };
    expect(ptyInputAllowed(interactive, { compactViewport: false, pty: exited })).toBe(false);
    expect(ptyInputBlockedReason(interactive, { compactViewport: false, pty: exited })).toMatch(/exited/);
  });

  it("treats absent capabilities as the feature being off", () => {
    expect(ptyInputAllowed(null, { compactViewport: false, pty: running })).toBe(false);
    expect(ptyInputBlockedReason(null, { compactViewport: false, pty: running })).toMatch(/disabled/);
  });
});
