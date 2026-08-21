import { request, type OpencodeConfig } from "./client.js";

export interface AppSettings {
  model?: string;
  small_model?: string;
  default_agent?: string;
  subagent_depth?: number;
  compaction?: {
    auto?: boolean;
    prune?: boolean;
    reserved?: number;
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** Return only settings safe to expose; provider/MCP secrets are never copied. */
export function publicSettings(value: unknown): AppSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const compactionSource =
    source.compaction && typeof source.compaction === "object"
      ? (source.compaction as Record<string, unknown>)
      : {};
  const compaction: NonNullable<AppSettings["compaction"]> = {};
  if (typeof compactionSource.auto === "boolean") compaction.auto = compactionSource.auto;
  if (typeof compactionSource.prune === "boolean") compaction.prune = compactionSource.prune;
  const reserved = optionalCount(compactionSource.reserved);
  if (reserved !== undefined) compaction.reserved = reserved;

  const settings: AppSettings = {};
  const model = optionalString(source.model);
  const smallModel = optionalString(source.small_model);
  const defaultAgent = optionalString(source.default_agent);
  const depth = optionalCount(source.subagent_depth);
  if (model) settings.model = model;
  if (smallModel) settings.small_model = smallModel;
  if (defaultAgent) settings.default_agent = defaultAgent;
  if (depth !== undefined) settings.subagent_depth = depth;
  if (Object.keys(compaction).length) settings.compaction = compaction;
  return settings;
}

export function validateSettingsPatch(value: unknown): AppSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("settings patch must be an object");
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set(["model", "small_model", "default_agent", "subagent_depth", "compaction"]);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) throw new Error(`unsupported setting '${key}'`);
  }
  if ("subagent_depth" in source && optionalCount(source.subagent_depth) === undefined) {
    throw new Error("subagent_depth must be a non-negative integer");
  }
  if ("compaction" in source) {
    if (!source.compaction || typeof source.compaction !== "object" || Array.isArray(source.compaction)) {
      throw new Error("compaction must be an object");
    }
    const compaction = source.compaction as Record<string, unknown>;
    for (const key of Object.keys(compaction)) {
      if (!new Set(["auto", "prune", "reserved"]).has(key)) {
        throw new Error(`unsupported compaction setting '${key}'`);
      }
    }
    if ("auto" in compaction && typeof compaction.auto !== "boolean") {
      throw new Error("compaction.auto must be boolean");
    }
    if ("prune" in compaction && typeof compaction.prune !== "boolean") {
      throw new Error("compaction.prune must be boolean");
    }
    if ("reserved" in compaction && optionalCount(compaction.reserved) === undefined) {
      throw new Error("compaction.reserved must be a non-negative integer");
    }
  }
  return publicSettings(source);
}

export async function getGlobalSettings(config: OpencodeConfig): Promise<AppSettings> {
  return publicSettings(await request<unknown>(config, "/global/config"));
}

export async function patchGlobalSettings(
  config: OpencodeConfig,
  patch: AppSettings,
): Promise<AppSettings> {
  return publicSettings(
    await request<unknown>(config, "/global/config", { method: "PATCH", body: patch }),
  );
}

export async function getEffectivePermissions(
  config: OpencodeConfig,
  directory: string,
): Promise<unknown> {
  const effective = await request<Record<string, unknown>>(config, "/config", { directory });
  return effective.permission ?? null;
}

interface ProviderCatalogue {
  providers?: Array<{
    id?: string;
    models?: Record<string, { limit?: { context?: number } }>;
  }>;
}

export async function getModelContextLimit(
  config: OpencodeConfig,
  directory: string,
  providerID: string,
  modelID: string,
): Promise<number | null> {
  const catalogue = await request<ProviderCatalogue>(config, "/config/providers", { directory });
  const provider = catalogue.providers?.find((item) => item.id === providerID);
  const limit = provider?.models?.[modelID]?.limit?.context;
  return typeof limit === "number" && limit > 0 ? limit : null;
}
