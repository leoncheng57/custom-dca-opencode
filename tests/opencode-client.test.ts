import { describe, expect, it } from "vitest";

import {
  basicAuthHeader,
  eventStreamUrl,
  readOpencodeConfig,
  EXPECTED_SERVER_VERSION,
} from "../server/opencode/client.js";

describe("readOpencodeConfig", () => {
  it("defaults to loopback when OPENCODE_URL is unset", () => {
    const config = readOpencodeConfig({} as NodeJS.ProcessEnv);
    expect(config.baseUrl).toBe("http://127.0.0.1:4096");
    expect(config.password).toBeUndefined();
  });

  it("strips trailing slashes so URL joins do not double up", () => {
    const config = readOpencodeConfig({
      OPENCODE_URL: "http://100.78.52.59:4096///",
    } as NodeJS.ProcessEnv);
    expect(config.baseUrl).toBe("http://100.78.52.59:4096");
  });

  it("treats an empty password as unsecured rather than as an empty credential", () => {
    const config = readOpencodeConfig({ OPENCODE_SERVER_PASSWORD: "" } as NodeJS.ProcessEnv);
    expect(config.password).toBeUndefined();
    expect(basicAuthHeader(config)).toBeUndefined();
  });
});

describe("basicAuthHeader", () => {
  it("is undefined on an unsecured server", () => {
    expect(basicAuthHeader({ baseUrl: "http://x" })).toBeUndefined();
  });

  it("defaults the username to 'opencode', matching the server default", () => {
    const header = basicAuthHeader({ baseUrl: "http://x", password: "s3cret" });
    expect(header).toBe(`Basic ${Buffer.from("opencode:s3cret").toString("base64")}`);
  });

  it("honours an explicit username", () => {
    const header = basicAuthHeader({ baseUrl: "http://x", username: "leon", password: "s3cret" });
    expect(header).toBe(`Basic ${Buffer.from("leon:s3cret").toString("base64")}`);
  });
});

describe("eventStreamUrl", () => {
  // Regression guard: /event is directory-scoped, so subscribing to it in a
  // multi-project UI silently drops every other project's events.
  it("uses the cross-project /global/event bus, never /event", () => {
    const url = eventStreamUrl({ baseUrl: "http://127.0.0.1:4096" });
    expect(new URL(url).pathname).toBe("/global/event");
  });

  it("omits auth_token when the server is unsecured", () => {
    const url = new URL(eventStreamUrl({ baseUrl: "http://127.0.0.1:4096" }));
    expect(url.searchParams.get("auth_token")).toBeNull();
  });

  // EventSource cannot set headers, so credentials ride as a query param.
  it("carries base64 credentials as auth_token when secured", () => {
    const url = new URL(
      eventStreamUrl({ baseUrl: "http://127.0.0.1:4096", password: "s3cret" }),
    );
    const token = url.searchParams.get("auth_token");
    expect(token).not.toBeNull();
    expect(Buffer.from(token!, "base64").toString("utf8")).toBe("opencode:s3cret");
  });
});

describe("version pin", () => {
  it("matches the server this client was generated against", () => {
    // Bump deliberately after re-auditing the live GET /doc contract.
    expect(EXPECTED_SERVER_VERSION).toBe("1.18.22");
  });
});
