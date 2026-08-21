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
// All browser-facing API routes are registered here; feature modules own the
// upstream and filesystem details so this entrypoint remains auditable.

import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import dotenv from "dotenv";

import { readOpencodeConfig, checkHealth, EXPECTED_SERVER_VERSION } from "./opencode/client.js";
import { EventBus } from "./opencode/events.js";
import { AutoPermissionService } from "./opencode/autoPermissions.js";
import { sessionRoutes } from "./routes/sessions.js";
import { settingsRoutes } from "./routes/settings.js";
import { mcpRoutes } from "./routes/mcp.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { parseAllowedPorts, previewRoutes } from "./routes/preview.js";
import { worktreeRoutes } from "./routes/worktrees.js";
import { notificationRoutes } from "./routes/notifications.js";
import { PreferenceStore } from "./notifications/preferences.js";
import { HistoryStore } from "./notifications/history.js";
import { NotificationService } from "./notifications/service.js";
import { forgeRoutes } from "./routes/forge.js";
import { reminderRoutes } from "./routes/reminders.js";
import { appConfigRoutes } from "./routes/appConfig.js";
import { projectRoutes } from "./routes/projects.js";
import { recentRoutes } from "./routes/recents.js";
import { parsePublicAppUrl } from "./publicAppUrl.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const opencode = readOpencodeConfig();
const publicAppUrl = parsePublicAppUrl(process.env.PUBLIC_APP_URL);

app.use(express.json({ limit: "20mb" }));

// One upstream SSE subscription, fanned out to every browser client.
const bus = new EventBus(opencode);
bus.on("error", (error: unknown) => {
  console.warn("[bus]", error instanceof Error ? error.message : error);
});
const autoPermissions = new AutoPermissionService(opencode, bus);
autoPermissions.start();
const notificationStore = new PreferenceStore();
const notificationHistory = new HistoryStore();
const notificationService = new NotificationService(
  opencode,
  bus,
  notificationStore,
  notificationHistory,
  publicAppUrl,
  (directory) => autoPermissions.isEnabled(directory),
);
notificationService.start();
bus.start();

app.use("/api", sessionRoutes(opencode, bus, publicAppUrl, autoPermissions));
app.use("/api", settingsRoutes(opencode));
app.use("/api", mcpRoutes(opencode));
app.use("/api", workspaceRoutes(opencode));
app.use("/api", worktreeRoutes(opencode, bus));
app.use("/api", notificationRoutes(notificationStore, notificationHistory, () => notificationService.reconcileAll()));
app.use("/api", forgeRoutes());
app.use("/api", reminderRoutes());
app.use("/api", appConfigRoutes(publicAppUrl));
app.use("/api", projectRoutes());
app.use("/api", recentRoutes(opencode));
const opencodePort = Number(new URL(opencode.baseUrl).port || 80);
app.use("/api", previewRoutes(parseAllowedPorts(process.env.PREVIEW_ALLOWED_PORTS, [PORT, opencodePort])));

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
      events: { connected: bus.isConnected() },
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
  // Express/send in the current dependency set returns ENOENT for an
  // absolute sendFile path even when the file exists; the rooted form is the
  // documented equivalent and keeps client-side routes working.
  res.sendFile("index.html", { root: clientDir });
});

app.listen(PORT, "0.0.0.0", () => {
  // 0.0.0.0 so the app is reachable over the tailnet from a phone.
  console.log(`[bff] listening on :${PORT} -> opencode ${opencode.baseUrl}`);
});
