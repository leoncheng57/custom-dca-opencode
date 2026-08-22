import { describe, expect, it } from "vitest";

import {
  isAllowedPtyOrigin,
  parsePtyAllowedOrigins,
  parsePtyMode,
  ptyAllowsCreate,
  ptyAllowsInput,
  ptyAllowsKill,
  ptyAllowsUpdate,
  ptyOriginAllowlist,
  PtyConfigError,
} from "../server/ptyPolicy.js";

describe("PTY_ENABLED parsing", () => {
  it("defaults to off when unset or empty", () => {
    expect(parsePtyMode(undefined)).toBe("off");
    expect(parsePtyMode("")).toBe("off");
    expect(parsePtyMode("   ")).toBe("off");
  });

  it.each(["0", "false", "off", "no", "OFF"])("treats %s as off", (value) => {
    expect(parsePtyMode(value)).toBe("off");
  });

  it("resolves the obvious truthy spellings to read-only, never interactive", () => {
    // The dangerous mode must be asked for by name. Someone setting PTY_ENABLED=1
    // from memory should get the surface that cannot execute anything.
    for (const value of ["1", "true", "yes", "read-only", "readonly", "READ-ONLY"]) {
      expect(parsePtyMode(value)).toBe("read-only");
    }
  });

  it("only spells interactive one way", () => {
    expect(parsePtyMode("interactive")).toBe("interactive");
    expect(parsePtyMode(" Interactive ")).toBe("interactive");
  });

  it("throws on an unrecognised value instead of silently choosing a mode", () => {
    // Degrading would look like a UI bug; upgrading would be a breach.
    expect(() => parsePtyMode("intractive")).toThrow(PtyConfigError);
    expect(() => parsePtyMode("rw")).toThrow(/off, read-only, interactive/);
  });
});

describe("what each mode permits", () => {
  it("only interactive may execute", () => {
    expect(ptyAllowsCreate("interactive")).toBe(true);
    expect(ptyAllowsInput("interactive")).toBe(true);
    expect(ptyAllowsCreate("read-only")).toBe(false);
    expect(ptyAllowsInput("read-only")).toBe(false);
    expect(ptyAllowsCreate("off")).toBe(false);
    expect(ptyAllowsInput("off")).toBe(false);
  });

  it("lets read-only kill, because cancelling is the point of the read-only surface", () => {
    expect(ptyAllowsKill("read-only")).toBe(true);
    expect(ptyAllowsKill("interactive")).toBe(true);
    expect(ptyAllowsKill("off")).toBe(false);
  });

  it("refuses resize and retitle in read-only: both mutate state other viewers see", () => {
    expect(ptyAllowsUpdate("read-only")).toBe(false);
    expect(ptyAllowsUpdate("interactive")).toBe(true);
  });
});

describe("PTY_ALLOWED_ORIGINS parsing", () => {
  it("normalises and dedupes bare origins", () => {
    expect(parsePtyAllowedOrigins("https://a.test, https://b.test ,https://a.test")).toEqual([
      "https://a.test",
      "https://b.test",
    ]);
  });

  it("returns nothing for an unset value", () => {
    expect(parsePtyAllowedOrigins(undefined)).toEqual([]);
    expect(parsePtyAllowedOrigins("")).toEqual([]);
  });

  it.each([
    "https://a.test/path",
    "https://user:pw@a.test",
    "https://a.test/?x=1",
    "https://a.test/#f",
    "ftp://a.test",
    "not a url",
  ])("rejects %s", (value) => {
    expect(() => parsePtyAllowedOrigins(value)).toThrow(PtyConfigError);
  });
});

describe("origin allowlist construction", () => {
  it("anchors on PUBLIC_APP_URL and the ports this app actually serves", () => {
    const allowlist = ptyOriginAllowlist({
      publicAppUrl: "https://ide.example.ts.net",
      extra: ["https://extra.test"],
      loopbackPorts: [3000, 5173],
    });
    expect(allowlist).toContain("https://ide.example.ts.net");
    expect(allowlist).toContain("https://extra.test");
    expect(allowlist).toContain("http://localhost:3000");
    expect(allowlist).toContain("http://127.0.0.1:5173");
    expect(allowlist).toContain("http://[::1]:3000");
  });

  it("skips nonsense ports rather than emitting a broken origin", () => {
    const allowlist = ptyOriginAllowlist({ publicAppUrl: null, loopbackPorts: [0, -1, 70_000, Number.NaN] });
    expect(allowlist).toEqual([]);
  });
});

describe("WebSocket handshake origin check", () => {
  const allowlist = ptyOriginAllowlist({
    publicAppUrl: "https://ide.example.ts.net",
    loopbackPorts: [3000],
  });

  it("accepts the app's own declared origin", () => {
    expect(isAllowedPtyOrigin("https://ide.example.ts.net", allowlist)).toBe(true);
    expect(isAllowedPtyOrigin("http://localhost:3000", allowlist)).toBe(true);
  });

  it("rejects an absent Origin, so the check cannot be opted out of", () => {
    // Browsers always send Origin on a WS handshake. A non-browser client that
    // means to connect can set it; silence is not consent.
    expect(isAllowedPtyOrigin(undefined, allowlist)).toBe(false);
    expect(isAllowedPtyOrigin("", allowlist)).toBe(false);
  });

  it("rejects the literal 'null' origin used by sandboxed frames", () => {
    expect(isAllowedPtyOrigin("null", allowlist)).toBe(false);
  });

  it("rejects any other site — this is the whole point, since WS ignores CORS", () => {
    expect(isAllowedPtyOrigin("https://evil.example", allowlist)).toBe(false);
    expect(isAllowedPtyOrigin("http://ide.example.ts.net", allowlist)).toBe(false);
    expect(isAllowedPtyOrigin("https://ide.example.ts.net.evil.example", allowlist)).toBe(false);
  });

  it("rejects loopback on a port this app does not serve", () => {
    // A dev server rendering a third-party frontend is attacker-influenced
    // content served from localhost. "It's localhost" is not a trust boundary.
    expect(isAllowedPtyOrigin("http://localhost:8080", allowlist)).toBe(false);
    expect(isAllowedPtyOrigin("http://127.0.0.1:9999", allowlist)).toBe(false);
  });

  it("compares canonical origins so a default port cannot smuggle a mismatch", () => {
    const withPort = ptyOriginAllowlist({ publicAppUrl: "https://ide.example.ts.net" });
    expect(isAllowedPtyOrigin("https://ide.example.ts.net:443", withPort)).toBe(true);
    expect(isAllowedPtyOrigin("https://ide.example.ts.net:8443", withPort)).toBe(false);
  });

  it("rejects non-HTTP schemes", () => {
    expect(isAllowedPtyOrigin("file://", allowlist)).toBe(false);
    expect(isAllowedPtyOrigin("chrome-extension://abcdef", allowlist)).toBe(false);
  });
});
