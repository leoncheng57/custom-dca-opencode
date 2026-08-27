import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DSH_BRIDGE_MAX_LINE_BYTES, DshBridge, dshBridgeEnvironment } from "../server/dsh/bridge.js";
import type { DshConfig, DshPreset, DshWorkspace } from "../server/dsh/config.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("DSH bridge frame limits", () => {
  it("forwards only named provider credentials into the bridge", () => {
    expect(dshBridgeEnvironment({
      OPENAI_API_KEY: "openai-secret",
      ANTHROPIC_API_KEY: "anthropic-secret",
      DEEPSEEK_API_KEY: "deepseek-secret",
      AWS_SECRET_ACCESS_KEY: "must-not-cross",
      RANDOM_SECRET: "must-not-cross",
    })).toEqual({
      OPENAI_API_KEY: "openai-secret",
      ANTHROPIC_API_KEY: "anthropic-secret",
      DEEPSEEK_API_KEY: "deepseek-secret",
    });
  });

  it("kills the bridge before parsing a line larger than 1 MiB", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dsh-bridge-frame-"));
    temporary.push(root);
    const workspacePath = path.join(root, "workspace");
    const cordis = path.join(root, "readonly.yml");
    const script = path.join(root, "bridge.mjs");
    await mkdir(workspacePath);
    await writeFile(cordis, "readonly: true\n");
    await writeFile(script, `process.stdout.write(JSON.stringify({type:"ready",protocol:1,sdkVersion:process.env.DSH_BRIDGE_SDK_VERSION})+"\\n");process.stdin.once("data",()=>process.stdout.write("x".repeat(${DSH_BRIDGE_MAX_LINE_BYTES + 1})+"\\n"));`);
    const workspaceStat = await stat(workspacePath);
    const preset: DshPreset = { id: "preset", label: "Preset", provider: "mock", model: "mock", cordis, fingerprint: createHash("sha256").update("readonly: true\n").digest("hex"), mode: "read-only" };
    const workspace: DshWorkspace = { id: "workspace", label: "Workspace", directory: workspacePath, device: workspaceStat.dev, inode: workspaceStat.ino };
    const config: DshConfig = {
      enabled: true, configured: true, python: process.execPath, bridgeScript: script,
      sessionRoot: path.join(root, "state", "sessions"), ledgerFile: path.join(root, "state", "ledger.json"), trajectoryRoot: path.join(root, "state", "trajectory"),
      trajectorySensitiveEnabled: false, trajectoryFullExportEnabled: false,
      sdkVersion: "0.1.1rc2", sandbox: "test-unsafe", presets: [preset], workspaces: [workspace], errors: [],
    };
    const bridge = new DshBridge(config, preset, workspace);
    const diagnostics: unknown[] = [];
    bridge.on("diagnostic", (message) => diagnostics.push(message));
    await expect(bridge.request("ping")).rejects.toThrow("DSH bridge exited");
    expect(diagnostics).toContain("DSH bridge frame exceeded the 1 MiB limit");
    bridge.close();
  });
});
