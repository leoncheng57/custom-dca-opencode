// Boundary tests for the live session browser (issue #229).
//
// Per CONTRIBUTING.md, security-sensitive surfaces need explicit boundary
// tests. The SSRF policy is the load-bearing control: without it the managed
// Chromium can reach the unauthenticated OpenCode server on 127.0.0.1:4096,
// the LAN, and cloud metadata. These tests pin the refusal set.

import { describe, expect, it } from "vitest";

import {
  assessTarget,
  isBlockedHostname,
  isPrivateAddress,
  parseLiveBrowserConfig,
  resetPolicyCache,
} from "../server/browser/policy.js";
import { validSessionID } from "../server/browser/errors.js";

describe("parseLiveBrowserConfig", () => {
  it("is disabled by default with a cap of 10 and a 30 minute reaper", () => {
    const config = parseLiveBrowserConfig({} as NodeJS.ProcessEnv);
    expect(config.enabled).toBe(false);
    expect(config.maxPages).toBe(10);
    expect(config.idleMinutes).toBe(30);
    expect(config.executablePath).toBeUndefined();
  });

  it("enables only on the literal string true and clamps the cap", () => {
    expect(parseLiveBrowserConfig({ LIVE_BROWSER_ENABLED: "1" } as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(parseLiveBrowserConfig({ LIVE_BROWSER_ENABLED: "true" } as NodeJS.ProcessEnv).enabled).toBe(true);
    expect(parseLiveBrowserConfig({ BROWSER_MAX_PAGES: "0" } as NodeJS.ProcessEnv).maxPages).toBe(1);
    expect(parseLiveBrowserConfig({ BROWSER_MAX_PAGES: "9999" } as NodeJS.ProcessEnv).maxPages).toBe(32);
    expect(parseLiveBrowserConfig({ BROWSER_MAX_PAGES: "garbage" } as NodeJS.ProcessEnv).maxPages).toBe(10);
  });
});

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.255",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT (Tailscale range)
    "0.0.0.0",
    "255.255.255.255",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:192.168.0.10",
  ])("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "140.82.112.3", "172.15.0.1", "172.32.0.1", "100.63.0.1", "2606:4700::6810:84e5", "2a00:1450:4001::71"])(
    "allows public %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );

  it("fails closed on garbage", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});

describe("isBlockedHostname", () => {
  it.each(["localhost", "LOCALHOST", "foo.localhost", "printer.local", "service.internal", "127.0.0.1", "[::1]"])(
    "blocks %s without touching DNS",
    (hostname) => {
      expect(isBlockedHostname(hostname)).toBe(true);
    },
  );

  it("does not block ordinary public hostnames", () => {
    expect(isBlockedHostname("github.com")).toBe(false);
    expect(isBlockedHostname("example.com.")).toBe(false);
  });
});

describe("assessTarget", () => {
  it("refuses non-http(s) schemes outright", async () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "ftp://example.com/", "chrome://settings"]) {
      const verdict = await assessTarget(url);
      expect(verdict.ok).toBe(false);
    }
  });

  it("refuses credentials, empty hosts and unparseable URLs", async () => {
    expect((await assessTarget("https://user:pass@example.com/")).ok).toBe(false);
    expect((await assessTarget("not a url")).ok).toBe(false);
  });

  it("refuses loopback and private IP literals before DNS", async () => {
    resetPolicyCache();
    for (const url of [
      "http://127.0.0.1:4096/", // the unauthenticated OpenCode server
      "http://localhost:3000/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]:4096/",
    ]) {
      const verdict = await assessTarget(url);
      expect(verdict.ok).toBe(false);
    }
  });

  it("refuses hostnames that do not resolve, failing closed", async () => {
    resetPolicyCache();
    const verdict = await assessTarget("https://this-host-does-not-exist.invalid/");
    expect(verdict.ok).toBe(false);
  });
});

describe("validSessionID", () => {
  it("accepts OpenCode session ids and refuses path-shaped input", () => {
    expect(validSessionID("ses_abc123-XYZ")).toBe(true);
    expect(validSessionID("")).toBe(false);
    expect(validSessionID("../etc")).toBe(false);
    expect(validSessionID("a".repeat(129))).toBe(false);
    expect(validSessionID("a b")).toBe(false);
  });
});
