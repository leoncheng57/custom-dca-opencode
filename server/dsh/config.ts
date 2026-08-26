import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

export interface DshPreset {
  id: string;
  label: string;
  provider: string;
  model: string;
  maxTokens?: number;
  cordis: string;
  fingerprint: string;
}

export interface DshWorkspace {
  id: string;
  label: string;
  directory: string;
}

export interface DshConfig {
  enabled: boolean;
  configured: boolean;
  python: string;
  bridgeScript: string;
  sessionRoot: string;
  ledgerFile: string;
  presets: DshPreset[];
  workspaces: DshWorkspace[];
  errors: string[];
}

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function absolute(value: unknown): string | null {
  return typeof value === "string" && path.isAbsolute(value) ? path.normalize(value) : null;
}

export function readDshConfig(env: NodeJS.ProcessEnv = process.env): DshConfig {
  const enabled = env.DSH_EXPERIMENT_ENABLED === "true";
  const errors: string[] = [];
  const root = path.resolve(env.DSH_STATE_DIR || ".state/dsh");
  let rawPresets: unknown = [];
  let rawWorkspaces: unknown = [];
  try {
    rawPresets = JSON.parse(env.DSH_PRESETS_JSON || "[]");
  } catch {
    errors.push("DSH_PRESETS_JSON must be valid JSON");
  }
  try {
    rawWorkspaces = JSON.parse(env.DSH_WORKSPACES_JSON || "[]");
  } catch {
    errors.push("DSH_WORKSPACES_JSON must be valid JSON");
  }

  const presets: DshPreset[] = [];
  if (!Array.isArray(rawPresets)) errors.push("DSH_PRESETS_JSON must be an array");
  else for (const candidate of rawPresets) {
    const item = candidate as Record<string, unknown>;
    const cordisInput = absolute(item.cordis);
    if (!SAFE_ID.test(String(item.id ?? "")) || typeof item.label !== "string" ||
        typeof item.provider !== "string" || typeof item.model !== "string" || !cordisInput ||
        item.mode !== "read-only" || !/^[a-f0-9]{64}$/.test(String(item.sha256 ?? ""))) {
      errors.push("every DSH preset needs a safe id, label, provider, model, mode=read-only, absolute cordis path, and sha256");
      continue;
    }
    if (!existsSync(cordisInput)) {
      errors.push(`DSH preset ${String(item.id)} cordis file does not exist`);
      continue;
    }
    const cordis = realpathSync(cordisInput);
    const fingerprint = createHash("sha256").update(readFileSync(cordis)).digest("hex");
    if (fingerprint !== item.sha256) {
      errors.push(`DSH preset ${String(item.id)} composition fingerprint does not match`);
      continue;
    }
    const maxTokens = item.maxTokens === undefined ? undefined : Number(item.maxTokens);
    if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens <= 0)) {
      errors.push(`DSH preset ${String(item.id)} has an invalid maxTokens`);
      continue;
    }
    presets.push({
      id: String(item.id), label: item.label, provider: item.provider, model: item.model, cordis,
      fingerprint, ...(maxTokens ? { maxTokens } : {}),
    });
  }

  const workspaces: DshWorkspace[] = [];
  if (!Array.isArray(rawWorkspaces)) errors.push("DSH_WORKSPACES_JSON must be an array");
  else for (const candidate of rawWorkspaces) {
    const item = candidate as Record<string, unknown>;
    const directory = absolute(item.directory);
    if (!SAFE_ID.test(String(item.id ?? "")) || typeof item.label !== "string" || !directory) {
      errors.push("every DSH workspace needs a safe id, label, and absolute directory");
      continue;
    }
    if (!existsSync(directory)) {
      errors.push(`DSH workspace ${String(item.id)} does not exist`);
      continue;
    }
    workspaces.push({ id: String(item.id), label: item.label, directory: realpathSync(directory) });
  }

  const bridgeScript = path.resolve(env.DSH_BRIDGE_SCRIPT || "scripts/dsh-bridge.py");
  if (enabled && !existsSync(bridgeScript)) errors.push("DSH bridge script does not exist");
  if (enabled && presets.length === 0) errors.push("at least one read-only DSH preset is required");
  if (enabled && workspaces.length === 0) errors.push("at least one allowlisted DSH workspace is required");

  return {
    enabled,
    configured: enabled && errors.length === 0,
    python: env.DSH_PYTHON || "python3",
    bridgeScript,
    sessionRoot: path.join(root, "sessions"),
    ledgerFile: path.resolve(env.DSH_EXPERIMENT_LEDGER || path.join(root, "experiment-ledger.json")),
    presets,
    workspaces,
    errors,
  };
}
