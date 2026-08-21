import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const url = new URL(process.env.OPENCODE_URL || "http://127.0.0.1:4096");
const hostname = url.hostname.replace(/^\[|\]$/g, "");
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "::1"].includes(hostname) ||
  url.username ||
  url.password ||
  (url.pathname !== "/" && url.pathname !== "") ||
  url.search ||
  url.hash
) {
  throw new Error("The supervised OpenCode server must use a loopback HTTP OPENCODE_URL");
}

const binary = process.env.OPENCODE_BIN || path.join(process.env.HOME, ".opencode", "bin", "opencode");
const child = spawn(binary, ["serve", "--hostname", hostname, "--port", url.port || "80"], {
  env: {
    ...process.env,
    OPENCODE_DISABLE_AUTOUPDATE: process.env.OPENCODE_DISABLE_AUTOUPDATE || "1",
    OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:
      process.env.OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS || "true",
    NO_PROXY: process.env.NO_PROXY || "localhost,127.0.0.1",
  },
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
