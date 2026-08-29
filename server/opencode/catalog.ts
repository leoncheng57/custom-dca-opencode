import { request, type OpencodeConfig } from "./client.js";

const MAX_ITEMS = 500;
const MAX_NAME = 128;
const MAX_DESCRIPTION = 1_000;
const MAX_METADATA = 240;
const MAX_ERROR = 1_000;

export interface CatalogSkill {
  name: string;
  description: string;
  location?: string;
}

export interface CatalogCommand {
  name: string;
  description?: string;
  source?: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
}

export type CatalogMcpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string };

export interface CatalogResponse {
  servers: Record<string, CatalogMcpStatus>;
  skills: CatalogSkill[];
  commands: CatalogCommand[];
  /**
   * Tool ids the connected process reports as registered and therefore
   * invocable (issue #55).
   *
   * Verified against OpenCode 1.18.23: this registry contains **built-in tools
   * only**. An MCP server reporting `connected` contributes nothing here, so
   * there is no endpoint anywhere that enumerates a connected server's tools.
   * That is precisely why "connected" must not be rendered as "its tools work"
   * — the app genuinely cannot know.
   *
   * `null` when the registry could not be read, which is distinct from an
   * empty registry and must not be shown as "no tools".
   */
  tools: string[] | null;
  refreshedAt: string;
}

function objectOf(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`invalid ${label} response`);
  return value as Record<string, unknown>;
}

function arrayOf(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error(`invalid ${label} response`);
  return value;
}

function stringOf(value: unknown, label: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new Error(`invalid ${label}`);
    return undefined;
  }
  if (typeof value !== "string" || value.length > max || (required && value.trim().length === 0)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function safeLocation(value: unknown): string | undefined {
  const location = stringOf(value, "skill location", 2_000);
  if (!location) return undefined;
  const parts = location.split(/[\\/]+/).filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) throw new Error("invalid skill location");
  return parts.slice(-2).join("/").slice(0, MAX_METADATA) || undefined;
}

export function parseSkills(value: unknown): CatalogSkill[] {
  return arrayOf(value, "skill catalogue").map((item, index) => {
    const skill = objectOf(item, `skill ${index}`);
    const location = safeLocation(skill.location);
    return {
      name: stringOf(skill.name, `skill ${index} name`, MAX_NAME, true)!,
      description: stringOf(skill.description, `skill ${index} description`, MAX_DESCRIPTION, true)!,
      ...(location ? { location } : {}),
    };
  });
}

export function parseCommands(value: unknown): CatalogCommand[] {
  return arrayOf(value, "command catalogue").map((item, index) => {
    const command = objectOf(item, `command ${index}`);
    const optional = (key: "description" | "source" | "agent" | "model", max: number) =>
      stringOf(command[key], `command ${index} ${key}`, max);
    const description = optional("description", MAX_DESCRIPTION);
    const source = optional("source", MAX_METADATA);
    const agent = optional("agent", MAX_NAME);
    const model = optional("model", MAX_NAME);
    if (command.subtask !== undefined && typeof command.subtask !== "boolean") throw new Error(`invalid command ${index} subtask`);
    return {
      name: stringOf(command.name, `command ${index} name`, MAX_NAME, true)!,
      ...(description ? { description } : {}),
      ...(source ? { source } : {}),
      ...(agent ? { agent } : {}),
      ...(model ? { model } : {}),
      ...(command.subtask !== undefined ? { subtask: command.subtask } : {}),
    };
  });
}

export function parseMcpServers(value: unknown): Record<string, CatalogMcpStatus> {
  const input = objectOf(value, "MCP status");
  const entries = Object.entries(input);
  if (entries.length > MAX_ITEMS) throw new Error("invalid MCP status response");
  return Object.fromEntries(entries.map(([name, raw]) => {
    if (!name || name.length > MAX_NAME) throw new Error("invalid MCP server name");
    const server = objectOf(raw, `MCP server ${name}`);
    const status = server.status;
    if (status === "connected" || status === "disabled" || status === "needs_auth") return [name, { status }];
    if (status === "failed" || status === "needs_client_registration") {
      return [name, { status, error: stringOf(server.error, `MCP server ${name} error`, MAX_ERROR, true)! }];
    }
    throw new Error(`invalid MCP server ${name} status`);
  }));
}

/**
 * Registered tool ids, or null when the registry is unreadable.
 *
 * Unlike the other parsers this never throws: the tool registry is supporting
 * evidence, and losing it must not blank the MCP, skill, and command lists that
 * are the point of the catalogue.
 */
export function parseToolIDs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim() || item.length > MAX_NAME) return null;
    ids.push(item);
  }
  return ids;
}

export async function loadCatalog(config: OpencodeConfig, directory: string): Promise<CatalogResponse> {
  const [servers, skills, commands, tools] = await Promise.all([
    request<unknown>(config, "/mcp", { directory }),
    request<unknown>(config, "/skill", { directory }),
    request<unknown>(config, "/command", { directory }),
    // Supporting evidence only, so a failure degrades to `null` rather than
    // failing the whole catalogue.
    request<unknown>(config, "/experimental/tool/ids", { directory }).catch(() => null),
  ]);
  return {
    servers: parseMcpServers(servers),
    skills: parseSkills(skills),
    commands: parseCommands(commands),
    tools: parseToolIDs(tools),
    refreshedAt: new Date().toISOString(),
  };
}
