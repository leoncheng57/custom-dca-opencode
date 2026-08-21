// server/index.ts — BFF entrypoint.
//
// Responsibilities that justify a backend at all (the OpenCode server could
// otherwise be called straight from the browser):
//   - holds the OpenCode basic-auth credential
//   - fans one upstream SSE stream out to many browser clients
//   - threads ?directory= per project
//   - runs what the OpenCode API does not expose: git history, forge APIs,
//     notification transport
//
// Phase 0 ships the shell: config, health, static serving. Routes land in
// later phases (see AGENTS.md).

import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import dotenv from "dotenv";

import { readOpencodeConfig, checkHealth, EXPECTED_SERVER_VERSION } from "./opencode/client.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const opencode = readOpencodeConfig();

app.use(express.json({ limit: "20mb" }));

/**
 * Liveness for this BFF plus reachability of the OpenCode server behind it.
 * Deliberately reports upstream version skew instead of hiding it — a
 * mismatch is the first thing to suspect when a response shape looks wrong.
 */
app.get("/api/health", async (_req, res) => {
  try {
    const upstream = await checkHealth(opencode);
    res.json({
      healthy: true,
      upstream: {
        url: opencode.baseUrl,
        reachable: upstream.healthy,
        version: upstream.version,
        expected: EXPECTED_SERVER_VERSION,
        versionMatches: upstream.versionMatches,
      },
    });
  } catch (error) {
    res.status(503).json({
      healthy: false,
      upstream: {
        url: opencode.baseUrl,
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

// Static SPA (built UI). dist/server/index.js -> ../client
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "../client");
app.use(express.static(clientDir));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  // 0.0.0.0 so the app is reachable over the tailnet from a phone.
  console.log(`[bff] listening on :${PORT} -> opencode ${opencode.baseUrl}`);
});
