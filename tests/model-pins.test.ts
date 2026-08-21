import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_MODEL_PINS, MODEL_PINS_MAX, ModelPinStore, normalizeModelPins } from "../server/modelPins.js";

describe("model pins", () => {
  it("validates, deduplicates, and limits references", () => {
    const sol = { providerID: "openai", modelID: "gpt-5.6-sol" };
    expect(normalizeModelPins({ models: [sol, sol] })).toEqual([sol]);
    expect(() => normalizeModelPins({ models: "nope" })).toThrow("models must be an array");
    expect(() => normalizeModelPins({ models: [{ providerID: "openai" }] })).toThrow("providerID and modelID");
    expect(() => normalizeModelPins({ models: Array(MODEL_PINS_MAX + 1).fill(sol) })).toThrow("at most");
  });

  it("seeds a missing store and persists an intentional empty list", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-model-pins-"));
    const store = new ModelPinStore(path.join(root, "state", "pins.json"));
    expect(await store.read()).toEqual(DEFAULT_MODEL_PINS);
    await store.write({ models: [] });
    expect(await store.read()).toEqual([]);
  });

  it("atomically persists ordered pins with private permissions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-model-pins-"));
    const file = path.join(root, "state", "pins.json");
    const store = new ModelPinStore(file);
    const models = [...DEFAULT_MODEL_PINS].reverse();
    expect(await store.write({ models })).toEqual(models);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ version: 1, models });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("rejects malformed persisted state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dca-model-pins-"));
    const file = path.join(root, "pins.json");
    const store = new ModelPinStore(file);
    await writeFile(file, "not json");
    await expect(store.read()).rejects.toThrow("could not be read");
  });
});
