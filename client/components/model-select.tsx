import type { ModelCatalogue, ModelSelection } from "../lib/models.js";
import { groupedModels, modelFromKey, modelKey, modelLabel, sameModelID } from "../lib/models.js";

export function ModelSelect({
  catalogue,
  value,
  onChange,
  testId,
  label = "Model",
  disabled = false,
}: {
  catalogue: ModelCatalogue | null;
  value?: ModelSelection;
  onChange: (model: ModelSelection) => void;
  testId: string;
  label?: string;
  disabled?: boolean;
}) {
  const details = catalogue?.models.find((model) => sameModelID(model, value));
  const unknown = Boolean(value && catalogue && !details);
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
      <label className="flex min-w-0 items-center gap-2">
      <span className="shrink-0">{label}</span>
      <select
        value={value ? modelKey(value) : ""}
        onChange={(event) => {
          const model = modelFromKey(event.target.value);
           if (model) onChange(model);
        }}
        disabled={disabled || !catalogue}
        className="min-h-11 min-w-0 max-w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface)] px-2 text-base text-[var(--color-text-default)] sm:min-h-9 sm:text-sm"
        data-testid={testId}
        aria-label={label}
      >
         {!value && <option value="">{catalogue ? "Select a model" : "Loading models..."}</option>}
         {unknown && value && <option value={modelKey(value)}>{value.providerID}/{value.modelID} [unknown]</option>}
        {catalogue && groupedModels(catalogue).map((group) => (
          <optgroup key={group.providerID} label={group.providerName}>
            {group.models.map((model) => {
              const unavailable = model.status === "disabled" || model.status === "unavailable";
              return (
                <option key={modelKey(model)} value={modelKey(model)} disabled={unavailable}>
                  {modelLabel(model)}{model.status !== "available" ? ` [${model.status}]` : ""}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
      </label>
      {value && details && details.variants.length > 0 && (
        <label className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">Variant</span>
          <select
            value={value.variant ?? ""}
            onChange={(event) => onChange({ ...value, variant: event.target.value || undefined })}
            disabled={disabled}
            className="min-h-11 min-w-0 max-w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-background-surface)] px-2 text-base text-[var(--color-text-default)] sm:min-h-9 sm:text-sm"
            data-testid={`${testId}-variant`}
            aria-label={`${label} variant`}
          >
            <option value="">Default</option>
            {details.variants.map((variant) => <option key={variant} value={variant}>{variant}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
