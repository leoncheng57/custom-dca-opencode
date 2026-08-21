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

export async function loadCatalog(config: OpencodeConfig, directory: string): Promise<CatalogResponse> {
  const [servers, skills, commands] = await Promise.all([
    request<unknown>(config, "/mcp", { directory }),
    request<unknown>(config, "/skill", { directory }),
    request<unknown>(config, "/command", { directory }),
  ]);
  return {
    servers: parseMcpServers(servers),
    skills: parseSkills(skills),
    commands: parseCommands(commands),
    refreshedAt: new Date().toISOString(),
  };
}
