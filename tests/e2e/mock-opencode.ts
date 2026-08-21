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
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.resolve(here, "../fixtures/session-messages.json"), "utf8"),
) as unknown[];

const hostileMarkdown = [
  "Mobile width containment fixture.",
  "",
  `\`\`\`text\n${"code-token-".repeat(36)}\n\`\`\``,
  "",
  `| column | value |\n| --- | --- |\n| table | ${"wide-cell-".repeat(36)} |`,
  "",
  `https://example.test/${"long-url-token-".repeat(28)}`,
].join("\n");

function mobileMessages(): unknown[] {
  const result: unknown[] = [];
  for (let index = 0; index < 24; index += 1) {
    const created = 1787100000000 + index * 2_000;
    result.push(
      {
        info: { id: `msg_mobile_user_${index}`, role: "user", agent: "build", time: { created } },
        parts: [{ id: `prt_mobile_user_${index}`, messageID: `msg_mobile_user_${index}`, type: "text", text: `History prompt ${index + 1}` }],
      },
      {
        info: { id: `msg_mobile_agent_${index}`, role: "assistant", agent: "build", time: { created: created + 1_000, completed: created + 1_500 } },
        parts: [{ id: `prt_mobile_agent_${index}`, messageID: `msg_mobile_agent_${index}`, type: "text", text: `History response ${index + 1}. ${"Readable transcript content. ".repeat(3)}` }],
      },
    );
  }
  result.push({
    info: { id: "msg_mobile_live", role: "assistant", agent: "build", time: { created: 1787100100000 } },
    parts: [{ id: "prt_mobile_live", messageID: "msg_mobile_live", type: "text", text: hostileMarkdown }],
  });
  return result;
}

const messages = new Map<string, unknown[]>([
  ["ses_mock_done", fixture],
  ["ses_mock_mobile", mobileMessages()],
]);
const promptPayloads: Array<Record<string, unknown> & { sessionID: string }> = [];
let sessionListRequests = 0;
const sessionPayloads: Array<Record<string, unknown>> = [];
const toolIDs = [
  "invalid", "question", "bash", "read", "glob", "grep", "edit", "write", "task",
  "webfetch", "todowrite", "websearch", "skill", "apply_patch", "mcp_dynamic_tool",
];

const MOCK_DIRECTORY_INPUT = "/tmp/mock-project";
const TOOL_FAILURE_DIRECTORY_INPUT = "/tmp/mock-tool-failure";
const CATALOGUE_FAILURE_DIRECTORY_INPUT = "/tmp/mock-catalogue-failure";
mkdirSync(MOCK_DIRECTORY_INPUT, { recursive: true });
mkdirSync(TOOL_FAILURE_DIRECTORY_INPUT, { recursive: true });
mkdirSync(CATALOGUE_FAILURE_DIRECTORY_INPUT, { recursive: true });
mkdirSync(path.join(MOCK_DIRECTORY_INPUT, "src"), { recursive: true });
export const MOCK_DIRECTORY = realpathSync(MOCK_DIRECTORY_INPUT);
const TOOL_FAILURE_DIRECTORY = realpathSync(TOOL_FAILURE_DIRECTORY_INPUT);
const CATALOGUE_FAILURE_DIRECTORY = realpathSync(CATALOGUE_FAILURE_DIRECTORY_INPUT);
if (!existsSync(path.join(MOCK_DIRECTORY, ".git"))) {
  execFileSync("git", ["init", "-q", MOCK_DIRECTORY]);
  writeFileSync(path.join(MOCK_DIRECTORY, "README.md"), "# Mock project\n");
  execFileSync("git", ["-C", MOCK_DIRECTORY, "add", "README.md"]);
  execFileSync("git", ["-C", MOCK_DIRECTORY, "-c", "user.name=E2E", "-c", "user.email=e2e@example.test", "commit", "-qm", "fixture"]);
}

const SESSIONS: Array<Record<string, any>> = [
  {
    id: "ses_mock_done",
    title: "Add a health endpoint",
    directory: MOCK_DIRECTORY,
    agent: "build",
    model: { providerID: "anthropic", id: "claude-opus-5" },
    cost: 0.0431,
    tokens: { input: 110, output: 940, reasoning: 250, cache: { read: 10400, write: 800 } },
    time: { created: 1787000000000, updated: 1787000012000 },
  },
  {
    id: "ses_mock_running",
    title: "Refactor the parser",
    directory: MOCK_DIRECTORY,
    agent: "build",
    model: { providerID: "anthropic", id: "claude-opus-5" },
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
  {
    id: "ses_mock_unknown_model",
    title: "Imported unknown model",
    directory: MOCK_DIRECTORY,
    agent: "build",
    model: { providerID: "legacy", id: "removed-model", variant: "old" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1787000300000, updated: 1787000300000 },
  },
  {
    id: "ses_mock_mobile",
    title: "Mobile full session fixture",
    directory: MOCK_DIRECTORY,
    agent: "build",
    model: { providerID: "anthropic", id: "claude-opus-5" },
    cost: 0.2,
    tokens: { input: 1000, output: 2000, reasoning: 0, cache: { read: 0, write: 0 } },
    // Keep the purpose-built long fixture out of ordinary hub assertions while
    // retaining direct route access for mobile transcript tests.
    time: { created: 1787100000000, updated: 1787100100000, archived: 1787100200000 },
  },
];

const TODOS = [
  { content: "Read the existing server", status: "completed", priority: "high" },
  { content: "Add the route", status: "in_progress", priority: "high" },
  { content: "Write a test", status: "pending", priority: "medium" },
];

let globalConfig: Record<string, unknown> = {};
let mcpServers: Record<string, unknown> = {
  github: { status: "connected" },
  docs: { status: "failed", error: "mock connection refused" },
  auth: { status: "needs_auth" },
};
const worktrees = [`${MOCK_DIRECTORY}.worktrees/fixture`];
let pendingPermissions = [{ id: "perm_mock", sessionID: "ses_mock_done", permission: "bash", patterns: ["npm test"] }];
const permissionReplies: Array<{ id: string; reply: unknown }> = [];
const questionFixture = () => [
  {
    id: "que_mock",
    sessionID: "ses_mock_done",
    questions: [
      {
        header: "Deployment",
        question: "Where should this ship?",
        options: [{ label: "Staging", description: "Use the staging environment" }, { label: "Production", description: "Use production" }],
        custom: false,
      },
      {
        header: "Checks",
        question: "Which checks should run?",
        options: [{ label: "Unit", description: "Run unit tests" }, { label: "E2E", description: "Run browser tests" }],
        multiple: true,
        custom: true,
      },
    ],
  },
  {
    id: "que_api",
    sessionID: "ses_mock_running",
    questions: [
      {
        header: "Deployment",
        question: "Where should this ship?",
        options: [{ label: "Staging", description: "Use the staging environment" }, { label: "Production", description: "Use production" }],
        custom: false,
      },
      {
        header: "Checks",
        question: "Which checks should run?",
        options: [{ label: "Unit", description: "Run unit tests" }, { label: "E2E", description: "Run browser tests" }],
        multiple: true,
        custom: true,
      },
    ],
  },
];
let pendingQuestions = questionFixture();
const questionReplies: Array<{ id: string; answers?: unknown; rejected?: boolean }> = [];
mkdirSync(worktrees[0], { recursive: true });
const eventClients = new Set<ServerResponse>();

function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try { resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}); }
      catch (error) { reject(error); }
    });
  });
}

function emit(type: string, properties: Record<string, unknown>, directory = MOCK_DIRECTORY): void {
  const frame = `data: ${JSON.stringify({ directory, payload: { type, properties } })}\n\n`;
  for (const client of eventClients) client.write(frame);
}

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
    eventClients.add(res);
    // The real server heartbeats every 10s with a type absent from the typed
    // union — clients must tolerate it.
    const beat = setInterval(() => {
      res.write(
        `data: ${JSON.stringify({ directory: MOCK_DIRECTORY, payload: { type: "server.heartbeat", properties: {} } })}\n\n`,
      );
    }, 1_000);
    req.on("close", () => { clearInterval(beat); eventClients.delete(res); });
    return;
  }

  if (pathname === "/global/config") {
    if (req.method === "GET") return json(res, 200, globalConfig);
    if (req.method === "PATCH") {
      void body(req).then((patch) => {
        globalConfig = {
          ...globalConfig,
          ...patch,
          ...(patch.compaction && typeof patch.compaction === "object"
            ? { compaction: { ...((globalConfig.compaction as object) ?? {}), ...(patch.compaction as object) } }
            : {}),
        };
        json(res, 200, globalConfig);
      });
      return;
    }
  }

  if (pathname === "/config") {
    return json(res, 200, { model: "anthropic/claude-opus-5", permission: { "*": "ask", read: "allow" } });
  }
  if (pathname === "/config/providers") {
    if (directory === CATALOGUE_FAILURE_DIRECTORY) return json(res, 503, { error: "mock catalogue unavailable" });
    return json(res, 200, {
      providers: [
        {
          id: "anthropic",
          name: "Anthropic",
          headers: { Authorization: "Bearer must-not-reach-browser" },
          options: { apiKey: "must-not-reach-browser", baseURL: "https://private.example" },
          models: {
            "claude-opus-5": { name: "Claude Opus 5", attachment: true, reasoning: true, limit: { context: 200000, output: 32000 }, variants: { high: { token: "secret" } } },
            "claude-text": { name: "Claude Text", status: "active", limit: { context: 100000, output: 16000 } },
            "claude-retired": { name: "Claude Retired", enabled: false, limit: { context: 1000 } },
          },
        },
        { id: "openai", name: "OpenAI", models: { "gpt-5": { name: "GPT-5", modalities: { input: ["text", "image"] }, limit: { context: 128000, output: 16000 } } } },
      ],
      default: { anthropic: "claude-opus-5" },
    });
  }
  if (pathname === "/experimental/tool/ids") {
    return directory === TOOL_FAILURE_DIRECTORY
      ? json(res, 503, { error: "mock discovery unavailable" })
      : json(res, 200, toolIDs);
  }
  if (pathname === "/test/prompt-payloads") return json(res, 200, promptPayloads);
  if (pathname === "/test/session-list-requests") return json(res, 200, { count: sessionListRequests });
  if (pathname === "/test/session-list-requests") return json(res, 200, { count: sessionListRequests });
  if (pathname === "/test/permission-replies") return json(res, 200, permissionReplies);
  if (pathname === "/test/permission" && req.method === "POST") {
    void body(req).then((input) => {
      const permission = {
        id: String(input.id),
        sessionID: String(input.sessionID),
        permission: String(input.permission),
        patterns: Array.isArray(input.patterns) ? input.patterns.map(String) : [],
      };
      pendingPermissions.push(permission);
      emit("permission.asked", permission, directory ?? MOCK_DIRECTORY);
      json(res, 201, permission);
    });
    return;
  }
  if (pathname === "/test/session-payloads") return json(res, 200, sessionPayloads);
  if (pathname === "/test/mobile/reset" && req.method === "POST") {
    messages.set("ses_mock_mobile", mobileMessages());
    return json(res, 200, true);
  }
  if (pathname === "/test/mobile/grow" && req.method === "POST") {
    const sessionMessages = messages.get("ses_mock_mobile") as Array<{ info?: { id?: string }; parts?: Array<{ type?: string; text?: string }> }>;
    const live = sessionMessages.find((message) => message.info?.id === "msg_mobile_live");
    const text = live?.parts?.find((part) => part.type === "text");
    if (text) text.text = `${hostileMarkdown}\n\nNew live activity from the running agent.`;
    emit("message.part.updated", { sessionID: "ses_mock_mobile", partID: "prt_mobile_live" });
    return json(res, 200, true);
  }
  if (pathname === "/test/question-replies") {
    const id = url.searchParams.get("id");
    return json(res, 200, id ? questionReplies.filter((reply) => reply.id === id) : questionReplies);
  }
  if (pathname === "/test/questions/reset" && req.method === "POST") {
    const scope = url.searchParams.get("scope");
    const fixtures = questionFixture();
    const resetIDs = scope === "api" ? new Set(["que_api"]) : scope === "ui" ? new Set(["que_mock"]) : new Set(["que_api", "que_mock"]);
    pendingQuestions = [...pendingQuestions.filter((item) => !resetIDs.has(item.id)), ...fixtures.filter((item) => resetIDs.has(item.id))];
    for (let index = questionReplies.length - 1; index >= 0; index -= 1) {
      if (resetIDs.has(questionReplies[index].id)) questionReplies.splice(index, 1);
    }
    return json(res, 200, true);
  }
  if (pathname === "/test/permissions/reset" && req.method === "POST") {
    pendingPermissions = [{ id: "perm_mock", sessionID: "ses_mock_done", permission: "bash", patterns: ["npm test"] }];
    return json(res, 200, true);
  }

  if (pathname === "/mcp" && req.method === "GET") return json(res, 200, mcpServers);
  const mcpMatch = /^\/mcp\/([^/]+)\/(connect|disconnect)$/.exec(pathname);
  if (mcpMatch && req.method === "POST") {
    const name = decodeURIComponent(mcpMatch[1]);
    if (!(name in mcpServers)) return json(res, 404, { error: "unknown MCP" });
    mcpServers = { ...mcpServers, [name]: { status: mcpMatch[2] === "connect" ? "connected" : "disabled" } };
    return json(res, 200, true);
  }

  if (pathname === "/lsp") return json(res, 200, { typescript: { status: "connected" } });
  if (pathname === "/permission") return json(res, 200, pendingPermissions);
  const permissionReply = /^\/permission\/([^/]+)\/reply$/.exec(pathname);
  if (permissionReply && req.method === "POST") {
    const id = decodeURIComponent(permissionReply[1]);
    const permission = pendingPermissions.find((request) => request.id === id);
    if (id.startsWith("perm_fail")) return json(res, 500, { error: "mock permission reply failed" });
    void body(req).then((input) => {
      permissionReplies.push({ id, reply: input.reply });
      pendingPermissions = pendingPermissions.filter((request) => request.id !== id);
      if (permission && id.startsWith("perm_continue_") && input.reply !== "reject") {
        const now = Date.now();
        const sessionMessages = messages.get(permission.sessionID) ?? [];
        sessionMessages.push({
          info: { id: `msg_permission_${now}`, role: "assistant", agent: "build", time: { created: now, completed: now } },
          parts: [{ id: `prt_permission_${now}`, messageID: `msg_permission_${now}`, type: "text", text: "Permission approved; continuing the conversation." }],
        });
        messages.set(permission.sessionID, sessionMessages);
      }
      emit("permission.replied", { sessionID: permission?.sessionID, requestID: id, reply: input.reply }, directory ?? MOCK_DIRECTORY);
      json(res, 200, true);
    });
    return;
  }
  if (pathname === "/question" && req.method === "GET") return json(res, 200, pendingQuestions);
  const questionAction = /^\/question\/([^/]+)\/(reply|reject)$/.exec(pathname);
  if (questionAction && req.method === "POST") {
    const id = decodeURIComponent(questionAction[1]);
    if (!pendingQuestions.some((request) => request.id === id)) return json(res, 200, false);
    if (questionAction[2] === "reply") {
      void body(req).then((input) => {
        questionReplies.push({ id, answers: input.answers });
        pendingQuestions = pendingQuestions.filter((request) => request.id !== id);
        json(res, 200, true);
      });
      return;
    }
    questionReplies.push({ id, rejected: true });
    pendingQuestions = pendingQuestions.filter((request) => request.id !== id);
    return json(res, 200, true);
  }
  if (pathname === "/file") {
    const relative = url.searchParams.get("path") ?? "";
    return json(res, 200, relative === "src"
      ? [{ name: "index.ts", path: "src/index.ts", type: "file", ignored: false }]
      : [
          { name: "src", path: "src", type: "directory", ignored: false },
          { name: "README.md", path: "README.md", type: "file", ignored: false },
          { name: "node_modules", path: "node_modules", type: "directory", ignored: true },
        ]);
  }
  if (pathname === "/file/content") {
    const relative = url.searchParams.get("path") ?? "";
    return json(res, 200, { type: "text", content: relative === "README.md" ? "# Mock project" : "export const answer = 42;" });
  }
  if (pathname === "/vcs/diff") {
    return json(res, 200, [{ file: "src/index.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-old\n+new" }]);
  }

  if (pathname === "/experimental/worktree") {
    if (req.method === "GET") return json(res, 200, worktrees);
    if (req.method === "POST") {
      void body(req).then((input) => {
        const name = typeof input.name === "string" ? input.name : `mock-${Date.now()}`;
        const directory = `${MOCK_DIRECTORY}.worktrees/${name}`;
        mkdirSync(directory, { recursive: true });
        worktrees.push(directory);
        const value = { name, branch: name, directory };
        json(res, 200, value);
        setTimeout(() => emit("worktree.ready", { name, branch: name }, directory), 10);
      });
      return;
    }
    if (req.method === "DELETE") return json(res, 200, true);
  }
  if (pathname === "/experimental/worktree/reset" && req.method === "POST") return json(res, 200, true);

  if (pathname === "/session/status") {
    return json(res, 200, { ses_mock_running: { type: "busy" } });
  }

  if (pathname === "/session" && req.method === "GET") {
    sessionListRequests += 1;
    if (!directory) return json(res, 400, { error: "directory required" });
    return json(res, 200, SESSIONS.filter((s) => s.directory === directory));
  }

  if (pathname === "/session" && req.method === "POST") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as { title?: string; agent?: string; model?: { providerID?: string; id?: string; modelID?: string; variant?: string } }) : {};
      sessionPayloads.push(body);
      if (body.model && (!body.model.providerID || !body.model.id || body.model.modelID)) {
        return json(res, 400, { error: "session model must use providerID and id" });
      }
      const created = {
        id: `ses_mock_new_${Date.now()}`,
        title: body.title ?? "Untitled session",
        directory: directory ?? MOCK_DIRECTORY,
        agent: body.agent,
        model: body.model,
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: Date.now(), updated: Date.now() },
      };
      SESSIONS.push(created);
      json(res, 200, created);
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
      void body(req).then((input) => {
        const promptModel = input.model as { providerID?: string; modelID?: string; id?: string } | undefined;
        if (promptModel && (!promptModel.providerID || !promptModel.modelID || promptModel.id)) {
          return json(res, 400, { error: "prompt model must use providerID and modelID" });
        }
        promptPayloads.push({ ...input, sessionID: id });
        if (promptModel) session.model = {
          providerID: promptModel.providerID,
          id: promptModel.modelID,
          ...(typeof input.variant === "string" ? { variant: input.variant } : {}),
        };
        const parts = Array.isArray(input.parts) ? input.parts as Array<Record<string, unknown>> : [];
        const text = parts.find((part) => part.type === "text")?.text;
        if (typeof text === "string") {
          const now = Date.now();
          const sessionMessages = messages.get(id) ?? [];
          sessionMessages.push({
            info: {
              id: `msg_user_${now}`,
              role: "user",
              agent: input.agent,
              model: promptModel ? {
                ...promptModel,
                ...(typeof input.variant === "string" ? { variant: input.variant } : {}),
              } : (session.model && {
                providerID: session.model.providerID,
                modelID: session.model.modelID ?? session.model.id,
                ...(session.model.variant ? { variant: session.model.variant } : {}),
              }),
              time: { created: now },
            },
            parts: [{ id: `prt_user_${now}`, messageID: `msg_user_${now}`, type: "text", text }],
          });
          messages.set(id, sessionMessages);
        }
        res.writeHead(204).end(); // 204, no body — the real contract.
      });
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
      return json(res, 200, messages.get(id) ?? []);
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
