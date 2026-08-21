import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("port probe did not bind a TCP port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function runPreflight(password?: string): Promise<{ authorization?: string; stdout: string; stderr: string }> {
  let authorization: string | undefined;
  const server = createServer((req, res) => {
    authorization = req.headers.authorization;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ healthy: true, version: "1.18.21" }));
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock health server did not bind a TCP port");

  const env = { ...process.env };
  delete env.OPENCODE_SERVER_PASSWORD;
  delete env.OPENCODE_SERVER_USERNAME;
  Object.assign(env, {
    BASH_COMPAT: "32",
    DEV_HEALTHCHECK_ONLY: "1",
    OPENCODE_URL: `http://127.0.0.1:${address.port}`,
    PORT: String(await availablePort()),
    ...(password ? { OPENCODE_SERVER_PASSWORD: password, OPENCODE_SERVER_USERNAME: "tester" } : {}),
  });

  const child = spawn("/bin/bash", ["scripts/dev.sh"], { cwd: root, env });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "close") as [number | null];
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  return { authorization, stdout, stderr };
}

describe("scripts/dev.sh health preflight", () => {
  it("works without an auth argument under Bash 3.2 compatibility", async () => {
    const result = await runPreflight();
    expect(result.authorization).toBeUndefined();
    expect(result.stdout).toContain('"version":"1.18.21"');
  });

  it("passes Basic auth when a password is configured", async () => {
    const result = await runPreflight("s3cret");
    expect(result.authorization).toBe(`Basic ${Buffer.from("tester:s3cret").toString("base64")}`);
  });
});
