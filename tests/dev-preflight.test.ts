import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { checkPortAvailable, parsePort } from "../scripts/dev-preflight.js";

const servers: net.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("development preflight", () => {
  it("accepts an available port", async () => {
    const probe = net.createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const address = probe.address();
    if (!address || typeof address === "string") throw new Error("expected TCP address");
    const port = address.port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    await expect(checkPortAvailable(port)).resolves.toBeUndefined();
  });

  it("rejects a port that already has a listener", async () => {
    const server = net.createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP address");

    await expect(checkPortAvailable(address.port)).rejects.toThrow(`port ${address.port} is already in use`);
  });

  it("rejects malformed and out-of-range ports", () => {
    expect(() => parsePort("3000x")).toThrow("invalid port");
    expect(() => parsePort("0")).toThrow("invalid port");
    expect(() => parsePort("65536")).toThrow("invalid port");
  });
});
