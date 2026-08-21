import { describe, expect, it } from "vitest";

import {
  catalogueDefault,
  currentModelFromMessages,
  groupedModels,
  modelFromKey,
  modelKey,
  modelLabel,
  sameModel,
} from "../client/lib/models.js";
import { isSelectableModel, publicModelCatalogue } from "../server/opencode/config.js";

const rawCatalogue = {
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      headers: { Authorization: "Bearer secret" },
      options: { apiKey: "secret", baseURL: "https://private.example" },
      models: {
        opus: {
          id: "claude-opus",
          name: "Claude Opus",
          status: "beta",
          attachment: true,
          reasoning: true,
          limit: { context: 200_000, output: 32_000 },
          variants: { high: { secretThinkingToken: "secret" }, low: {} },
          headers: { "x-api-key": "secret" },
          token: "secret",
        },
        retired: { name: "Retired", enabled: false, limit: { context: 1 } },
      },
    },
    {
      id: "openai",
      name: "OpenAI",
      models: {
        gpt: { name: "GPT", modalities: { input: ["text", "image"] } },
      },
    },
  ],
  default: { anthropic: "claude-opus", openai: "gpt" },
  credentials: "must-not-leak",
};

describe("public model catalogue", () => {
  it("allowlists useful model fields without provider secrets or implementation config", () => {
    const catalogue = publicModelCatalogue(rawCatalogue, "openai/gpt");
    expect(catalogue.defaultModel).toEqual({ providerID: "openai", modelID: "gpt" });
    expect(catalogue.models).toContainEqual({
      providerID: "anthropic",
      modelID: "claude-opus",
      providerName: "Anthropic",
      name: "Claude Opus",
      status: "beta",
      limits: { context: 200_000, output: 32_000 },
      capabilities: { image: true, reasoning: true },
      variants: ["high", "low"],
    });
    const serialized = JSON.stringify(catalogue);
    for (const forbidden of ["headers", "options", "apiKey", "baseURL", "token", "secret", "private.example"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects unknown and explicitly disabled models", () => {
    const catalogue = publicModelCatalogue(rawCatalogue);
    expect(isSelectableModel(catalogue, { providerID: "anthropic", modelID: "claude-opus" })).toBe(true);
    expect(isSelectableModel(catalogue, { providerID: "anthropic", modelID: "retired" })).toBe(false);
    expect(isSelectableModel(catalogue, { providerID: "other", modelID: "guess" })).toBe(false);
  });
});

describe("client model helpers", () => {
  const catalogue = publicModelCatalogue(rawCatalogue, "anthropic/claude-opus");

  it("round-trips keys, labels models, groups providers, and ranks the default first", () => {
    const selected = { providerID: "provider/one", modelID: "model/two" };
    expect(modelFromKey(modelKey(selected))).toEqual(selected);
    expect(modelLabel(catalogue.models.find((model) => model.modelID === "claude-opus")!)).toBe("Claude Opus (claude-opus)");
    expect(groupedModels(catalogue).find((group) => group.providerID === "anthropic")?.models[0].modelID).toBe("claude-opus");
    expect(catalogueDefault(catalogue)).toEqual({ providerID: "anthropic", modelID: "claude-opus" });
  });

  it("derives the latest user or assistant model before falling back to the session", () => {
    const session = { providerID: "anthropic", modelID: "claude-opus" };
    expect(currentModelFromMessages([], session)).toEqual(session);
    expect(currentModelFromMessages([
      { info: { id: "user", role: "user", model: { providerID: "openai", modelID: "gpt", variant: "fast" } } },
      { info: { id: "assistant", role: "assistant", providerID: "anthropic", modelID: "claude-opus", variant: "high" } },
    ], session)).toEqual({ providerID: "anthropic", modelID: "claude-opus", variant: "high" });
    expect(sameModel(session, { ...session, variant: "high" })).toBe(false);
    expect(currentModelFromMessages([], { providerID: "legacy", modelID: "removed" })).toEqual({
      providerID: "legacy",
      modelID: "removed",
    });
  });
});
