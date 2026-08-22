import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { OpencodeConfig } from "../server/opencode/client.js";
import { listSessionsAcross, RECENT_FANOUT_CONCURRENCY } from "../server/opencode/sessions.js";
import { recentSessionContext, resolveRecentDirectories } from "../server/routes/recents.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

interface UpstreamOptions {
  sessions: Record<string, Array<{ id: string; updated: number }>>;
  failing?: Set<string>;
}

async function upstream(options: UpstreamOptions): Promise<{ config: OpencodeConfig; peak: () => number }> {
  let inFlight = 0;
  let peak = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const directory = url.searchParams.get("directory") ?? "";

    if (url.pathname === "/session/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({}));
      return;
    }
    if (url.pathname !== "/session") {
      res.writeHead(404).end();
      return;
    }
    if (options.failing?.has(directory)) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "boom" }));
      return;
    }

    inFlight += 1;
    peak = Math.max(peak, inFlight);
    // Hold the response briefly so overlapping requests are observable.
    setTimeout(() => {
      inFlight -= 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(
        (options.sessions[directory] ?? []).map(({ id, updated }) => ({
          id,
          title: id,
          directory,
          time: { created: updated, updated },
        })),
      ));
    }, 15);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { config: { baseUrl: `http://127.0.0.1:${port}` }, peak: () => peak };
}

describe("cross-project session fan-out", () => {
  it("merges projects newest first and keeps directory order on ties", async () => {
    const { config } = await upstream({
      sessions: {
        "/a": [{ id: "a-old", updated: 1_000 }, { id: "a-tie", updated: 5_000 }],
        "/b": [{ id: "b-new", updated: 9_000 }, { id: "b-tie", updated: 5_000 }],
      },
    });
    const merged = await listSessionsAcross(config, ["/a", "/b"]);
    expect(merged.map(({ id }) => id)).toEqual(["b-new", "a-tie", "b-tie", "a-old"]);
    expect(merged.map(({ directory }) => directory)).toEqual(["/b", "/a", "/b", "/a"]);
  });

  it("keeps working when a project fails", async () => {
    const { config } = await upstream({
      sessions: { "/ok": [{ id: "survivor", updated: 1_000 }] },
      failing: new Set(["/broken"]),
    });
    // One renamed or unreadable project must not blank a panel that is mostly
    // about other projects.
    expect((await listSessionsAcross(config, ["/broken", "/ok"])).map(({ id }) => id))
      .toEqual(["survivor"]);
  });

  it("deduplicates directories and caps concurrency", async () => {
    const directories = Array.from({ length: 20 }, (_, index) => `/p${index}`);
    const sessions = Object.fromEntries(
      directories.map((directory, index) => [directory, [{ id: `s${index}`, updated: index }]]),
    );
    const { config, peak } = await upstream({ sessions });

    const merged = await listSessionsAcross(config, [...directories, ...directories]);
    expect(merged).toHaveLength(directories.length);
    expect(peak()).toBeLessThanOrEqual(RECENT_FANOUT_CONCURRENCY);
  });

  it("returns nothing for an empty directory set", async () => {
    const { config } = await upstream({ sessions: {} });
    expect(await listSessionsAcross(config, [])).toEqual([]);
  });
});

describe("recent directory resolution", () => {
  it("drops unusable paths, dedupes, and puts client history before pins", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-recents-"));
    const projectsRoot = await mkdtemp(path.join(os.tmpdir(), "dca-recents-root-"));
    process.env.PROJECTS_DIR = projectsRoot;
    const history = path.join(projectsRoot, "history");
    const pinned = path.join(projectsRoot, "pinned");
    await mkdir(history);
    await mkdir(pinned);

    const resolved = await resolveRecentDirectories(
      // A path outside PROJECTS_DIR, a deleted project and a duplicate all
      // arrive routinely from localStorage that outlived the filesystem.
      [root, path.join(projectsRoot, "deleted"), history, history, "relative/path"],
      [pinned, history],
    );
    expect(resolved).toEqual([await realpathOf(history), await realpathOf(pinned)]);
    delete process.env.PROJECTS_DIR;
  });

  it("bounds the fanned-out directory count", async () => {
    const projectsRoot = await mkdtemp(path.join(os.tmpdir(), "dca-recents-cap-"));
    process.env.PROJECTS_DIR = projectsRoot;
    const directories: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const directory = path.join(projectsRoot, `p${index}`);
      await mkdir(directory);
      directories.push(directory);
    }
    expect(await resolveRecentDirectories(directories, [], 2)).toHaveLength(2);
    delete process.env.PROJECTS_DIR;
  });
});

describe("recent session context", () => {
  it("retains ancestors, descendants, and siblings around limited matches", () => {
    const pool = [
      { id: "grandchild", directory: "/repo", parentID: "child" },
      { id: "other", directory: "/repo" },
      { id: "root", directory: "/repo" },
      { id: "child", directory: "/repo", parentID: "root" },
      { id: "sibling", directory: "/repo", parentID: "root" },
    ];
    expect(recentSessionContext(pool, [pool[0]]).map(({ id }) => id)).toEqual([
      "grandchild",
      "root",
      "child",
      "sibling",
    ]);
  });

  it("does not cross project boundaries or duplicate corrupt cycles", () => {
    const pool = [
      { id: "root", directory: "/one" },
      { id: "child", directory: "/one", parentID: "root" },
      { id: "root", directory: "/two" },
      { id: "a", directory: "/cycle", parentID: "b" },
      { id: "b", directory: "/cycle", parentID: "a" },
    ];
    expect(recentSessionContext(pool, [pool[1], pool[3]]).map(({ directory, id }) => `${directory}:${id}`)).toEqual([
      "/one:root",
      "/one:child",
      "/cycle:a",
      "/cycle:b",
    ]);
  });
});

async function realpathOf(value: string): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return realpath(value);
}
