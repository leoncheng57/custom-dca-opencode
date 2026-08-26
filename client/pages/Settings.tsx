import { useEffect, useState } from "react";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import { AppearanceControl } from "../components/appearance-control.js";
import { api, type AppSettings } from "../lib/api.js";
import {
  booleanFromOverride,
  booleanOverride,
  OPENCODE_SETTINGS_DEFAULTS,
  writableSettings,
  type BooleanOverride,
} from "../lib/settingsDefaults.js";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [initial, setInitial] = useState<AppSettings | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void api.settings().then((result) => {
      setSettings(result.settings);
      setInitial(result.settings);
    }).catch((e: Error) => setError(e.message));
  }, []);

  const save = async () => {
    if (!settings) return;
    const cleared = (["model", "small_model", "default_agent"] as const).find(
      (key) => initial?.[key] && !settings[key],
    );
    if (cleared) {
      setError(`OpenCode's PATCH API cannot clear '${cleared}'. Remove it from the config file instead.`);
      return;
    }
    setSaved(false);
    try {
      const savedSettings = (await api.saveSettings(writableSettings(settings))).settings;
      setSettings(savedSettings);
      setInitial(savedSettings);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const setCompactionBoolean = (key: "auto" | "prune", override: BooleanOverride) => {
    if (!settings) return;
    const compaction = { ...settings.compaction };
    const value = booleanFromOverride(override);
    if (value === undefined) delete compaction[key];
    else compaction[key] = value;
    setSettings({
      ...settings,
      compaction: Object.keys(compaction).length ? compaction : undefined,
    });
  };

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6" data-testid="opencode-settings">
      <header>
        <h1 className="text-xl font-bold">Agent settings</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Global defaults used by OpenCode projects.</p>
      </header>
      <AppearanceControl />
      <Alert variant="warning">Saving global settings restarts OpenCode project instances. Avoid saving during an active run.</Alert>
      {error && <Alert variant="danger">{error}</Alert>}
      {settings && (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {[
            ["model", "Default model"],
            ["small_model", "Small model"],
            ["default_agent", "Default agent"],
          ].map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="mb-1 block font-medium">{label}</span>
              <input
                value={String(settings[key as keyof AppSettings] ?? "")}
                onChange={(event) => setSettings({ ...settings, [key]: event.target.value || undefined })}
                placeholder="Inherited"
                className="w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2"
                data-testid={`opencode-setting-${key.replace("_", "-")}`}
              />
            </label>
          ))}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Subagent depth (global)</span>
            <input
              type="text"
              readOnly
              value={settings.subagent_depth ?? `${OPENCODE_SETTINGS_DEFAULTS.subagentDepth} (OpenCode default)`}
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)] p-2 text-[var(--color-text-muted)]"
              data-testid="opencode-setting-subagent-depth"
            />
            <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
              Read from global config and changed in opencode.json. A project config can override this value.
            </span>
          </label>
          <fieldset className="space-y-3 rounded-lg border border-[var(--color-border-default)] p-4">
            <legend className="px-1 text-sm font-semibold">Compaction</legend>
            {(["auto", "prune"] as const).map((key) => {
              const defaultValue = key === "auto"
                ? OPENCODE_SETTINGS_DEFAULTS.compactionAuto
                : OPENCODE_SETTINGS_DEFAULTS.compactionPrune;
              return (
              <label key={key} className="block text-sm capitalize">
                <span className="mb-1 block">{key}</span>
                <select
                  value={booleanOverride(settings.compaction?.[key])}
                  onChange={(event) => setCompactionBoolean(key, event.target.value as BooleanOverride)}
                  className="w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2"
                  data-testid={`opencode-compaction-${key}`}
                >
                  <option value="default">Default ({defaultValue ? "on" : "off"})</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              );
            })}
            <label className="block text-sm">
              <span className="mb-1 block">Reserved tokens</span>
              <input
                type="number"
                min="0"
                value={settings.compaction?.reserved ?? ""}
                placeholder="OpenCode default"
                onChange={(event) => {
                  const compaction = { ...settings.compaction };
                  if (!event.target.value) delete compaction.reserved;
                  else compaction.reserved = Number(event.target.value);
                  setSettings({ ...settings, compaction: Object.keys(compaction).length ? compaction : undefined });
                }}
                className="w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2"
                data-testid="opencode-compaction-reserved"
              />
            </label>
          </fieldset>
          <div className="flex items-center gap-3">
            <Button type="submit" data-testid="opencode-settings-save">Save settings</Button>
            {saved && <span className="text-sm text-[var(--color-text-success)]">Saved</span>}
          </div>
        </form>
      )}
     </main>
  );
}
