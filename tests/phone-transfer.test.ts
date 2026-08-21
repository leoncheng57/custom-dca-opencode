import { describe, expect, it } from "vitest";

import { selectPhoneUrl } from "../client/lib/phoneTransfer.js";
import { parsePublicAppUrl } from "../server/publicAppUrl.js";

describe("phone transfer URL", () => {
  it("normalizes a configured HTTP(S) origin", () => {
    expect(parsePublicAppUrl(" https://ide.example.test:8443/ ")).toBe("https://ide.example.test:8443");
    expect(parsePublicAppUrl("http://100.64.0.1")).toBe("http://100.64.0.1");
  });

  it("falls back to the current browser origin when unset", () => {
    expect(parsePublicAppUrl("  ")).toBeNull();
    expect(selectPhoneUrl(null, "http://localhost:5173/path")).toBe("http://localhost:5173");
  });

  it.each([
    "ftp://ide.example.test",
    "https://user:secret@ide.example.test",
    "https://ide.example.test/app",
    "https://ide.example.test/?token=secret",
    "https://ide.example.test/#session",
    "not a url",
  ])("rejects non-origin value %s", (value) => {
    expect(() => parsePublicAppUrl(value)).toThrow(/PUBLIC_APP_URL/);
  });

  it("prefers the configured public origin", () => {
    expect(selectPhoneUrl("https://ide.example.test", "http://localhost:3410")).toBe("https://ide.example.test");
  });
});
