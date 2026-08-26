import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { readDshConfig } from "../server/dsh/config.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dsh-config-"));
  temporary.push(root);
  const workspace = path.join(root, "workspace");
  const cordis = path.join(root, "readonly.yml");
  const bridge = path.join(root, "bridge.py");
  const sha256 = createHash("sha256").update("readonly: true\n").digest("hex");
  await mkdir(workspace);
  await Promise.all([writeFile(cordis, "readonly: true\n"), writeFile(bridge, "")]);
  return { root, workspace, cordis, bridge, sha256 };
}

describe("DSH experiment configuration", () => {
  it("stays disabled and exposes no implicit SDK default", () => {
    const config = readDshConfig({});
    expect(config.enabled).toBe(false);
    expect(config.configured).toBe(false);
    expect(config.presets).toEqual([]);
  });

  it("requires explicit existing read-only composition and workspace allowlists", async () => {
    const item = await fixture();
    const config = readDshConfig({
      DSH_EXPERIMENT_ENABLED: "true",
      DSH_STATE_DIR: path.join(item.root, "state"),
      DSH_BRIDGE_SCRIPT: item.bridge,
      DSH_PRESETS_JSON: JSON.stringify([{ id: "flash-readonly", label: "Flash", provider: "deepseek-official", model: "deepseek-v4-flash", mode: "read-only", cordis: item.cordis, sha256: item.sha256 }]),
      DSH_WORKSPACES_JSON: JSON.stringify([{ id: "fixture", label: "Fixture", directory: item.workspace }]),
    });
    expect(config.configured).toBe(true);
    expect(config.presets[0]).toMatchObject({ id: "flash-readonly" });
    expect(config.presets[0].cordis).toMatch(/readonly\.yml$/);
    expect(config.presets[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(config.workspaces[0]).toMatchObject({ id: "fixture" });
    expect(config.workspaces[0].directory).toMatch(/workspace$/);
  });

  it("fails closed on missing composition paths", async () => {
    const item = await fixture();
    const config = readDshConfig({
      DSH_EXPERIMENT_ENABLED: "true",
      DSH_BRIDGE_SCRIPT: item.bridge,
      DSH_PRESETS_JSON: JSON.stringify([{ id: "unsafe", label: "Unsafe", provider: "deepseek", model: "model", mode: "read-only", cordis: path.join(item.root, "missing.yml"), sha256: item.sha256 }]),
      DSH_WORKSPACES_JSON: JSON.stringify([{ id: "fixture", label: "Fixture", directory: item.workspace }]),
    });
    expect(config.configured).toBe(false);
    expect(config.presets).toEqual([]);
    expect(config.errors.join(" ")).toContain("cordis file does not exist");
  });

  it("rejects composition drift before launching DSH", async () => {
    const item = await fixture();
    const config = readDshConfig({
      DSH_EXPERIMENT_ENABLED: "true",
      DSH_BRIDGE_SCRIPT: item.bridge,
      DSH_PRESETS_JSON: JSON.stringify([{ id: "drifted", label: "Drifted", provider: "deepseek", model: "model", mode: "read-only", cordis: item.cordis, sha256: "0".repeat(64) }]),
      DSH_WORKSPACES_JSON: JSON.stringify([{ id: "fixture", label: "Fixture", directory: item.workspace }]),
    });
    expect(config.configured).toBe(false);
    expect(config.errors.join(" ")).toContain("composition fingerprint does not match");
  });
});
