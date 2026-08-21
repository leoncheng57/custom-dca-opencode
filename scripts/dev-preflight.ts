import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid port: ${value}`);
  }
  return port;
}

export function checkPortAvailable(port: number, host = "0.0.0.0"): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`port ${port} is already in use on ${host}`));
        return;
      }
      reject(error);
    });
    server.listen(port, host, () => server.close(() => resolve()));
  });
}

async function main(): Promise<void> {
  const port = parsePort(process.argv[2] ?? "3000");
  try {
    await checkPortAvailable(port);
  } catch (error) {
    console.error(`Dev preflight failed: ${error instanceof Error ? error.message : String(error)}.`);
    console.error("Stop the existing listener or choose another PORT in .env.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  void main();
}
