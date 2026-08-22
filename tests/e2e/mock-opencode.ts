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

function paginatedMessages(): unknown[] {
  return Array.from({ length: 225 }, (_, index) => {
    const number = index + 1;
    return {
      info: { id: `msg_page_${number}`, role: number % 2 ? "user" : "assistant", agent: "build", time: { created: 1787300000000 + number, completed: 1787300000000 + number } },
      parts: [{ id: `prt_page_${number}`, messageID: `msg_page_${number}`, type: "text", text: `Paged message ${number}` }],
    };
  });
}

// ── Sub-agent fixture ───────────────────────────────────────────────────────
//
// Kept in its own project directory so child sessions cannot perturb
// the hub assertions that count rows and running pills in the main fixture.
// The children deliberately cover every state and evidence path.
const PARENT_ID = "ses_mock_parent";
const CHILD_RUNNING = "ses_mock_child_running";
const CHILD_DONE = "ses_mock_child_done";
const CHILD_REPORTED = "ses_mock_child_reported";
// A sub-agent that delegated further. Nested delegation is reachable whenever
// subagent_depth allows it, and a one-level tree silently loses this row.
const GRANDCHILD = "ses_mock_grandchild";
const CHILD_UNKNOWN = "ses_mock_child_unknown";
const CHILD_FAILED = "ses_mock_child_failed";
const CHILD_LAUNCHED = "ses_mock_child_launched";

function taskPart(
  index: number,
  sessionId: string,
  over: { status: string; description: string; agent: string; background?: boolean },
): Record<string, unknown> {
  return {
    id: `prt_task_${index}`,
    messageID: "msg_parent_plan",
    type: "tool",
    callID: `call_task_${index}`,
    tool: "task",
    state: {
      status: over.status,
      input: { description: over.description, subagent_type: over.agent },
      title: over.description,
      metadata: { sessionId, ...(over.background ? { background: true } : {}) },
      time: { start: 1787400001000 + index, end: 1787400002000 + index },
    },
  };
}

function parentMessages(): unknown[] {
  return [
    {
      info: { id: "msg_parent_user", role: "user", agent: "build", time: { created: 1787400000000 } },
      parts: [{ id: "prt_parent_user", messageID: "msg_parent_user", type: "text", text: "Investigate three areas in parallel." }],
    },
    {
      info: { id: "msg_parent_plan", role: "assistant", agent: "build", time: { created: 1787400001000, completed: 1787400003000 } },
      parts: [
        taskPart(1, CHILD_RUNNING, { status: "running", description: "Audit the parser", agent: "explore" }),
        taskPart(2, CHILD_DONE, { status: "completed", description: "Check the tests", agent: "explore" }),
        taskPart(3, CHILD_REPORTED, { status: "running", description: "Summarize the docs", agent: "general", background: true }),
        taskPart(4, CHILD_UNKNOWN, { status: "completed", description: "Crawl the changelog", agent: "general", background: true }),
        taskPart(5, CHILD_FAILED, { status: "completed", description: "Inspect the deployment", agent: "explore" }),
        taskPart(6, CHILD_LAUNCHED, { status: "running", description: "Review dependency updates", agent: "general" }),
      ],
    },
    {
      // A machine-authored hand-back. It must NOT render as a human bubble.
      info: { id: "msg_parent_notice", role: "user", time: { created: 1787400004000 } },
      parts: [{
        id: "prt_parent_notice",
        messageID: "msg_parent_notice",
        type: "text",
        text: `Background task ${CHILD_REPORTED} completed successfully.`,
      }],
    },
    {
      info: { id: "msg_parent_wrap", role: "assistant", agent: "build", time: { created: 1787400005000, completed: 1787400006000 } },
      parts: [{ id: "prt_parent_wrap", messageID: "msg_parent_wrap", type: "text", text: "Two of three sub-agents have reported back." }],
    },
  ];
}

const messages = new Map<string, unknown[]>([
  ["ses_mock_done", fixture],
  [PARENT_ID, parentMessages()],
  [CHILD_RUNNING, [
    { info: { id: "msg_cr_1", role: "user", agent: "explore", time: { created: 1787400001500 } }, parts: [{ id: "prt_cr_1", messageID: "msg_cr_1", type: "text", text: "Audit the parser" }] },
    { info: { id: "msg_cr_2", role: "assistant", agent: "explore", time: { created: 1787400001600 } }, parts: [{ id: "prt_cr_2", messageID: "msg_cr_2", type: "text", text: "Reading the parser now." }] },
  ]],
  [CHILD_DONE, [
    { info: { id: "msg_cd_1", role: "user", agent: "explore", time: { created: 1787400002500 } }, parts: [{ id: "prt_cd_1", messageID: "msg_cd_1", type: "text", text: "Check the tests" }] },
    { info: { id: "msg_cd_2", role: "assistant", agent: "explore", time: { created: 1787400002600, completed: 1787400002900 } }, parts: [{ id: "prt_cd_2", messageID: "msg_cd_2", type: "text", text: "All suites pass." }] },
  ]],
  [GRANDCHILD, [
    { info: { id: "msg_gc_1", role: "assistant", agent: "explore", time: { created: 1787400002700, completed: 1787400002800 } }, parts: [{ id: "prt_gc_1", messageID: "msg_gc_1", type: "text", text: "Flake reproduced." }] },
  ]],
  // Its own last turn never completed, so only the parent's hand-back notice
  // settles this one — which is what makes it the `parent-completion` case.
  [CHILD_REPORTED, [
    { info: { id: "msg_crp_1", role: "assistant", agent: "general", time: { created: 1787400003100 } }, parts: [{ id: "prt_crp_1", messageID: "msg_crp_1", type: "text", text: "Summarizing." }] },
  ]],
  // Launched in the background, then silently cancelled: its last turn never
  // completed and no notice ever arrived, which is the `unknown` case.
  [CHILD_UNKNOWN, [
    { info: { id: "msg_cu_1", role: "assistant", agent: "general", time: { created: 1787400003500 } }, parts: [{ id: "prt_cu_1", messageID: "msg_cu_1", type: "text", text: "Starting the crawl." }] },
  ]],
  [CHILD_FAILED, [
    { info: { id: "msg_cf_1", role: "assistant", agent: "explore", time: { created: 1787400004100 }, error: { message: "Deployment credentials were unavailable." } }, parts: [] },
  ]],
  [CHILD_LAUNCHED, []],
  ["ses_mock_mobile", mobileMessages()],
  ["ses_mock_foreign_agent", [
    { info: { id: "msg_foreign", role: "user", agent: "explore", time: { created: 1787300000000 } }, parts: [], },
  ]],
  ["ses_mock_identity_mismatch", [
    { info: { id: "msg_mismatch", role: "user", agent: "explore", time: { created: 1787300050000 } }, parts: [], },
  ]],
  ["ses_mock_paginated", paginatedMessages()],
]);
const promptPayloads: Array<Record<string, unknown> & { sessionID: string }> = [];
let sessionListRequests = 0;
let mobileRunning = true;
const sessionPayloads: Array<Record<string, unknown>> = [];
const toolIDs = [
  "invalid", "question", "bash", "read", "glob", "grep", "edit", "write", "task",
  "webfetch", "todowrite", "websearch", "skill", "apply_patch", "mcp_dynamic_tool",
];
type PermissionAction = "allow" | "ask" | "deny";
type PermissionRule = { permission: string; pattern: string; action: PermissionAction };
const editAliases = new Set(["edit", "write", "apply_patch"]);
const buildPermission: PermissionRule[] = [
  { permission: "*", pattern: "*", action: "ask" },
  { permission: "bash", pattern: "*", action: "ask" },
  { permission: "bash", pattern: "git *", action: "allow" },
  { permission: "bash", pattern: "rm -rf *", action: "deny" },
  { permission: "read", pattern: "*", action: "allow" },
  { permission: "read", pattern: "**/.env", action: "deny" },
  { permission: "edit", pattern: "*", action: "allow" },
  { permission: "edit", pattern: "**/.env", action: "deny" },
  { permission: "external_directory", pattern: "*", action: "ask" },
];
const agents = [
  { name: "build", mode: "primary", options: {}, permission: buildPermission },
  { name: "plan", mode: "primary", options: {}, permission: [...buildPermission, { permission: "edit", pattern: "*", action: "deny" as const }] },
];

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", "\0").replaceAll("*", ".*").replaceAll("\0", ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function effectiveAction(session: Record<string, any>, permission: string, pattern: string): PermissionAction {
  const names = editAliases.has(permission) ? new Set(["*", ...editAliases]) : new Set(["*", permission]);
  let action: PermissionAction = "ask";
  for (const rule of [...buildPermission, ...((session.permission as PermissionRule[] | undefined) ?? [])]) {
    if (names.has(rule.permission) && globMatches(rule.pattern, pattern)) action = rule.action;
  }
  return action;
}

function policyProbe(session: Record<string, any>): Record<string, unknown> {
  return {
    permission: (session.permission as PermissionRule[] | undefined) ?? [],
    disabledTools: toolIDs.filter((tool) => effectiveAction(session, tool, "*") === "deny"),
    probes: {
      bashDefault: effectiveAction(session, "bash", "npm test"),
      bashDestructive: effectiveAction(session, "bash", "rm -rf /tmp/project"),
      readEnv: effectiveAction(session, "read", "src/.env"),
      editEnv: effectiveAction(session, "edit", "src/.env"),
      externalDirectory: effectiveAction(session, "external_directory", "/tmp/outside"),
      unconfiguredTool: effectiveAction(session, "task", "*"),
    },
  };
}

const MOCK_DIRECTORY_INPUT = "/tmp/mock-project";
// A second project with its own sessions, so the cross-project recents panel
// has something to merge. Kept separate from the auto-permissions fixture
// directory so adding sessions here cannot perturb those tests.
const SECOND_DIRECTORY_INPUT = "/tmp/mock-second-project";
const AUTO_DIRECTORY_INPUT = "/tmp/mock-auto-project";
const TOOL_FAILURE_DIRECTORY_INPUT = "/tmp/mock-tool-failure";
const CATALOGUE_FAILURE_DIRECTORY_INPUT = "/tmp/mock-catalogue-failure";
const POLICY_FAILURE_DIRECTORY_INPUT = "/tmp/mock-policy-failure";
const SUBAGENT_DIRECTORY_INPUT = "/tmp/mock-subagent-project";
mkdirSync(SUBAGENT_DIRECTORY_INPUT, { recursive: true });
mkdirSync(MOCK_DIRECTORY_INPUT, { recursive: true });
mkdirSync(SECOND_DIRECTORY_INPUT, { recursive: true });
mkdirSync(AUTO_DIRECTORY_INPUT, { recursive: true });
mkdirSync(TOOL_FAILURE_DIRECTORY_INPUT, { recursive: true });
mkdirSync(CATALOGUE_FAILURE_DIRECTORY_INPUT, { recursive: true });
mkdirSync(POLICY_FAILURE_DIRECTORY_INPUT, { recursive: true });
mkdirSync(path.join(MOCK_DIRECTORY_INPUT, "src"), { recursive: true });
export const MOCK_DIRECTORY = realpathSync(MOCK_DIRECTORY_INPUT);
export const SECOND_DIRECTORY = realpathSync(SECOND_DIRECTORY_INPUT);
const AUTO_DIRECTORY = realpathSync(AUTO_DIRECTORY_INPUT);
const TOOL_FAILURE_DIRECTORY = realpathSync(TOOL_FAILURE_DIRECTORY_INPUT);
const CATALOGUE_FAILURE_DIRECTORY = realpathSync(CATALOGUE_FAILURE_DIRECTORY_INPUT);
const POLICY_FAILURE_DIRECTORY = realpathSync(POLICY_FAILURE_DIRECTORY_INPUT);
export const SUBAGENT_DIRECTORY = realpathSync(SUBAGENT_DIRECTORY_INPUT);
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
    // Newest session anywhere: proves the recents panel merges across projects
    // rather than ordering within one.
    id: "ses_second_newest",
    title: "Second project newest",
    directory: SECOND_DIRECTORY,
    agent: "build",
    model: { providerID: "anthropic", id: "claude-opus-5" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1787000400000, updated: 1787000400000 },
  },
  {
    // Oldest active session anywhere, so it sorts below the first project's.
    id: "ses_second_oldest",
    title: "Second project oldest",
    directory: SECOND_DIRECTORY,
    agent: "build",
    model: { providerID: "anthropic", id: "claude-opus-5" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1787000000000, updated: 1787000000000 },
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
  {
    id: "ses_mock_paginated",
    title: "Paginated export fixture",
    directory: MOCK_DIRECTORY,
    agent: "build",
    model: { providerID: "anthropic", id: "claude-opus-5" },
    cost: 0,
    tokens: {},
    time: { created: 1787300000000, updated: 1787300000200, archived: 1787300000300 },
  },
  {
    id: "ses_mock_other_directory",
    title: "Other directory session",
    directory: AUTO_DIRECTORY,
    cost: 0,
    tokens: {},
    time: { created: 1787200000000, updated: 1787200000000 },
  },
  {
    id: "ses_mock_foreign_agent",
    title: "Imported Explore session",
    directory: MOCK_DIRECTORY,
    agent: "explore",
    permission: [],
    cost: 0,
    tokens: {},
    time: { created: 1787300000000, updated: 1787300000000, archived: 1787300001000 },
  },
  {
    id: "ses_mock_unknown_agent",
    title: "Imported session without agent metadata",
    directory: MOCK_DIRECTORY,
    permission: [],
    cost: 0,
    tokens: {},
    time: { created: 1787300100000, updated: 1787300100000, archived: 1787300101000 },
  },
  {
    id: "ses_mock_identity_mismatch",
    title: "Session with stale browser identity",
    directory: MOCK_DIRECTORY,
    agent: "build",
    permission: [],
    cost: 0,
    tokens: {},
    time: { created: 1787300050000, updated: 1787300050000, archived: 1787300051000 },
  },
  {
    id: PARENT_ID,
    title: "Parallel investigation",
    directory: SUBAGENT_DIRECTORY,
    agent: "build",
    model: { providerID: "anthropic", id: "claude-opus-5" },
    cost: 0.03,
    tokens: { input: 40, output: 200, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1787400000000, updated: 1787400006000 },
  },
  {
    id: CHILD_RUNNING,
    title: "Audit the parser",
    directory: SUBAGENT_DIRECTORY,
    parentID: PARENT_ID,
    agent: "explore",
    cost: 0.004,
    tokens: {},
    time: { created: 1787400001500, updated: 1787400001600 },
  },
  {
    id: CHILD_DONE,
    title: "Check the tests",
    directory: SUBAGENT_DIRECTORY,
    parentID: PARENT_ID,
    agent: "explore",
    cost: 0.002,
    tokens: {},
    time: { created: 1787400002500, updated: 1787400002900 },
  },
  {
    id: GRANDCHILD,
    title: "Reproduce the flake",
    directory: SUBAGENT_DIRECTORY,
    parentID: CHILD_DONE,
    agent: "explore",
    cost: 0,
    tokens: {},
    time: { created: 1787400002700, updated: 1787400002800 },
  },
  {
    id: CHILD_REPORTED,
    title: "Summarize the docs",
    directory: SUBAGENT_DIRECTORY,
    parentID: PARENT_ID,
    agent: "general",
    cost: 0.001,
    tokens: {},
    time: { created: 1787400003100, updated: 1787400003200 },
  },
  {
    id: CHILD_UNKNOWN,
    title: "Crawl the changelog",
    directory: SUBAGENT_DIRECTORY,
    parentID: PARENT_ID,
    agent: "general",
    cost: 0,
    tokens: {},
    time: { created: 1787400003500, updated: 1787400003500 },
  },
  {
    id: CHILD_FAILED,
    title: "Inspect the deployment",
    directory: SUBAGENT_DIRECTORY,
    parentID: PARENT_ID,
    agent: "explore",
    cost: 0.003,
    tokens: {},
    time: { created: 1787400004100, updated: 1787400004200 },
  },
  {
    id: CHILD_LAUNCHED,
    title: "Review dependency updates",
    directory: SUBAGENT_DIRECTORY,
    parentID: PARENT_ID,
    agent: "general",
    cost: 0,
    tokens: {},
    time: { created: 1787400004300, updated: 1787400004300 },
  },
  {
    id: "ses_mock_orphan",
    title: "Detached delegated session",
    directory: SUBAGENT_DIRECTORY,
    parentID: "ses_missing_parent",
    agent: "explore",
    cost: 0,
    tokens: {},
    time: { created: 1787390000000, updated: 1787390000000 },
  },
  {
    id: "ses_mock_share_failure",
    title: "Share service failure",
    directory: MOCK_DIRECTORY,
    cost: 0,
    tokens: {},
    time: { created: 1787200100000, updated: 1787200100000, archived: 1787200200000 },
  },
  {
    id: "ses_mock_share_api",
    title: "API share fixture",
    directory: MOCK_DIRECTORY,
    cost: 0,
    tokens: {},
    time: { created: 1787200250000, updated: 1787200250000 },
  },
  {
    id: "ses_mock_bad_share_url",
    title: "Unsafe share response",
    directory: MOCK_DIRECTORY,
    cost: 0,
    tokens: {},
    time: { created: 1787200300000, updated: 1787200300000, archived: 1787200400000 },
  },
];

const TODOS = [
  { content: "Read the existing server", status: "completed", priority: "high" },
  { content: "Add the route", status: "in_progress", priority: "high" },
  { content: "Write a test", status: "pending", priority: "medium" },
];

// Mirrors the checked-in and machine-global setting used by the real app.
// The Settings page exposes this value read-only.
let globalConfig: Record<string, unknown> = { subagent_depth: 3 };
let mcpServers: Record<string, unknown> = {
  github: { status: "connected" },
  docs: { status: "failed", error: "mock connection refused" },
  auth: { status: "needs_auth" },
  local: { status: "disabled" },
  registration: { status: "needs_client_registration", error: "register this client first" },
};
const skills = [
  { name: "browser-check", description: "Check a page in the browser.", location: "/Users/mock/.config/opencode/skills/browser-check/SKILL.md", content: "SECRET SKILL CONTENT" },
];
const customCommands = [
  { name: "verify", description: "Run project verification.", source: "command", agent: "build", model: "mock/model", subtask: false, template: "SECRET COMMAND TEMPLATE" },
];
let catalogRequests = 0;
const worktrees = [`${MOCK_DIRECTORY}.worktrees/fixture`];
interface MockPermission {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: { messageID: string; callID: string };
}

const permissionFixture = (): MockPermission => ({
  id: "perm_mock",
  sessionID: "ses_mock_done",
  permission: "bash",
  patterns: ["npm test"],
  metadata: { command: "npm test" },
  always: ["npm *"],
  tool: { messageID: "msg_mock", callID: "call_mock" },
});
const pendingPermissions = new Map<string, MockPermission[]>([
  [MOCK_DIRECTORY, [permissionFixture()]],
  [AUTO_DIRECTORY, []],
]);
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
const holdNextPolicyPatch = new Set<string>();
let heldPolicyPatch: { sessionID: string; release: () => void } | null = null;

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

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
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
    return json(res, 200, { healthy: true, version: "1.18.21" });
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
        { id: "openai", name: "OpenAI", models: {
          "gpt-5": { name: "GPT-5", modalities: { input: ["text", "image"] }, limit: { context: 128000, output: 16000 } },
          "gpt-5.6-sol": { name: "GPT-5.6 Sol", modalities: { input: ["text", "image"] }, limit: { context: 256000, output: 32000 } },
        } },
      ],
      default: { anthropic: "claude-opus-5" },
    });
  }
  if (pathname === "/experimental/tool/ids") {
    return directory === TOOL_FAILURE_DIRECTORY
      ? json(res, 503, { error: "mock discovery unavailable" })
      : json(res, 200, toolIDs);
  }
  if (pathname === "/agent") return json(res, 200, agents);
  if (pathname === "/experimental/capabilities") return json(res, 200, { backgroundSubagents: true });
  const promoteMatch = /^\/experimental\/session\/([^/]+)\/background$/.exec(pathname);
  if (promoteMatch && req.method === "POST") {
    const id = decodeURIComponent(promoteMatch[1]);
    // Mirrors the real contract: a bare boolean, false when nothing running
    // and synchronous was eligible for promotion.
    return json(res, 200, SESSIONS.some((s) => s.parentID === id && s.id === CHILD_RUNNING));
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
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {},
        always: Array.isArray(input.always) ? input.always.map(String) : [],
        ...(input.tool && typeof input.tool === "object" ? { tool: input.tool as { messageID: string; callID: string } } : {}),
      };
      const scope = directory ?? MOCK_DIRECTORY;
      pendingPermissions.set(scope, [...(pendingPermissions.get(scope) ?? []), permission]);
      emit("permission.asked", permission, scope);
      json(res, 201, permission);
    });
    return;
  }
  if (pathname === "/test/session-payloads") return json(res, 200, sessionPayloads);
  if (pathname === "/test/sharing/reset" && req.method === "POST") {
    for (const session of SESSIONS) delete session.share;
    return json(res, 200, true);
  }
  if (pathname === "/test/mobile/reset" && req.method === "POST") {
    messages.set("ses_mock_mobile", mobileMessages());
    mobileRunning = true;
    return json(res, 200, true);
  }
  if (pathname === "/test/mobile/idle" && req.method === "POST") {
    mobileRunning = false;
    emit("session.idle", { sessionID: "ses_mock_mobile" });
    return json(res, 200, true);
  }
  if (pathname === "/test/mobile/grow" && req.method === "POST") {
    const sessionMessages = messages.get("ses_mock_mobile") as Array<{ info?: { id?: string }; parts?: Array<{ type?: string; text?: string }> }>;
    const live = sessionMessages.find((message) => message.info?.id === "msg_mobile_live");
    const text = live?.parts?.find((part) => part.type === "text");
    if (text) text.text = `${hostileMarkdown}\n\nNew live activity from the running agent.`;
    emit("message.part.updated", { sessionID: "ses_mock_mobile", part: { id: "prt_mobile_live", messageID: "msg_mobile_live" } });
    return json(res, 200, true);
  }
  if (pathname === "/test/paginated/older-update" && req.method === "POST") {
    emit("message.part.updated", { sessionID: "ses_mock_paginated", part: { id: "prt_page_50", messageID: "msg_page_50" } });
    return json(res, 200, true);
  }
  if (pathname === "/test/paginated/pending-update" && req.method === "POST") {
    emit("message.part.updated", { sessionID: "ses_mock_paginated", part: { id: "prt_page_1", messageID: "msg_page_1" } });
    return json(res, 200, true);
  }
  if (pathname === "/test/paginated/newest-update" && req.method === "POST") {
    emit("message.part.updated", { sessionID: "ses_mock_paginated", part: { id: "prt_page_225", messageID: "msg_page_225" } });
    return json(res, 200, true);
  }
  if (pathname === "/test/session-policy") {
    const session = SESSIONS.find((candidate) => candidate.id === url.searchParams.get("id"));
    return session ? json(res, 200, policyProbe(session)) : unknownError(res);
  }
  if (pathname === "/test/hold-next-policy-patch" && req.method === "POST") {
    void body(req).then((input) => {
      holdNextPolicyPatch.add(String(input.sessionID));
      json(res, 200, true);
    });
    return;
  }
  if (pathname === "/test/policy-patch-pending") {
    return json(res, 200, { pending: heldPolicyPatch?.sessionID === url.searchParams.get("id") });
  }
  if (pathname === "/test/release-policy-patch" && req.method === "POST") {
    if (heldPolicyPatch?.sessionID === url.searchParams.get("id")) heldPolicyPatch.release();
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
    const scope = directory ?? MOCK_DIRECTORY;
    pendingPermissions.set(scope, scope === MOCK_DIRECTORY ? [permissionFixture()] : []);
    return json(res, 200, true);
  }

  if (pathname === "/test/catalog-requests" && req.method === "POST") {
    catalogRequests = 0;
    return json(res, 200, true);
  }
  if (pathname === "/test/catalog-requests") return json(res, 200, { count: catalogRequests });
  if (pathname === "/mcp" && req.method === "GET") return json(res, 200, mcpServers);
  if (pathname === "/skill" && req.method === "GET") {
    catalogRequests += 1;
    return json(res, 200, skills);
  }
  if (pathname === "/command" && req.method === "GET") {
    catalogRequests += 1;
    return json(res, 200, customCommands);
  }
  const mcpMatch = /^\/mcp\/([^/]+)\/(connect|disconnect)$/.exec(pathname);
  if (mcpMatch && req.method === "POST") {
    const name = decodeURIComponent(mcpMatch[1]);
    if (!(name in mcpServers)) return json(res, 404, { error: "unknown MCP" });
    mcpServers = { ...mcpServers, [name]: { status: mcpMatch[2] === "connect" ? "connected" : "disabled" } };
    return json(res, 200, true);
  }

  if (pathname === "/lsp") return json(res, 200, { typescript: { status: "connected" } });
  if (pathname === "/permission") return json(res, 200, pendingPermissions.get(directory ?? MOCK_DIRECTORY) ?? []);
  const permissionReply = /^\/permission\/([^/]+)\/reply$/.exec(pathname);
  if (permissionReply && req.method === "POST") {
    const id = decodeURIComponent(permissionReply[1]);
    const scope = directory ?? MOCK_DIRECTORY;
    const scopedPermissions = pendingPermissions.get(scope) ?? [];
    const permission = scopedPermissions.find((request) => request.id === id);
    if (id.startsWith("perm_fail")) return json(res, 500, { error: "mock permission reply failed" });
    if (!permission) return json(res, 404, { error: "permission request not found" });
    void body(req).then((input) => {
      permissionReplies.push({ id, reply: input.reply });
      pendingPermissions.set(scope, scopedPermissions.filter((request) => request.id !== id));
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
    return json(res, 200, {
      ses_mock_running: { type: "busy" },
      [CHILD_RUNNING]: { type: "busy" },
      ...(mobileRunning ? { ses_mock_mobile: { type: "busy" } } : {}),
    });
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
        permission: [],
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
        if (input.tools && typeof input.tools === "object" && Object.keys(input.tools).length > 0) {
          session.permission = [
            ...((session.permission as PermissionRule[] | undefined) ?? []),
            ...Object.entries(input.tools).map(([permission, enabled]) => ({
              permission,
              pattern: "*",
              action: enabled === true ? "allow" : "deny",
            })),
          ];
        }
        promptPayloads.push({ ...input, sessionID: id, effectivePolicy: policyProbe(session) });
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
    if (rest === "/share") {
      if (!session) return unknownError(res);
      if (req.method === "POST") {
        if (id === "ses_mock_share_failure") return json(res, 503, { error: "mock share service unavailable" });
        if (id === "ses_mock_bad_share_url") {
          session.share = { url: "javascript:alert(1)" };
          return json(res, 200, { ...session, secret: "must-not-reach-browser" });
        }
        session.share = { url: `https://share.e2e.example.test/s/${encodeURIComponent(id)}` };
        return json(res, 200, { ...session, secret: "must-not-reach-browser" });
      }
      if (req.method === "DELETE") {
        delete session.share;
        return json(res, 200, session);
      }
    }
    if (!session) return unknownError(res);

    if (rest === "") {
      if (req.method === "DELETE") return json(res, 200, true);
      if (req.method === "PATCH") {
        if (directory === POLICY_FAILURE_DIRECTORY) return json(res, 503, { error: "mock policy activation failed" });
        void body(req).then(async (patch) => {
          if (Array.isArray(patch.permission)) {
            session.permission = [
              ...((session.permission as PermissionRule[] | undefined) ?? []),
              ...(patch.permission as PermissionRule[]),
            ];
          }
          if (holdNextPolicyPatch.delete(id)) {
            await new Promise<void>((resolve) => {
              heldPolicyPatch = { sessionID: id, release: resolve };
            });
            heldPolicyPatch = null;
          }
          json(res, 200, session);
        });
        return;
      }
      return json(res, 200, session);
    }
    if (rest === "/message") {
      const all = messages.get(id) ?? [];
      const requestedLimit = Number(url.searchParams.get("limit") ?? 0);
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : all.length;
      const requestedBefore = Number(url.searchParams.get("before") ?? all.length);
      const end = Number.isInteger(requestedBefore) && requestedBefore >= 0
        ? Math.min(requestedBefore, all.length)
        : all.length;
      const start = Math.max(0, end - limit);
      const nextCursor = start > 0 ? String(start) : null;
      return json(res, 200, all.slice(start, end), nextCursor ? { "X-Next-Cursor": nextCursor } : {});
    }
    if (rest === "/children") {
      return json(res, 200, SESSIONS.filter((candidate) => candidate.parentID === id));
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
