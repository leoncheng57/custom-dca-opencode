// tests/e2e/mock-opencode.ts
//
// A stand-in for `opencode serve`, so e2e can run in CI with no agent, no LLM
// spend, and deterministic output.
//
// It implements only the endpoints the app actually calls, and it implements
// them the way the REAL server behaves — including the awkward parts, because
// those are exactly what regressions hide in:
//
//   - /session requires ?directory= and is scoped by it
//   - /session/{id}/message returns raw { info, parts }
//   - unknown session ids produce HTTP 500 (not 404) with an UnknownError body
//   - /global/event is SSE and emits a `server.heartbeat` that is absent from
//     the published event union
//   - /prompt_async answers 204 with no body
//
// Run standalone:  npx tsx tests/e2e/mock-opencode.ts [port]

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.resolve(here, "../fixtures/session-messages.json"), "utf8"),
) as unknown[];

export const MOCK_DIRECTORY = "/tmp/mock-project";

const SESSIONS = [
  {
    id: "ses_mock_done",
    title: "Add a health endpoint",
    directory: MOCK_DIRECTORY,
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-opus-5" },
    cost: 0.0431,
    tokens: { input: 110, output: 940, reasoning: 250, cache: { read: 10400, write: 800 } },
    time: { created: 1787000000000, updated: 1787000012000 },
  },
  {
    id: "ses_mock_running",
    title: "Refactor the parser",
    directory: MOCK_DIRECTORY,
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-opus-5" },
    cost: 0.12,
    tokens: { input: 20, output: 300, reasoning: 0, cache: { read: 900, write: 100 } },
    time: { created: 1787000100000, updated: 1787000200000 },
  },
  {
    id: "ses_mock_archived",
    title: "Old archived work",
    directory: MOCK_DIRECTORY,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1786000000000, updated: 1786000000000, archived: 1786500000000 },
  },
];

const TODOS = [
  { content: "Read the existing server", status: "completed", priority: "high" },
  { content: "Add the route", status: "in_progress", priority: "high" },
  { content: "Write a test", status: "pending", priority: "medium" },
];

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

/** Mirror the real server: unknown session -> 500 UnknownError, not 404. */
function unknownError(res: ServerResponse): void {
  json(res, 500, {
    name: "UnknownError",
    data: { message: "Unexpected server error. Check server logs for details.", ref: "err_mock" },
  });
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://mock");
  const { pathname } = url;
  const directory = url.searchParams.get("directory");

  if (pathname === "/global/health") {
    return json(res, 200, { healthy: true, version: "1.18.19" });
  }

  if (pathname === "/global/event") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ payload: { type: "server.connected", properties: {} } })}\n\n`);
    // The real server heartbeats every 10s with a type absent from the typed
    // union — clients must tolerate it.
    const beat = setInterval(() => {
      res.write(
        `data: ${JSON.stringify({ directory: MOCK_DIRECTORY, payload: { type: "server.heartbeat", properties: {} } })}\n\n`,
      );
    }, 1_000);
    req.on("close", () => clearInterval(beat));
    return;
  }

  if (pathname === "/session/status") {
    return json(res, 200, { ses_mock_running: { type: "busy" } });
  }

  if (pathname === "/session" && req.method === "GET") {
    if (!directory) return json(res, 400, { error: "directory required" });
    return json(res, 200, SESSIONS.filter((s) => s.directory === directory));
  }

  if (pathname === "/session" && req.method === "POST") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as { title?: string }) : {};
      json(res, 200, {
        id: `ses_mock_new_${Date.now()}`,
        title: body.title ?? "Untitled session",
        directory: directory ?? MOCK_DIRECTORY,
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: Date.now(), updated: Date.now() },
      });
    });
    return;
  }

  const sessionMatch = /^\/session\/([^/]+)(\/.*)?$/.exec(pathname);
  if (sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]);
    const rest = sessionMatch[2] ?? "";
    const session = SESSIONS.find((s) => s.id === id);

    if (rest === "/prompt_async" && req.method === "POST") {
      if (!session) return unknownError(res);
      res.writeHead(204).end(); // 204, no body — the real contract.
      return;
    }
    if (rest === "/abort" && req.method === "POST") {
      if (!session) return unknownError(res);
      return json(res, 200, true);
    }
    if (!session) return unknownError(res);

    if (rest === "") {
      if (req.method === "DELETE") return json(res, 200, true);
      return json(res, 200, session);
    }
    if (rest === "/message") {
      return json(res, 200, id === "ses_mock_done" ? fixture : []);
    }
    if (rest === "/todo") {
      return json(res, 200, id === "ses_mock_done" ? TODOS : []);
    }
  }

  json(res, 404, { error: `mock-opencode: unhandled ${req.method} ${pathname}` });
}

const port = Number(process.argv[2] || process.env.MOCK_OPENCODE_PORT || 4599);
createServer(handle).listen(port, "127.0.0.1", () => {
  console.log(`[mock-opencode] listening on http://127.0.0.1:${port}`);
});
