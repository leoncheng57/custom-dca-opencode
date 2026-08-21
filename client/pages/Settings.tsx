import { useEffect, useState } from "react";

import { Alert } from "../ds/alert.js";
import { Button } from "../ds/button.js";
import { AppearanceControl } from "../components/appearance-control.js";
import { api, type AppSettings } from "../lib/api.js";

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
      const savedSettings = (await api.saveSettings(settings)).settings;
      setSettings(savedSettings);
      setInitial(savedSettings);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6" data-testid="opencode-settings">
      <header>
        <h1 className="text-xl font-bold">Agent settings</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Global defaults used by OpenCode projects.</p>
      </header>
      <Alert variant="info" className="py-3" data-testid="screenshot-demo-settings">
        Screenshot demo: global agent defaults are ready for visual review.
      </Alert>
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
                className="w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2"
                data-testid={`opencode-setting-${key.replace("_", "-")}`}
              />
            </label>
          ))}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Subagent depth</span>
            <input type="number" min="0" value={settings.subagent_depth ?? 0} onChange={(event) => setSettings({ ...settings, subagent_depth: Number(event.target.value) })} className="w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2" data-testid="opencode-setting-subagent-depth" />
          </label>
          <fieldset className="space-y-3 rounded-lg border border-[var(--color-border-default)] p-4">
            <legend className="px-1 text-sm font-semibold">Compaction</legend>
            {(["auto", "prune"] as const).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm capitalize">
                <input type="checkbox" checked={settings.compaction?.[key] ?? false} onChange={(event) => setSettings({ ...settings, compaction: { ...settings.compaction, [key]: event.target.checked } })} data-testid={`opencode-compaction-${key}`} />
                {key}
              </label>
            ))}
            <label className="block text-sm">
              <span className="mb-1 block">Reserved tokens</span>
              <input type="number" min="0" value={settings.compaction?.reserved ?? 0} onChange={(event) => setSettings({ ...settings, compaction: { ...settings.compaction, reserved: Number(event.target.value) } })} className="w-full rounded-md border border-[var(--color-border-default)] bg-transparent p-2" data-testid="opencode-compaction-reserved" />
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
