import type {
  AppSettings,
  DshConfigResponse,
  DshSessionSummary,
  NotificationPreferences,
  NotificationRecord,
  PlanningItem,
  SessionSummary,
} from "../lib/api.js";
import type { RawMessage } from "../lib/events.js";
import type { TranscriptEvent } from "../lib/transcript.js";

export const SIMULATOR_DIRECTORY = "/tmp/mock-project";
const SECOND_DIRECTORY = "/tmp/mock-second-project";

const modelCatalogue = {
  defaultModel: { providerID: "anthropic", modelID: "claude-opus-5" },
  models: [
    { providerID: "anthropic", providerName: "Anthropic", modelID: "claude-opus-5", name: "Claude Opus 5", status: "active", limits: { context: 200_000, output: 32_000 }, capabilities: { image: true, reasoning: true }, variants: ["high"] },
    { providerID: "anthropic", providerName: "Anthropic", modelID: "claude-text", name: "Claude Text", status: "active", limits: { context: 100_000, output: 16_000 }, capabilities: { image: false, reasoning: true }, variants: [] },
    { providerID: "openai", providerName: "OpenAI", modelID: "gpt-5.6-sol", name: "GPT-5.6 Sol", status: "active", limits: { context: 200_000, output: 32_000 }, capabilities: { image: true, reasoning: true }, variants: [] },
    { providerID: "openai", providerName: "OpenAI", modelID: "gpt-5", name: "GPT-5", status: "active", limits: { context: 128_000, output: 16_000 }, capabilities: { image: true, reasoning: true }, variants: [] },
  ],
};

function summary(overrides: Partial<SessionSummary> & Pick<SessionSummary, "id" | "title">): SessionSummary {
  return {
    directory: SIMULATOR_DIRECTORY,
    childCount: 0,
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-opus-5" },
    cost: 0.0431,
    tokens: { input: 110, output: 940, reasoning: 250, cacheRead: 10_400, cacheWrite: 800 },
    createdAt: "2026-08-24T15:00:00.000Z",
    updatedAt: "2026-08-25T18:30:00.000Z",
    archived: false,
    running: false,
    ...overrides,
  };
}

const baseMessages: RawMessage[] = [
  {
    info: { id: "msg_preview_user", role: "user", agent: "build", time: { created: 1_787_000_000_000 }, model: { providerID: "anthropic", modelID: "claude-opus-5" } },
    parts: [{ id: "prt_preview_user", messageID: "msg_preview_user", type: "text", text: "Add a health endpoint and verify the deployment pipeline." }],
  },
  {
    info: { id: "msg_preview_agent", role: "assistant", agent: "build", mode: "build", parentID: "msg_preview_user", time: { created: 1_787_000_001_000, completed: 1_787_000_009_000 }, providerID: "anthropic", modelID: "claude-opus-5" },
    parts: [
      { id: "prt_preview_reason", messageID: "msg_preview_agent", type: "reasoning", text: "The server needs a bounded liveness route and a focused regression test.", time: { start: 1_787_000_001_500, end: 1_787_000_003_500 } },
      { id: "prt_preview_read", messageID: "msg_preview_agent", type: "tool", tool: "read", callID: "call_preview_read", state: { status: "completed", input: { filePath: "server/index.ts" }, output: "export const app = express();", title: "server/index.ts", time: { start: 1_787_000_004_000, end: 1_787_000_004_250 } } },
      { id: "prt_preview_text", messageID: "msg_preview_agent", type: "text", text: "Implemented the route and tests. Review `server/index.ts:98` and the [example pull request](https://github.com/acme/demo/pull/7)." },
      { id: "prt_preview_patch", messageID: "msg_preview_agent", type: "patch", hash: "def456", files: ["server/index.ts", "tests/health.test.ts"] },
      { id: "prt_preview_finish", messageID: "msg_preview_agent", type: "step-finish", reason: "stop", cost: 0.0421, tokens: { input: 100, output: 900, reasoning: 250, cache: { read: 10_000, write: 750 } } },
    ],
  },
  {
    info: { id: "msg_preview_verify", role: "assistant", agent: "build", mode: "build", time: { created: 1_787_000_010_000, completed: 1_787_000_012_000 } },
    parts: [
      { id: "prt_preview_bash", messageID: "msg_preview_verify", type: "tool", tool: "bash", callID: "call_preview_bash", state: { status: "completed", input: { command: "npm test" }, output: "Tests: 428 passed", title: "npm test", time: { start: 1_787_000_010_500, end: 1_787_000_011_500 } } },
      { id: "prt_preview_done", messageID: "msg_preview_verify", type: "text", text: "All verification passed. The public PR simulator uses fixture data and never receives repository secrets." },
    ],
  },
];

const planningItems: PlanningItem[] = [
  { id: "112", number: 112, type: "issue", title: "CICD. add a preview deployed pr step", state: "open", merged: false, labels: ["priority:medium", "deployment"], author: "leoncheng57", url: "https://github.com/leoncheng57/custom-dca-opencode/issues/112", createdAt: "2026-08-23T10:00:00Z", updatedAt: "2026-08-25T18:00:00Z", commentCount: 1, childCount: 0, completedChildCount: 0, parentNumber: 153 },
  { id: "153", number: 153, type: "issue", title: "Use GitHub's deployment infra to build a public simulator", state: "open", merged: false, labels: ["priority:high", "deployment"], author: "leoncheng57", url: "https://github.com/leoncheng57/custom-dca-opencode/issues/153", createdAt: "2026-08-24T09:00:00Z", updatedAt: "2026-08-25T19:00:00Z", commentCount: 2, childCount: 2, completedChildCount: 1, parentNumber: null },
  { id: "178", number: 178, type: "pull_request", title: "Show native task child model provenance", state: "open", merged: false, labels: ["priority:medium", "frontend"], author: "contributor", url: "https://github.com/leoncheng57/custom-dca-opencode/pull/178", createdAt: "2026-08-25T13:00:00Z", updatedAt: "2026-08-25T20:00:00Z", commentCount: 3, childCount: 0, completedChildCount: 0, parentNumber: null },
  { id: "109", number: 109, type: "issue", title: "Publish the migrated agent-skills catalog", state: "closed", merged: false, labels: ["priority:low", "documentation"], author: "leoncheng57", url: "https://github.com/leoncheng57/custom-dca-opencode/issues/109", createdAt: "2026-08-20T09:00:00Z", updatedAt: "2026-08-23T19:00:00Z", commentCount: 4, childCount: 0, completedChildCount: 0, parentNumber: 153 },
];

const defaultPreferences: NotificationPreferences = {
  version: 1,
  ntfy: { enabled: false, server: "https://ntfy.sh", topic: "", events: { idle: true, error: true, abort: true, permission: true, question: true, parked: true } },
  webPush: { enabled: false, events: { idle: true, error: true, abort: true, permission: true, question: true, parked: true } },
  browser: { desktop: true, sound: false, volume: 0.6, events: { idle: true, error: true, abort: true, permission: true, question: true, parked: true } },
  parkedPermissionSeconds: 120,
};

const notificationRecords: NotificationRecord[] = [
  { id: "note-preview-permission", kind: "permission", at: 1_787_000_020_000, directory: SIMULATOR_DIRECTORY, sessionID: "ses_preview_done", sessionTitle: "Build the PR preview pipeline", requestID: "perm_preview", title: "Permission requested", body: "Open the IDE to review the session.", displayBody: "Run npm test", detail: "Ready to run the preview build once you approve the command.", delivery: { ntfy: "off", desktop: "allowed", webPush: "off" } },
  { id: "note-preview-idle", kind: "idle", at: 1_787_000_010_000, directory: SIMULATOR_DIRECTORY, sessionID: "ses_preview_done", sessionTitle: "Build the PR preview pipeline", title: "Session finished", body: "Open the IDE to review the session.", detail: "Published the preview bundle to gh-pages and updated the sticky PR comment.", resolvedAt: 1_787_000_015_000, resolvedBy: "checked", delivery: { ntfy: "off", desktop: "allowed", webPush: "off" } },
];

// ---------------------------------------------------------------------------
// DSH V1 fixture data — tab-local, reset on reload.
// ---------------------------------------------------------------------------

const DSH_PRESET_ID = "dsh-preview-preset";
const DSH_WORKSPACE_ID = "dsh-preview-workspace";

const dshConfig: DshConfigResponse = {
  enabled: true,
  configured: true,
  protocol: 1,
  readOnly: true,
  sdkVersion: "0.1.0",
  sandbox: "seatbelt",
  presets: [{ id: DSH_PRESET_ID, label: "Preview preset", provider: "simulator", model: "sim-preview-v1", fingerprint: "0".repeat(64) }],
  workspaces: [{ id: DSH_WORKSPACE_ID, label: "Preview workspace" }],
};

interface DshFixtureSession extends DshSessionSummary {
  events: TranscriptEvent[];
}

function dshSummary(session: DshFixtureSession): DshSessionSummary {
  return { id: session.id, title: session.title, presetId: session.presetId, workspaceId: session.workspaceId, createdAt: session.createdAt, updatedAt: session.updatedAt, running: session.running };
}

function makeDshSeedSession(): DshFixtureSession {
  const now = "2026-08-25T18:00:00.000Z";
  return {
    id: "dsh-preview-done",
    title: "DSH experiment conversation",
    presetId: DSH_PRESET_ID,
    workspaceId: DSH_WORKSPACE_ID,
    createdAt: now,
    updatedAt: now,
    running: false,
    events: [
      { id: "dsh-evt-1", messageId: "dsh-msg-1", timestamp: now, kind: "user", text: "Explain the seatbelt sandbox.", reminders: [], workflows: [], attachments: [] },
      { id: "dsh-evt-2", messageId: "dsh-msg-2", timestamp: now, kind: "agent", text: "The DSH preview is simulated. No DSH runtime, model provider, or filesystem was contacted." },
      { id: "dsh-evt-3", messageId: "dsh-msg-3", timestamp: now, kind: "status", label: "Run completed" },
    ],
  };
}

function response(body: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function bodyOf(init?: RequestInit): Record<string, any> {
  if (typeof init?.body !== "string") return {};
  try { return JSON.parse(init.body) as Record<string, any>; } catch { return {}; }
}

function routeMatch(pathname: string, pattern: RegExp): RegExpExecArray | null {
  return pattern.exec(pathname);
}

export function createPublicSimulator(): typeof fetch {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  let sessions: SessionSummary[] = [
    summary({ id: "ses_preview_done", title: "Build the PR preview pipeline", childCount: 3 }),
    summary({ id: "ses_preview_running", title: "Review mobile navigation", running: true, cost: 0.12, updatedAt: "2026-08-25T19:15:00.000Z" }),
    summary({ id: "ses_preview_child", title: "Audit deployment safety", parentID: "ses_preview_done", cost: 0.006, updatedAt: "2026-08-25T18:15:00.000Z" }),
    summary({ id: "ses_preview_child_done", title: "Verify Pages routing", parentID: "ses_preview_done", cost: 0.004, updatedAt: "2026-08-25T18:10:00.000Z" }),
    // A human-authorized Managed Child (decision #19) beside the two native
    // task children, so a preview actually shows the managed/native
    // distinction rather than a wall of identical `sub` rows.
    summary({
      id: "ses_preview_managed",
      title: "Draft the release notes",
      parentID: "ses_preview_done",
      agent: "plan",
      cost: 0.002,
      updatedAt: "2026-08-25T18:05:00.000Z",
      managed: {
        origin: "managed-human",
        requestedAgent: "plan",
        requestedMode: "plan",
        requestedModel: { providerID: "anthropic", modelID: "claude-opus-5" },
        background: true,
        policySource: "creation-permission",
        effectivePolicyObserved: true,
        authorization: "read-only",
      },
    }),
    summary({ id: "ses_preview_second", title: "Document release operations", directory: SECOND_DIRECTORY, cost: 0.01, updatedAt: "2026-08-25T17:30:00.000Z" }),
  ];
  const messages = new Map<string, RawMessage[]>([
    ["ses_preview_done", structuredClone(baseMessages)],
    ["ses_preview_running", [{ info: { id: "msg_running", role: "assistant", agent: "build", time: { created: 1_787_000_020_000 } }, parts: [{ id: "prt_running", messageID: "msg_running", type: "text", text: "Checking the compact navigation at phone width." }] }]],
    ["ses_preview_child", [{ info: { id: "msg_child", role: "assistant", agent: "explore", mode: "build", time: { created: 1_787_000_015_000, completed: 1_787_000_016_000 } }, parts: [{ id: "prt_child", messageID: "msg_child", type: "text", text: "The publisher validates every file hash and writes only the PR-owned directory." }] }]],
    ["ses_preview_child_done", [{ info: { id: "msg_child_done", role: "assistant", agent: "explore", mode: "build", time: { created: 1_787_000_014_000, completed: 1_787_000_014_500 } }, parts: [{ id: "prt_child_done", messageID: "msg_child_done", type: "text", text: "Hash routing keeps every simulator page reload-safe on GitHub Pages." }] }]],
    ["ses_preview_managed", [{ info: { id: "msg_managed", role: "assistant", agent: "plan", mode: "plan", time: { created: 1_787_000_013_000, completed: 1_787_000_013_500 } }, parts: [{ id: "prt_managed", messageID: "msg_managed", type: "text", text: "Drafted the release notes without touching any file: this child was launched read-only." }] }]],
  ]);
  let settings: AppSettings = { model: "anthropic/claude-opus-5", subagent_depth: 3, compaction: { auto: true, prune: true, reserved: 8_192 } };
  let preferences = structuredClone(defaultPreferences);
  let modelPins = [{ providerID: "openai", modelID: "gpt-5.6-sol" }, { providerID: "anthropic", modelID: "claude-opus-5" }];
  let projectPins = [SIMULATOR_DIRECTORY];
  let autoPermissions = false;
  let mcpServers: Record<string, any> = { github: { status: "connected" }, docs: { status: "failed", error: "fixture connection refused" }, local: { status: "disabled" }, auth: { status: "needs_auth" } };
  let permissions = [{ id: "perm_preview", sessionID: "ses_preview_done", permission: "bash", patterns: ["npm test"], metadata: { command: "npm test" }, always: ["npm *"] }];
  let questions = [{ id: "que_preview", sessionID: "ses_preview_done", questions: [{ header: "Deployment", question: "Which preview surface should be verified?", options: [{ label: "Desktop", description: "Review the wide layout" }, { label: "Mobile", description: "Review the phone layout" }], multiple: true, custom: true }] }];

  // DSH fixture state — mutable per tab, reset on page reload.
  const dshSessions: DshFixtureSession[] = [makeDshSeedSession()];
  let dshCounter = 0;

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, "https://preview.invalid");
    if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = bodyOf(init);
    const path = url.pathname;

    if (path === "/api/health") return response({ healthy: true, upstream: { url: "simulator://opencode", reachable: true, version: "1.18.22", expected: "1.18.22", versionMatches: true }, events: { connected: true } });
    if (path === "/api/app-config") return response({ publicAppUrl: null, dshEnabled: true });
    if (path === "/api/projects") return response({ root: "/tmp", projects: [{ name: "mock-project", relativePath: "mock-project", directory: SIMULATOR_DIRECTORY, kind: "repository" }, { name: "mock-second-project", relativePath: "mock-second-project", directory: SECOND_DIRECTORY, kind: "repository" }] });
    if (path === "/api/project-pins") {
      if (method === "PATCH") projectPins = Array.isArray(body.directories) ? body.directories : projectPins;
      return response({ directories: projectPins });
    }
    if (path === "/api/model-pins") {
      if (method === "PATCH") modelPins = Array.isArray(body.models) ? body.models : modelPins;
      return response({ models: modelPins });
    }
    if (path === "/api/recent-sessions") return response({ sessions: sessions.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5), directories: [SIMULATOR_DIRECTORY, SECOND_DIRECTORY] });
    if (path === "/api/session-agents") return response({ agents: [
      { id: "plan", description: "Plan work without changing files." },
      { id: "build", description: "Implement and verify changes." },
      { id: "explore", description: "Inspect the codebase and report findings." },
      { id: "general", description: "Handle multi-step delegated work." },
    ] });
    // The Managed Child launcher and the composer workflow both read this
    // catalogue to decide which agents exist and which of them can modify
    // files, so a preview without it would offer no agent at all.
    if (path === "/api/managed-child-agents") return response({ agents: [
      { id: "plan", description: "Plan work without changing files.", access: "read-only" },
      { id: "build", description: "Implement and verify changes.", access: "can-modify" },
      { id: "explore", description: "Inspect the codebase and report findings.", access: "read-only" },
      { id: "general", description: "Handle multi-step delegated work.", access: "can-modify" },
    ] });
    if (path === "/api/sessions" && method === "POST") {
      const id = `ses_preview_created_${sessions.length}`;
      const session = summary({ id, title: body.title || String(body.prompt || "New simulated task").slice(0, 64), directory: body.directory || SIMULATOR_DIRECTORY, model: body.model || modelCatalogue.defaultModel });
      sessions = [session, ...sessions];
      messages.set(id, body.prompt ? [{ info: { id: `${id}_user`, role: "user", agent: body.mode || "build", time: { created: Date.now() } }, parts: [{ id: `${id}_part`, messageID: `${id}_user`, type: "text", text: String(body.prompt) }] }] : []);
      return response({ session }, 201);
    }
    if (path === "/api/sessions") {
      const directory = url.searchParams.get("directory");
      return response({ sessions: sessions.filter((item) => item.directory === directory && !item.archived) });
    }
    if (path === "/api/models") return response(modelCatalogue);

    const sessionRoute = routeMatch(path, /^\/api\/sessions\/([^/]+)(.*)$/u);
    if (sessionRoute) {
      const id = decodeURIComponent(sessionRoute[1]);
      const rest = sessionRoute[2];
      const session = sessions.find((item) => item.id === id);
      if (!session) return response({ error: "Simulated session not found" }, 404);
      if (rest === "/messages") return response({ messages: messages.get(id) ?? [], running: session.running, nextCursor: null });
      if (rest === "/todos") return response({ todos: id === "ses_preview_done" ? [{ content: "Research existing preview workflows", status: "completed", priority: "high" }, { content: "Deploy the in-browser simulator", status: "completed", priority: "high" }, { content: "Review the PR deployment", status: "in_progress", priority: "medium" }] : [] });
      if (rest === "/model-limit") return response({ context: 200_000 });
      if (rest === "/diff") return response({ changes: [{ file: "server/index.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1, status: "modified" }] });
      if (rest === "/prompt" && method === "POST") {
        const now = Date.now();
        const current = messages.get(id) ?? [];
        current.push(
          { info: { id: `msg_sim_user_${now}`, role: "user", agent: body.mode || "build", time: { created: now }, ...(body.model ? { model: body.model } : {}) }, parts: [{ id: `prt_sim_user_${now}`, messageID: `msg_sim_user_${now}`, type: "text", text: String(body.text || "") }] },
          { info: { id: `msg_sim_agent_${now}`, role: "assistant", agent: body.mode || "build", mode: body.mode || "build", time: { created: now + 1, completed: now + 2 } }, parts: [{ id: `prt_sim_agent_${now}`, messageID: `msg_sim_agent_${now}`, type: "text", text: "Simulated response accepted. No model or external service was called." }] },
        );
        messages.set(id, current);
        return response({ accepted: true }, 202);
      }
      if (rest === "/abort" && method === "POST") { session.running = false; return response({ aborted: true }); }
      if (rest === "/share" && method === "POST") { session.shareUrl = "https://example.test/simulated-share"; return response({ session }); }
      if (rest === "/share" && method === "DELETE") { delete session.shareUrl; return response({ session }); }
      if (rest === "/subagents") return response({ parentID: id, capabilities: { backgroundSubagents: true, managedChildren: true }, truncated: false, tasks: id === "ses_preview_done" ? [{ sessionID: "ses_preview_child", parentID: id, title: "Audit deployment safety", agent: "explore", origin: "native-task", description: "Check artifact and publication boundaries", state: "completed", evidence: "child-transcript", background: true, present: true, createdAt: "2026-08-25T18:00:00Z", updatedAt: "2026-08-25T18:15:00Z", cost: 0.006 }, { sessionID: "ses_preview_child_done", parentID: id, title: "Verify Pages routing", agent: "explore", origin: "native-task", description: "Exercise nested simulator routes", state: "completed", evidence: "child-transcript", background: false, present: true, createdAt: "2026-08-25T18:00:00Z", updatedAt: "2026-08-25T18:10:00Z", cost: 0.004 }, { sessionID: "ses_preview_managed", parentID: id, title: "Draft the release notes", origin: "managed-human", requestedAgent: "plan", requestedMode: "plan", requestedModel: { providerID: "anthropic", modelID: "claude-opus-5" }, policySource: "creation-permission", effectivePolicyObserved: true, state: "completed", evidence: "child-transcript", background: true, present: true, createdAt: "2026-08-25T18:00:00Z", updatedAt: "2026-08-25T18:05:00Z", cost: 0.002 }] : [] });
      if (rest === "/managed-children" && method === "POST") {
        const requestedAgent = body.agent || "plan";
        const authorization = body.authorization === "modify" ? "modify" : "read-only";
        const child = summary({
          id: `ses_preview_managed_${sessions.length}`,
          title: "Managed simulated child",
          parentID: id,
          agent: requestedAgent,
          managed: {
            origin: "managed-human",
            requestedAgent,
            ...(requestedAgent === "plan" || requestedAgent === "build" ? { requestedMode: requestedAgent } : {}),
            requestedModel: body.model,
            background: true,
            policySource: "creation-permission",
            effectivePolicyObserved: true,
            authorization,
          },
        });
        sessions.push(child); messages.set(child.id, []); return response({ session: child }, 201);
      }
      if (rest.startsWith("/subagents/") && rest.endsWith("/abort")) return response({ aborted: true });
      if (rest === "/background") return response({ promoted: true });
      if (rest === "/questions") return response({ requests: questions.filter((item) => item.sessionID === id) });
      if (/^\/questions\/[^/]+\/(?:reply|reject)$/u.test(rest) && method === "POST") { questions = questions.filter((item) => !rest.includes(item.id)); return response(rest.endsWith("reply") ? { replied: true } : { rejected: true }); }
      if (!rest && method === "DELETE") { sessions = sessions.filter((item) => item.id !== id); return response(undefined, 204); }
      if (!rest) return response({ session });
    }

    if (path === "/api/settings") {
      if (method === "PATCH") settings = { ...settings, ...body, subagent_depth: settings.subagent_depth };
      return response({ settings });
    }
    if (path === "/api/mcp") return response({ servers: mcpServers });
    const mcpRoute = routeMatch(path, /^\/api\/mcp\/([^/]+)\/(connect|disconnect)$/u);
    if (mcpRoute) { mcpServers = { ...mcpServers, [decodeURIComponent(mcpRoute[1])]: { status: mcpRoute[2] === "connect" ? "connected" : "disabled" } }; return response({ servers: mcpServers }); }
    if (path === "/api/catalog") return response({ servers: mcpServers, skills: [{ name: "browser-check", description: "Check a page in the browser.", location: "browser-check/SKILL.md" }], commands: [{ name: "verify", description: "Run project verification.", source: "command", agent: "build", model: "mock/model", subtask: false }], refreshedAt: new Date().toISOString() });
    if (path === "/api/permissions") return response({ permissions: { "*": "ask", read: "allow", edit: { "*": "allow", "**/.env": "deny" }, bash: { "git *": "allow", "rm -rf *": "deny" } } });
    if (path === "/api/lsp") return response({ servers: { typescript: { status: "connected", root: SIMULATOR_DIRECTORY }, eslint: { status: "disabled" } } });
    if (path === "/api/notifications/history") return response({ records: notificationRecords, activeCount: notificationRecords.filter((item) => !item.resolvedAt).length, appBadgeCount: 1, appBadgeRevision: 1, suppressedActive: { "auto-permissions": 0, subagent: 0, "preference-off": 0 } });
    if (path === "/api/notifications/resolve" && method === "POST") {
      const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
      const records = notificationRecords.filter((item) => ids.has(item.id) && !item.resolvedAt);
      for (const record of records) { record.resolvedAt = Date.now(); record.resolvedBy = "checked"; }
      return response({ records, activeCount: notificationRecords.filter((item) => !item.resolvedAt).length, appBadgeCount: 0, appBadgeRevision: 2 });
    }
    const notificationRoute = routeMatch(path, /^\/api\/notifications\/([^/]+)$/u);
    if (notificationRoute && method === "PATCH") {
      const record = notificationRecords.find((item) => item.id === decodeURIComponent(notificationRoute[1]));
      if (!record) return response({ error: "Notification not found" }, 404);
      if (body.resolved) { record.resolvedAt = Date.now(); record.resolvedBy = "checked"; } else { delete record.resolvedAt; delete record.resolvedBy; }
      return response({ record, activeCount: notificationRecords.filter((item) => !item.resolvedAt).length, appBadgeCount: 0, appBadgeRevision: 2 });
    }
    if (path === "/api/notifications") {
      if (method === "PATCH") preferences = body as NotificationPreferences;
      return response({ preferences, tokenConfigured: false, webPush: { configured: false, publicKey: null } });
    }
    if (path.startsWith("/api/notifications/test")) return response({ sent: true, failed: 0 });
    if (path === "/api/auto-approve") { if (method === "PATCH") autoPermissions = Boolean(body.enabled); return response({ enabled: autoPermissions, error: null }); }

    if (path === "/api/workspace/tree") {
      const nested = url.searchParams.get("path") === "src";
      return response(nested ? { path: "src", dirs: [], files: [{ name: "index.ts", path: "src/index.ts", type: "file", ignored: false }] } : { path: "", dirs: [{ name: "src", path: "src", type: "directory", ignored: false }, { name: "tests", path: "tests", type: "directory", ignored: false }], files: [{ name: "README.md", path: "README.md", type: "file", ignored: false }, { name: "package.json", path: "package.json", type: "file", ignored: false }] });
    }
    if (path === "/api/workspace/file") {
      const file = url.searchParams.get("path") || "README.md";
      const content = file === "src/index.ts" ? "import express from \"express\";\n\nexport const app = express();\n\napp.get(\"/health\", (_req, res) => res.json({ healthy: true }));\n" : "# Mock project\n\nA deterministic workspace for public PR previews.\n";
      return response({ path: file, type: "text", content });
    }
    if (path === "/api/workspace/references" && method === "POST") return response({ references: (body.paths || []).map((candidate: string) => ({ path: candidate, status: candidate.startsWith("server/") || candidate.startsWith("src/") ? "file" : "missing", ...(candidate.startsWith("server/") || candidate.startsWith("src/") ? { resolvedPath: candidate.replace(/^server\//u, "src/") } : {}) })) });
    if (path === "/api/workspace/changes") return response({ changes: [{ file: "server/index.ts", patch: "@@ -12,0 +13,4 @@\n+app.get('/health', handler);", additions: 4, deletions: 0, status: "modified" }, { file: ".github/workflows/pr-preview.yml", patch: "@@ -0,0 +1,42 @@\n+name: PR preview", additions: 42, deletions: 0, status: "added" }] });
    if (path === "/api/workspace/commits") return response({ commits: [{ sha: "abc123456789", shortSha: "abc1234", subject: "Add PR preview deployment", author: "Preview Contributor", authoredAt: "2026-08-25T18:30:00Z" }, { sha: "def456789012", shortSha: "def4567", subject: "Add deterministic simulator fixtures", author: "Preview Contributor", authoredAt: "2026-08-25T18:00:00Z" }] });
    if (path === "/api/worktrees") return response({ worktrees: [{ name: "preview-pipeline", branch: "feat/pr-preview-pipeline", directory: `${SIMULATOR_DIRECTORY}.worktrees/preview-pipeline` }] });

    if (path === "/api/planning/items") return response({ repository: { owner: "leoncheng57", repo: "custom-dca-opencode", url: "https://github.com/leoncheng57/custom-dca-opencode" }, items: planningItems, truncated: false, epicsTruncated: false, fetchedAt: new Date().toISOString() });
    if (path === "/api/planning/labels") return response({ labels: ["deployment", "documentation", "frontend", "priority:high", "priority:medium", "priority:low"].map((name) => ({ name, description: `${name} work` })), truncated: false });
    if (path === "/api/planning/issues" && method === "POST") {
      const issue: PlanningItem = { id: `sim-${planningItems.length}`, number: 900 + planningItems.length, type: "issue", title: String(body.title), state: "open", merged: false, labels: body.labels || [], author: "preview-user", url: "https://github.com/leoncheng57/custom-dca-opencode/issues", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), commentCount: 0, childCount: 0, completedChildCount: 0, parentNumber: null };
      planningItems.push(issue); return response({ issue }, 201);
    }
    const planningRoute = routeMatch(path, /^\/api\/planning\/items\/(\d+)(\/labels)?$/u);
    if (planningRoute) {
      const item = planningItems.find((candidate) => candidate.number === Number(planningRoute[1]));
      if (!item) return response({ error: "Planning item not found" }, 404);
      if (planningRoute[2] && method === "PATCH") { item.labels = body.labels || item.labels; return response({ item }); }
      return response({ details: { item, itemLabelsTruncated: false, body: "## Preview context\n\nThis content is served from deterministic fixture data.", bodyTruncated: false, comments: [{ id: "comment-1", author: "reviewer", body: "The deployment should refresh on every commit.", createdAt: "2026-08-25T18:00:00Z", bodyTruncated: false }], commentsTruncated: false, commentsError: null } });
    }

    if (path === "/api/forge/review") return response({ review: { url: url.searchParams.get("url"), forge: "github", title: "Mock pull request", state: "open", author: "octocat", pipeline: "success", mergeable: true, headSha: "abc123", number: 7, project: "acme/demo" } });
    if (path === "/api/forge/review/details") return response({ details: { description: { value: "## Review notes\n\nReady to ship.", error: null, truncated: false }, comments: { value: [{ id: "1", author: "reviewer", body: "Looks good.", createdAt: "2026-08-25T18:00:00Z", resolved: null, discussionId: null, bodyTruncated: false }], error: null, truncated: false }, reviews: { value: [{ id: "2", author: "maintainer", state: "APPROVED", body: "Approved.", submittedAt: "2026-08-25T18:05:00Z", bodyTruncated: false }], error: null, truncated: false }, pipelines: { value: [], error: null, truncated: false }, checks: { value: [{ id: "3", name: "test", stage: "checks", status: "success", webUrl: "https://github.com/acme/demo/actions", startedAt: "2026-08-25T18:00:00Z", completedAt: "2026-08-25T18:02:00Z", duration: 120, source: "check" }], error: null, truncated: false }, partial: false, auth: "available" } });
    if (path === "/api/forge/review/merge") return response({ merged: true });
    if (path === "/api/permission-requests") return response({ requests: permissions });
    const permissionRoute = routeMatch(path, /^\/api\/permission-requests\/([^/]+)\/reply$/u);
    if (permissionRoute && method === "POST") { permissions = permissions.filter((item) => item.id !== decodeURIComponent(permissionRoute[1])); return response({ replied: true }); }
    if (path === "/api/reminders") return response({ reminders: [{ id: "verify", title: "Verify changes", description: "Run focused verification before reporting completion.", triggers: ["verify", "test"] }, { id: "review", title: "Review implementation", description: "Review behavior, risks, and missing tests.", triggers: ["review"] }] });
    if (path === "/api/workflows") return response({ workflows: [{ id: "playwright-review", title: "Playwright UI review", description: "Review a route and interaction in the browser.", injector: "Use Playwright to verify this interaction against the running application." }, { id: "session-update", title: "Send session update", description: "Deliver a handoff to another session.", injector: "Treat this as an update from another workstream." }, { id: "managed-child", title: "Launch Managed Child", description: "Launch a human-authorized child session.", injector: "Complete the delegated task and report concrete findings." }] });

    // -----------------------------------------------------------------------
    // DSH V1 fixture routes
    // -----------------------------------------------------------------------

    if (path === "/api/dsh/config") return response(dshConfig);

    if (path === "/api/dsh/sessions" && method === "POST") {
      const selectedPreset = dshConfig.presets.find((item) => item.id === body.presetId);
      const selectedWorkspace = dshConfig.workspaces.find((item) => item.id === body.workspaceId);
      if (!selectedPreset || !selectedWorkspace) return response({ error: "presetId and workspaceId must be allowlisted" }, 400);
      const now = new Date().toISOString();
      const session: DshFixtureSession = {
        id: `dsh-sim-${++dshCounter}`,
        title: typeof body.title === "string" ? body.title.trim().slice(0, 120) || "New DSH conversation" : "New DSH conversation",
        presetId: selectedPreset.id,
        workspaceId: selectedWorkspace.id,
        createdAt: now,
        updatedAt: now,
        running: false,
        events: [],
      };
      dshSessions.unshift(session);
      return response({ session: dshSummary(session) }, 201);
    }
    if (path === "/api/dsh/sessions") {
      return response({ sessions: dshSessions.map(dshSummary) });
    }

    const dshSessionRoute = routeMatch(path, /^\/api\/dsh\/sessions\/([^/]+)(.*)$/u);
    if (dshSessionRoute) {
      const dshId = decodeURIComponent(dshSessionRoute[1]);
      const dshRest = dshSessionRoute[2];
      const dshSession = dshSessions.find((item) => item.id === dshId);
      if (!dshSession) return response({ error: "DSH session not found" }, 404);

      if (dshRest === "/prompt" && method === "POST") {
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text || text.length > 40_000) return response({ error: "text must contain 1-40000 characters" }, 400);
        if (dshSession.running) return response({ error: "DSH session is already running" }, 409);
        const now = new Date().toISOString();
        const userMsgId = `dsh-user-${++dshCounter}`;
        const agentMsgId = `dsh-agent-${++dshCounter}`;
        dshSession.events.push(
          { id: `dsh-evt-u-${dshCounter}`, messageId: userMsgId, timestamp: now, kind: "user", text, reminders: [], workflows: [], attachments: [] },
          { id: `dsh-evt-a-${dshCounter}`, messageId: agentMsgId, timestamp: now, kind: "agent", text: "Simulated DSH fixture response. No DSH runtime or model provider was called." },
        );
        dshSession.updatedAt = now;
        return response({ accepted: true }, 202);
      }

      if (dshRest === "/cancel" && method === "POST") {
        const wasCancelled = dshSession.running;
        dshSession.running = false;
        if (wasCancelled) {
          const now = new Date().toISOString();
          dshSession.events.push({ id: `dsh-evt-cancel-${++dshCounter}`, messageId: `dsh-cancel-${dshCounter}`, timestamp: now, kind: "status", label: "Cancelled by user" });
          dshSession.updatedAt = now;
        }
        return response({ cancelled: wasCancelled });
      }

      // GET /api/dsh/sessions/:id — session + normalized events
      if (!dshRest) return response({ session: dshSummary(dshSession), events: dshSession.events });
    }

    // /api/dsh/events is SSE (EventSource). The fixture adapter intercepts
    // fetch() but not new EventSource(). The client's `dshEventsUrl` helper
    // builds a URL and hands it to EventSource directly, so this route
    // cannot be served from a fetch shim. UI-side the EventSource would
    // need to be wrapped or the DSH page would need to skip SSE when
    // VITE_PUBLIC_SIMULATOR is true and poll GET /api/dsh/sessions/:id
    // instead. No network request is made here.
    if (path === "/api/dsh/events") return response({ error: "DSH events SSE is not available in the public simulator. Poll GET /api/dsh/sessions/:id instead." }, 501);

    return response({ error: `The public simulator has no fixture for ${method} ${path}` }, 404);
  }) as typeof fetch;
}

export function installPublicSimulator(): void {
  localStorage.setItem("opencode.directory.v1", localStorage.getItem("opencode.directory.v1") || SIMULATOR_DIRECTORY);
  globalThis.fetch = createPublicSimulator();
}
