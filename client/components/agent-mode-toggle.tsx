import type { AgentMode } from "../lib/agentMode.js";

export function AgentModeToggle({
  mode,
  onChange,
  testId,
  disabled = false,
}: {
  mode: AgentMode;
  onChange: (mode: AgentMode) => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface)] p-0.5"
      role="group"
      aria-label="Agent mode: Plan is read-only; Build can modify files"
      data-testid={testId}
    >
      {(["plan", "build"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          title={value === "plan" ? "Plan is read-only" : "Build can modify files"}
          disabled={disabled}
          onClick={() => onChange(value)}
          className={`rounded px-2.5 py-1 text-xs font-semibold capitalize ${
            mode === value
              ? "bg-[var(--color-background-surface-info-muted)] text-[var(--color-text-info)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-default)]"
          }`}
          data-testid={`${testId}-${value}`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
