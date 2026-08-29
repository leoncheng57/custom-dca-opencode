import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import { getDeploymentSnapshot, resetDeploymentCache } from "../server/deployment.js";
import type { OpencodeConfig } from "../server/opencode/client.js";

const servers: Array<ReturnType<ReturnType<typeof express>["listen"]>> = [];
afterEach(async () => {
  resetDeploymentCache();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const config = { baseUrl: "http://127.0.0.1:1", headers: {} } as unknown as OpencodeConfig;

/**
 * Stand up a server that answers the two asset probes however the case needs,
 * so the verdict logic can be exercised without a real build on disk.
 */
async function serveAssets(handler: (assetPath: string, res: express.Response) => void): Promise<number> {
  const app = express();
  app.get("/sw.js", (_req, res) => handler("/sw.js", res));
  app.get("/manifest.webmanifest", (_req, res) => handler("/manifest.webmanifest", res));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return (server.address() as AddressInfo).port;
}

describe("served-asset verdict", () => {
  it("reports not-built when the checkout has no compiled bundle", async () => {
    // The suite runs from source, so `dist/` is not on the module path and the
    // bundle can never be the one being served.
    const port = await serveAssets((_path, res) => {
      res.type("html").send("<!doctype html><html></html>");
    });

    const snapshot = await getDeploymentSnapshot({ config, port, directories: [] });
    expect(snapshot.assetsVerdict).toBe("not-built");
    expect(snapshot.assetsNote).toMatch(/development/iu);
    expect(snapshot.assets.every((asset) => !asset.ok)).toBe(true);
  });

  it("flags a wrong content type as a failed asset with an actionable problem", async () => {
    const port = await serveAssets((_path, res) => {
      res.type("html").send("<!doctype html><html></html>");
    });

    const snapshot = await getDeploymentSnapshot({ config, port, directories: [] });
    const worker = snapshot.assets.find((asset) => asset.path === "/sw.js");
    expect(worker?.ok).toBe(false);
    expect(worker?.status).toBe(200);
    expect(worker?.contentType).toMatch(/text\/html/u);
    // The incident signature: a 200 that is nonetheless wrong.
    expect(worker?.problem).toMatch(/rather than JavaScript/u);
    expect(worker?.problem).toMatch(/dist\/client/u);
  });

  it("accepts correctly served assets", async () => {
    const port = await serveAssets((assetPath, res) => {
      if (assetPath === "/sw.js") res.type("text/javascript").send("self.addEventListener('push', () => {});");
      else res.type("application/manifest+json").send(JSON.stringify({ name: "DCA" }));
    });

    const snapshot = await getDeploymentSnapshot({ config, port, directories: [] });
    expect(snapshot.assets.every((asset) => asset.ok)).toBe(true);
    expect(snapshot.assetsVerdict).toBe("ok");
  });

  it("degrades to a failed asset rather than throwing when nothing is listening", async () => {
    // Port 1 is not bound; the probe must fail closed.
    const snapshot = await getDeploymentSnapshot({ config, port: 1, directories: [] });
    expect(snapshot.assets.every((asset) => !asset.ok)).toBe(true);
    expect(snapshot.assets[0].status).toBeNull();
    expect(snapshot.assets[0].problem).toBeTruthy();
  });
});

describe("service restart cost", () => {
  it("labels the BFF safe and OpenCode destructive", async () => {
    const port = await serveAssets((_path, res) => res.status(404).end());
    const snapshot = await getDeploymentSnapshot({ config, port, directories: [] });

    const bff = snapshot.services.find((service) => service.role === "bff");
    const opencode = snapshot.services.find((service) => service.role === "opencode");
    expect(bff?.restartCost).toBe("safe");
    expect(bff?.restartNote).toMatch(/agent turns are unaffected/iu);
    expect(opencode?.restartCost).toBe("destructive");
    expect(opencode?.restartNote).toMatch(/nothing resumes automatically/iu);
  });

  it("never invents a busy count without directories to check", async () => {
    const port = await serveAssets((_path, res) => res.status(404).end());
    const snapshot = await getDeploymentSnapshot({ config, port, directories: [] });
    expect(snapshot.busySessions.count).toBeNull();
    expect(snapshot.busySessions.directoriesChecked).toBe(0);
  });
});

describe("caching", () => {
  it("coalesces repeat reads until refresh is requested", async () => {
    let probes = 0;
    const port = await serveAssets((_path, res) => {
      probes += 1;
      res.status(404).end();
    });

    await getDeploymentSnapshot({ config, port, directories: [] });
    const afterFirst = probes;
    await getDeploymentSnapshot({ config, port, directories: [] });
    expect(probes).toBe(afterFirst);

    await getDeploymentSnapshot({ config, port, directories: [], refresh: true });
    expect(probes).toBeGreaterThan(afterFirst);
  });
});
