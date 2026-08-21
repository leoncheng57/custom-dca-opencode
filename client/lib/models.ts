import type { RawMessage } from "./events.js";

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

export interface ModelCatalogue {
  models: PublicModel[];
  defaultModel?: ModelSelection;
}

export function modelKey(model: ModelSelection): string {
  return `${encodeURIComponent(model.providerID)}/${encodeURIComponent(model.modelID)}`;
}

export function modelFromKey(value: string): ModelSelection | undefined {
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1) return undefined;
  try {
    return {
      providerID: decodeURIComponent(value.slice(0, separator)),
      modelID: decodeURIComponent(value.slice(separator + 1)),
    };
  } catch {
    return undefined;
  }
}

export function sameModel(a?: ModelSelection, b?: ModelSelection): boolean {
  return Boolean(a && b && a.providerID === b.providerID && a.modelID === b.modelID && a.variant === b.variant);
}

export function sameModelID(a?: ModelSelection, b?: ModelSelection): boolean {
  return Boolean(a && b && a.providerID === b.providerID && a.modelID === b.modelID);
}

export function modelLabel(model: PublicModel): string {
  return model.name === model.modelID ? model.name : `${model.name} (${model.modelID})`;
}

export interface ModelGroup {
  providerID: string;
  providerName: string;
  models: PublicModel[];
}

export function groupedModels(catalogue: ModelCatalogue): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const model of catalogue.models) {
    const group = groups.get(model.providerID) ?? {
      providerID: model.providerID,
      providerName: model.providerName,
      models: [],
    };
    group.models.push(model);
    groups.set(model.providerID, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      models: group.models.sort((a, b) => {
        const aDefault = sameModelID(a, catalogue.defaultModel) ? 0 : 1;
        const bDefault = sameModelID(b, catalogue.defaultModel) ? 0 : 1;
        const aDisabled = a.status === "disabled" || a.status === "unavailable" ? 1 : 0;
        const bDisabled = b.status === "disabled" || b.status === "unavailable" ? 1 : 0;
        return aDisabled - bDisabled || aDefault - bDefault || modelLabel(a).localeCompare(modelLabel(b));
      }),
    }))
    .sort((a, b) => a.providerName.localeCompare(b.providerName));
}

export function catalogueDefault(catalogue: ModelCatalogue): ModelSelection | undefined {
  if (catalogue.defaultModel && catalogue.models.some((model) =>
    sameModelID(model, catalogue.defaultModel) && model.status !== "disabled" && model.status !== "unavailable")) {
    return catalogue.defaultModel;
  }
  return groupedModels(catalogue).flatMap((group) => group.models)
    .find((model) => model.status !== "disabled" && model.status !== "unavailable");
}

function messageModel(message: RawMessage): ModelSelection | undefined {
  const info = message.info;
  if (!info || (info.role !== "user" && info.role !== "assistant")) return undefined;
  const providerID = info.model?.providerID ?? info.providerID;
  const modelID = info.model?.modelID ?? info.model?.id ?? info.modelID;
  const variant = info.model?.variant ?? info.variant;
  return providerID && modelID ? { providerID, modelID, ...(variant ? { variant } : {}) } : undefined;
}

export function currentModelFromMessages(
  messages: RawMessage[],
  sessionModel?: ModelSelection,
): ModelSelection | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const model = messageModel(messages[index]);
    if (model) return model;
  }
  return sessionModel;
}

export function latestModelMessageID(messages: RawMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messageModel(messages[index])) return messages[index].info?.id;
  }
  return undefined;
}
