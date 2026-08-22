import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.hoisted(() => vi.fn());

vi.mock("../server/opencode/client.js", () => ({ request: requestMock }));

import {
  prompt,
  SessionAgentIdentityError,
} from "../server/opencode/sessions.js";

const config = { baseUrl: "http://opencode.test" };
const directory = "/tmp/project";
const sessionID = "ses_test";
const tools = ["read", "bash", "edit"];
const buildRules = [
  { permission: "*", pattern: "*", action: "ask" },
  { permission: "read", pattern: "*", action: "allow" },
  { permission: "edit", pattern: "*", action: "allow" },
] as const;
const agents = [
  { name: "plan", permission: buildRules },
  { name: "build", permission: buildRules },
];

function arrange(input: {
  session: { agent?: string; permission?: unknown[] };
  messages?: Array<{ info?: { role?: string; agent?: string } }>;
}) {
  requestMock.mockImplementation(async (_config, path: string, options?: { method?: string; body?: { permission?: unknown[]; agent?: string }; query?: Record<string, unknown> }) => {
    if (typeof path !== "string") throw new Error(`request path missing: ${JSON.stringify([_config, path, options])}`);
    if (path === "/session/status") return { [sessionID]: { type: "idle" } };
    if (path === "/experimental/tool/ids") return tools;
    if (path === "/agent") return agents;
    if (path.endsWith("/message")) return input.messages ?? [];
    if (path === `/session/${sessionID}` && options?.method === "PATCH") return input.session;
    if (path === `/session/${sessionID}`) return input.session;
    if (path.endsWith("/prompt_async")) return undefined;
    throw new Error(`unexpected request ${path}`);
  });
}

function mutations() {
  return requestMock.mock.calls.filter(([, path, options]) =>
    options?.method === "PATCH" || String(path).endsWith("/prompt_async"));
}

describe("session mode policy identity safety", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it.each(["explore", "sisyphus"])("rejects foreign upstream agent %s before mutating or prompting", async (agent) => {
    arrange({
      session: { agent, permission: [] },
      messages: [{ info: { role: "user", agent } }],
    });

    await expect(prompt(config, directory, sessionID, { text: "change it", mode: "build", confirmContinue: true }))
      .rejects.toMatchObject<Partial<SessionAgentIdentityError>>({
        code: "SESSION_AGENT_UNSUPPORTED",
        agent,
      });
    expect(mutations()).toEqual([]);
  });

  it("accepts the newest user-selected mode after an explicit upstream switch", async () => {
    arrange({
      session: { agent: "build", permission: [] },
      messages: [
        { info: { role: "user", agent: "explore" } },
        { info: { role: "user", agent: "build" } },
      ],
    });

    await expect(prompt(config, directory, sessionID, { text: "continue", mode: "build", confirmContinue: true }))
      .resolves.toMatchObject({ state: "starting" });
  });

  it("rejects unknown identity honestly before mutating or prompting", async () => {
    arrange({
      session: { permission: [] },
      messages: [{ info: { role: "assistant", agent: "compaction" } }],
    });

    await expect(prompt(config, directory, sessionID, { text: "change it", mode: "build", confirmContinue: true }))
      .rejects.toMatchObject<Partial<SessionAgentIdentityError>>({ code: "SESSION_AGENT_UNKNOWN" });
    expect(mutations()).toEqual([]);
  });

  it.each(["plan", "build"] as const)("prompts an explicitly %s session", async (mode) => {
    arrange({ session: { agent: mode, permission: [] } });

    await prompt(config, directory, sessionID, { text: "continue", mode, confirmContinue: true });

    const promptCall = requestMock.mock.calls.find(([, path]) => String(path).endsWith("/prompt_async"));
    expect(promptCall?.[2]?.body).toMatchObject({ agent: mode });
    expect(requestMock.mock.calls.some(([, path, options]) =>
      path === `/session/${sessionID}` && options?.method === "PATCH")).toBe(mode === "plan");
    expect(requestMock.mock.calls.find(([, path]) => path.endsWith("/message"))?.[2]?.query)
      .toEqual({ limit: 100 });
  });

  it.each(["plan", "build"] as const)("ignores a compaction assistant after %s", async (mode) => {
    arrange({
      session: { agent: mode, permission: [] },
      messages: [
        { info: { role: "user", agent: mode } },
        { info: { role: "user", agent: mode } },
        { info: { role: "assistant", agent: "compaction" } },
      ],
    });

    await expect(prompt(config, directory, sessionID, { text: "continue", mode, confirmContinue: true }))
      .resolves.toMatchObject({ state: "starting" });
  });

  it("restores Build after Plan and avoids repeating the same appended suffix", async () => {
    const planRules = [
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "edit", pattern: "*", action: "deny" },
    ];
    arrange({
      session: { agent: "plan", permission: planRules },
      messages: [
        { info: { role: "user", agent: "plan" } },
        { info: { role: "user", agent: "plan" } },
        { info: { role: "assistant", agent: "compaction" } },
      ],
    });

    await prompt(config, directory, sessionID, { text: "implement", mode: "build", confirmContinue: true });

    const patch = requestMock.mock.calls.find(([, path, options]) =>
      path === `/session/${sessionID}` && options?.method === "PATCH");
    expect(patch?.[2]?.body).toEqual({
      permission: [
        { permission: "read", pattern: "*", action: "ask" },
        { permission: "read", pattern: "*", action: "allow" },
        { permission: "bash", pattern: "*", action: "ask" },
        { permission: "edit", pattern: "*", action: "ask" },
        { permission: "edit", pattern: "*", action: "allow" },
      ],
    });

    requestMock.mockClear();
    arrange({
      session: { agent: "plan", permission: [...planRules, ...(patch?.[2]?.body.permission ?? [])] },
      messages: [
        { info: { role: "user", agent: "plan" } },
        { info: { role: "assistant", agent: "compaction" } },
      ],
    });
    await prompt(config, directory, sessionID, { text: "continue", mode: "build", confirmContinue: true });
    expect(requestMock.mock.calls.some(([, path, options]) =>
      path === `/session/${sessionID}` && options?.method === "PATCH")).toBe(false);
  });
});
