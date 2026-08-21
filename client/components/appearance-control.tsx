import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

const appearances = ["system", "light", "dark"] as const;

export function AppearanceControl() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const selected = mounted ? theme : undefined;
  const status = selected === "system"
    ? `System (${resolvedTheme === "dark" ? "Dark" : "Light"})`
    : selected === "dark"
      ? "Dark"
      : selected === "light"
        ? "Light"
        : "Loading appearance...";

  return (
    <section className="space-y-2" aria-labelledby="appearance-heading">
      <div>
        <h2 id="appearance-heading" className="text-sm font-semibold">Appearance</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Stored on this device. System follows your browser or operating system.
        </p>
      </div>
      <fieldset
        className="grid grid-cols-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-background-surface-neutral-muted)] p-1"
        data-testid="opencode-appearance"
      >
        <legend className="sr-only">Appearance preference</legend>
        {appearances.map((appearance) => (
          <label key={appearance} className="cursor-pointer">
            <input
              className="peer sr-only"
              type="radio"
              name="appearance"
              value={appearance}
              checked={selected === appearance}
              disabled={!mounted}
              onChange={() => setTheme(appearance)}
              data-testid={`opencode-appearance-${appearance}`}
            />
            <span className="block rounded-md px-3 py-2 text-center text-sm capitalize text-[var(--color-text-muted)] peer-checked:bg-[var(--color-background-surface)] peer-checked:font-semibold peer-checked:text-[var(--color-text-default)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-border-focus)] peer-disabled:cursor-wait">
              {appearance}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-[var(--color-text-muted)]" aria-live="polite" data-testid="opencode-appearance-status">
        Selected: {status}
      </p>
    </section>
  );
}
