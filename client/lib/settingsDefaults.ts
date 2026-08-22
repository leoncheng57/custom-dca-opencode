import type { AppSettings } from "./api.js";

// Defaults from https://opencode.ai/config.json for the pinned OpenCode
// 1.18.21 contract. These are display hints only, never values to PATCH.
export const OPENCODE_SETTINGS_DEFAULTS = {
  subagentDepth: 1,
  compactionAuto: true,
  compactionPrune: false,
} as const;

export type BooleanOverride = "default" | "on" | "off";

export function booleanOverride(value: boolean | undefined): BooleanOverride {
  return value === undefined ? "default" : value ? "on" : "off";
}

export function booleanFromOverride(value: BooleanOverride): boolean | undefined {
  return value === "default" ? undefined : value === "on";
}

/** The global PATCH surface deliberately excludes read-only settings. */
export function writableSettings(settings: AppSettings): AppSettings {
  const { subagent_depth: _readOnlyDepth, ...writable } = settings;
  return writable;
}
