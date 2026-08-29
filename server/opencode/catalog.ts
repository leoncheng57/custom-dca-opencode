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

/**
 * A single entry dropped from an otherwise-valid catalogue because one of
 * its fields failed validation (issue #297). `name` is included only when
 * it independently validates -- so an omission report can never surface an
 * oversized or malformed name just because some OTHER field on that same
 * entry was the actual problem.
 */
export interface CatalogOmission {
  index: number;
  name?: string;
  reason: string;
}

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
  /**
   * Entries dropped from `skills`/`commands`/`servers` because a single
   * field on that entry failed validation (issue #297). The *container*
   * upstream returned (the array or status object) is still trustworthy —
   * only these individual entries were excluded — so an empty list here
   * means exactly what it says: nothing was dropped, not "unknown."
   */
  omitted: {
    skills: CatalogOmission[];
    commands: CatalogOmission[];
    servers: CatalogOmission[];
  };
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
  const location = stringOf(value, "location", 2_000);
  if (!location) return undefined;
  const parts = location.split(/[\\/]+/).filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) throw new Error("invalid location");
  return parts.slice(-2).join("/").slice(0, MAX_METADATA) || undefined;
}

/**
 * A best-effort, always-safe preview of an entry's name for an omission
 * report. Never throws, and only returns a value that would itself have
 * passed the real (required, ≤`MAX_NAME`) name validation — so a report can
 * never surface an oversized or malformed name just because some other
 * field on that entry is what actually failed.
 */
function previewName(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_NAME || value.trim().length === 0) return undefined;
  return value;
}

type Attempt<T> = { ok: true; value: T } | { ok: false; omission: CatalogOmission };

/**
 * Runs `fn` and isolates a thrown error into a `CatalogOmission` instead of
 * letting it propagate. This is the container/entry boundary for issue #297:
 * `arrayOf`/`objectOf` at the *container* level (is this even a list? an
 * object? too many entries?) still throw and reject the whole response —
 * that indicates the upstream response is fundamentally malformed, not that
 * one entry among many is bad. Everything validated *inside* `fn` for a
 * single already-contained entry is caught here instead, so one bad
 * description or status cannot blank an otherwise-valid catalogue.
 */
function attempt<T>(index: number, name: string | undefined, fn: () => T): Attempt<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, omission: { index, ...(name ? { name } : {}), reason: error instanceof Error ? error.message : "invalid entry" } };
  }
}

export interface ParsedSkills {
  skills: CatalogSkill[];
  omitted: CatalogOmission[];
}

export function parseSkills(value: unknown): ParsedSkills {
  const items = arrayOf(value, "skill catalogue");
  const skills: CatalogSkill[] = [];
  const omitted: CatalogOmission[] = [];
  items.forEach((item, index) => {
    const rawName = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>).name : undefined;
    const result = attempt<CatalogSkill>(index, previewName(rawName), () => {
      const skill = objectOf(item, "skill");
      const location = safeLocation(skill.location);
      return {
        name: stringOf(skill.name, "name", MAX_NAME, true)!,
        description: stringOf(skill.description, "description", MAX_DESCRIPTION, true)!,
        ...(location ? { location } : {}),
      };
    });
    if (result.ok) skills.push(result.value);
    else omitted.push(result.omission);
  });
  return { skills, omitted };
}

export interface ParsedCommands {
  commands: CatalogCommand[];
  omitted: CatalogOmission[];
}

export function parseCommands(value: unknown): ParsedCommands {
  const items = arrayOf(value, "command catalogue");
  const commands: CatalogCommand[] = [];
  const omitted: CatalogOmission[] = [];
  items.forEach((item, index) => {
    const rawName = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>).name : undefined;
    const result = attempt<CatalogCommand>(index, previewName(rawName), () => {
      const command = objectOf(item, "command");
      const optional = (key: "description" | "source" | "agent" | "model", max: number) =>
        stringOf(command[key], key, max);
      const description = optional("description", MAX_DESCRIPTION);
      const source = optional("source", MAX_METADATA);
      const agent = optional("agent", MAX_NAME);
      const model = optional("model", MAX_NAME);
      if (command.subtask !== undefined && typeof command.subtask !== "boolean") throw new Error("invalid subtask");
      return {
        name: stringOf(command.name, "name", MAX_NAME, true)!,
        ...(description ? { description } : {}),
        ...(source ? { source } : {}),
        ...(agent ? { agent } : {}),
        ...(model ? { model } : {}),
        ...(command.subtask !== undefined ? { subtask: command.subtask } : {}),
      };
    });
    if (result.ok) commands.push(result.value);
    else omitted.push(result.omission);
  });
  return { commands, omitted };
}

export interface ParsedMcpServers {
  servers: Record<string, CatalogMcpStatus>;
  omitted: CatalogOmission[];
}

export function parseMcpServers(value: unknown): ParsedMcpServers {
  const input = objectOf(value, "MCP status");
  const entries = Object.entries(input);
  if (entries.length > MAX_ITEMS) throw new Error("invalid MCP status response");
  const servers: Record<string, CatalogMcpStatus> = {};
  const omitted: CatalogOmission[] = [];
  entries.forEach(([name, raw], index) => {
    const result = attempt<CatalogMcpStatus>(index, previewName(name), () => {
      if (!name || name.length > MAX_NAME) throw new Error("invalid name");
      const server = objectOf(raw, "MCP server");
      const status = server.status;
      if (status === "connected" || status === "disabled" || status === "needs_auth") return { status };
      if (status === "failed" || status === "needs_client_registration") {
        return { status, error: stringOf(server.error, "error", MAX_ERROR, true)! };
      }
      throw new Error("invalid status");
    });
    if (result.ok) servers[name] = result.value;
    else omitted.push(result.omission);
  });
  return { servers, omitted };
}

/**
 * Registered tool ids, or null when the registry is unreadable.
 *
 * Unlike the other parsers this never throws: the tool registry is
 * supporting evidence, and losing it must not blank the MCP, skill, and
 * command lists that are the actual point of the catalogue.
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

/**
 * Operator-visible log line per dropped entry, beside the API's own
 * `omitted` field, so a deploy-refresh tailing stderr notices a degraded
 * catalogue without anyone opening the Catalog panel.
 */
export function logOmissions(kind: "skill" | "command" | "MCP server", omitted: CatalogOmission[]): void {
  for (const entry of omitted) {
    console.warn(`[catalog] dropped ${kind} ${entry.index}${entry.name ? ` (${entry.name})` : ""}: ${entry.reason}`);
  }
}

export async function loadCatalog(config: OpencodeConfig, directory: string): Promise<CatalogResponse> {
  const [serversRaw, skillsRaw, commandsRaw, tools] = await Promise.all([
    request<unknown>(config, "/mcp", { directory }),
    request<unknown>(config, "/skill", { directory }),
    request<unknown>(config, "/command", { directory }),
    // Supporting evidence only, so a failure degrades to `null` rather than
    // failing the whole catalogue.
    request<unknown>(config, "/experimental/tool/ids", { directory }).catch(() => null),
  ]);
  const { servers, omitted: serversOmitted } = parseMcpServers(serversRaw);
  const { skills, omitted: skillsOmitted } = parseSkills(skillsRaw);
  const { commands, omitted: commandsOmitted } = parseCommands(commandsRaw);
  logOmissions("skill", skillsOmitted);
  logOmissions("command", commandsOmitted);
  logOmissions("MCP server", serversOmitted);
  return {
    servers,
    skills,
    commands,
    tools: parseToolIDs(tools),
    omitted: { skills: skillsOmitted, commands: commandsOmitted, servers: serversOmitted },
    refreshedAt: new Date().toISOString(),
  };
}
