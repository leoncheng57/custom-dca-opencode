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
  // subagent_depth remains readable through publicSettings, but it is authored
  // in opencode.json rather than through the global settings form.
  const allowed = new Set(["model", "small_model", "default_agent", "compaction"]);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) throw new Error(`unsupported setting '${key}'`);
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

export interface ModelSelection {
  providerID: string;
  modelID: string;
  variant?: string;
}

export interface PublicModel extends ModelSelection {
  providerName: string;
  name: string;
  status: string;
  limits: { context?: number; output?: number };
  capabilities: { image: boolean; reasoning: boolean };
  variants: string[];
}

export interface PublicModelCatalogue {
  models: PublicModel[];
  defaultModel?: ModelSelection;
}

const MAX_PROVIDERS = 50;
const MAX_MODELS = 500;
const MAX_VARIANTS = 20;
const MODEL_CACHE_MS = 15_000;
const modelCatalogueCache = new Map<string, { expires: number; value: Promise<PublicModelCatalogue> }>();

export class ModelCatalogueError extends Error {
  constructor() {
    super("Model catalogue is unavailable; no model selection was sent");
    this.name = "ModelCatalogueError";
  }
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function safeIdentifier(value: unknown): string | undefined {
  const text = optionalString(value);
  return text && text.length <= 200 ? text : undefined;
}

function modelReference(value: unknown): ModelSelection | undefined {
  if (typeof value !== "string") return undefined;
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1) return undefined;
  const providerID = safeIdentifier(value.slice(0, separator));
  const modelID = safeIdentifier(value.slice(separator + 1));
  return providerID && modelID ? { providerID, modelID } : undefined;
}

/** Build a new allowlisted object; no upstream provider/model object is ever spread. */
export function publicModelCatalogue(value: unknown, configuredModel?: unknown): PublicModelCatalogue {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const providers = Array.isArray(source.providers) ? source.providers.slice(0, MAX_PROVIDERS) : [];
  const models: PublicModel[] = [];

  for (const rawProvider of providers) {
    if (!rawProvider || typeof rawProvider !== "object" || models.length >= MAX_MODELS) continue;
    const provider = rawProvider as Record<string, unknown>;
    const providerID = safeIdentifier(provider.id);
    if (!providerID) continue;
    const providerName = safeIdentifier(provider.name) ?? providerID;
    const rawModels = provider.models && typeof provider.models === "object"
      ? Object.entries(provider.models as Record<string, unknown>)
      : [];

    for (const [key, rawModel] of rawModels) {
      if (models.length >= MAX_MODELS || !rawModel || typeof rawModel !== "object") break;
      const model = rawModel as Record<string, unknown>;
      const modelID = safeIdentifier(model.id) ?? safeIdentifier(key);
      if (!modelID) continue;
      const limit = model.limit && typeof model.limit === "object"
        ? model.limit as Record<string, unknown>
        : {};
      const modalities = model.modalities && typeof model.modalities === "object"
        ? model.modalities as Record<string, unknown>
        : {};
      const capabilities = model.capabilities && typeof model.capabilities === "object"
        ? model.capabilities as Record<string, unknown>
        : {};
      const capabilityInput = capabilities.input && typeof capabilities.input === "object"
        ? capabilities.input as Record<string, unknown>
        : {};
      const inputs = Array.isArray(modalities.input) ? modalities.input : [];
      const variants = model.variants && typeof model.variants === "object"
        ? Object.keys(model.variants).filter((item) => safeIdentifier(item)).slice(0, MAX_VARIANTS).sort()
        : [];
      const context = positiveNumber(limit.context);
      const output = positiveNumber(limit.output);
      const status = model.enabled === false
        ? "disabled"
        : safeIdentifier(model.status)?.toLowerCase() ?? "available";

      models.push({
        providerID,
        modelID,
        providerName,
        name: safeIdentifier(model.name) ?? modelID,
        status,
        limits: {
          ...(context ? { context } : {}),
          ...(output ? { output } : {}),
        },
        capabilities: {
          image: model.attachment === true || inputs.includes("image") || capabilityInput.image === true,
          reasoning: model.reasoning === true || capabilities.reasoning === true,
        },
        variants,
      });
    }
  }

  models.sort((a, b) =>
    a.providerName.localeCompare(b.providerName) || a.name.localeCompare(b.name) || a.modelID.localeCompare(b.modelID));
  const configured = modelReference(configuredModel);
  const defaults = source.default && typeof source.default === "object"
    ? source.default as Record<string, unknown>
    : {};
  const fallback = Object.entries(defaults)
    .map(([providerID, modelID]) => ({ providerID, modelID: safeIdentifier(modelID) }))
    .find((item): item is ModelSelection => Boolean(item.modelID));
  const defaultModel = [configured, fallback].find((candidate) =>
    candidate && models.some((model) => model.providerID === candidate.providerID && model.modelID === candidate.modelID));
  return { models, ...(defaultModel ? { defaultModel } : {}) };
}

export async function getModelCatalogue(
  config: OpencodeConfig,
  directory: string,
): Promise<PublicModelCatalogue> {
  const now = Date.now();
  const cached = modelCatalogueCache.get(directory);
  if (cached && cached.expires > now) return cached.value;
  const value = Promise.all([
    request<unknown>(config, "/config/providers", { directory }),
    request<Record<string, unknown>>(config, "/config", { directory }),
  ])
    .then(([catalogue, effective]) => publicModelCatalogue(catalogue, effective.model))
    .catch(() => {
      modelCatalogueCache.delete(directory);
      throw new ModelCatalogueError();
    });
  modelCatalogueCache.set(directory, { expires: now + MODEL_CACHE_MS, value });
  return value;
}

export function isSelectableModel(catalogue: PublicModelCatalogue, selection: ModelSelection): boolean {
  return catalogue.models.some((model) =>
    model.providerID === selection.providerID &&
    model.modelID === selection.modelID &&
    model.status !== "disabled" &&
    model.status !== "unavailable" &&
    (!selection.variant || model.variants.includes(selection.variant)));
}

export async function getModelContextLimit(
  config: OpencodeConfig,
  directory: string,
  providerID: string,
  modelID: string,
): Promise<number | null> {
  const catalogue = await getModelCatalogue(config, directory);
  return catalogue.models.find((model) =>
    model.providerID === providerID && model.modelID === modelID)?.limits.context ?? null;
}
