import { once } from "node:events";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EventBus } from "../server/opencode/events.js";
import { sessionRoutes } from "../server/routes/sessions.js";

const nativeFetch = globalThis.fetch;
const previousProjectsDirectory = process.env.PROJECTS_DIR;
let directory = "";

beforeEach(async () => {
  directory = await realpath(process.cwd());
  process.env.PROJECTS_DIR = path.dirname(directory);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousProjectsDirectory === undefined) delete process.env.PROJECTS_DIR;
  else process.env.PROJECTS_DIR = previousProjectsDirectory;
});

async function withRoutes(
  upstream: (url: URL) => Response | Promise<Response>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    return url.hostname === "opencode.test" ? upstream(url) : nativeFetch(input, init);
  }));
  const app = express();
  app.use("/api", sessionRoutes(
    { baseUrl: "http://opencode.test" },
    {} as EventBus,
  ));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("session turn diff route", () => {
  it("requires messageID and does not call upstream for invalid input", async () => {
    const upstream = vi.fn(async () => Response.json({}));
    await withRoutes(upstream, async (baseUrl) => {
      const response = await nativeFetch(
        `${baseUrl}/api/sessions/ses_1/diff?directory=${encodeURIComponent(directory)}`,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "messageID must be a non-empty string of at most 512 characters",
      });
      expect(upstream).not.toHaveBeenCalled();
    });
  });

  it("verifies session ownership before requesting the diff", async () => {
    const requested: string[] = [];
    await withRoutes(async (url) => {
      requested.push(url.pathname);
      if (url.pathname === "/session/status") return Response.json({});
      if (url.pathname === "/session/ses_1") return Response.json({ id: "ses_1", directory: `${directory}-other` });
      return Response.json([], { status: 500 });
    }, async (baseUrl) => {
      const response = await nativeFetch(
        `${baseUrl}/api/sessions/ses_1/diff?directory=${encodeURIComponent(directory)}&messageID=msg_1`,
      );
      expect(response.status).toBe(404);
      expect(requested).not.toContain("/session/ses_1/diff");
    });
  });
});
