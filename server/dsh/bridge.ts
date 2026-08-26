import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

import type { DshConfig, DshPreset, DshWorkspace } from "./config.js";

export interface BridgeNotification {
  type: "notification" | "finished" | "failed";
  sessionId: string;
  notification?: { method?: unknown; payload?: unknown };
  finalResponse?: string;
  finishReason?: string | null;
  error?: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const SAFE_ENV = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL"] as const;

export class DshBridge extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, Pending>();
  private ready: Promise<void> | null = null;

  constructor(
    private readonly config: DshConfig,
    readonly preset: DshPreset,
    readonly workspace: DshWorkspace,
  ) {
    super();
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      let ready = false;
      const env: NodeJS.ProcessEnv = {};
      for (const key of SAFE_ENV) if (process.env[key]) env[key] = process.env[key];
      Object.assign(env, {
        DSH_BRIDGE_PROVIDER: this.preset.provider,
        DSH_BRIDGE_MODEL: this.preset.model,
        DSH_BRIDGE_CORDIS: this.preset.cordis,
        DSH_BRIDGE_WORKSPACE: this.workspace.directory,
        DSH_BRIDGE_SESSION_ROOT: this.config.sessionRoot,
        ...(this.preset.maxTokens ? { DSH_BRIDGE_MAX_TOKENS: String(this.preset.maxTokens) } : {}),
      });
      const child = spawn(this.config.python, [this.config.bridgeScript], {
        cwd: this.workspace.directory,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;
      const readyTimer = setTimeout(() => {
        if (ready) return;
        reject(new Error("DSH bridge did not become ready within 10 seconds"));
        child.kill("SIGTERM");
      }, 10_000);
      const resolveReady = () => {
        if (ready) return;
        ready = true;
        clearTimeout(readyTimer);
        resolve();
      };
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => this.receive(line, resolveReady));
      child.stderr.on("data", (chunk: Buffer) => this.emit("diagnostic", chunk.toString("utf8").slice(0, 2_000)));
      child.once("error", (error) => {
        clearTimeout(readyTimer);
        reject(error);
        this.failAll(error);
      });
      child.once("exit", (code) => {
        const error = new Error(`DSH bridge exited${code === null ? "" : ` with code ${code}`}`);
        clearTimeout(readyTimer);
        if (!ready) reject(error);
        this.failAll(error);
        this.child = null;
        this.ready = null;
        this.emit("exit", error);
      });
    });
    return this.ready;
  }

  private receive(line: string, ready: () => void): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.emit("diagnostic", "DSH bridge emitted malformed JSON");
      return;
    }
    if (message.type === "ready") {
      ready();
      return;
    }
    if (message.type === "notification" || message.type === "finished" || message.type === "failed") {
      this.emit("notification", message as unknown as BridgeNotification);
      return;
    }
    const id = typeof message.id === "string" ? message.id : "";
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (message.ok === false) pending.reject(new Error(String(message.error || "DSH bridge request failed")));
    else pending.resolve(message.result);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async request(method: "ping" | "prompt" | "cancel", params: Record<string, unknown> = {}): Promise<unknown> {
    await this.start();
    const child = this.child;
    if (!child) throw new Error("DSH bridge is unavailable");
    const id = randomUUID();
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DSH bridge ${method} timed out`));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
    });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return response;
  }

  close(): void {
    this.child?.kill("SIGTERM");
  }
}

export class DshBridgePool extends EventEmitter {
  private readonly bridges = new Map<string, DshBridge>();

  constructor(private readonly config: DshConfig) {
    super();
  }

  get(preset: DshPreset, workspace: DshWorkspace): DshBridge {
    const key = `${preset.id}\0${workspace.id}`;
    let bridge = this.bridges.get(key);
    if (!bridge) {
      bridge = new DshBridge(this.config, preset, workspace);
      bridge.on("notification", (event: BridgeNotification) => this.emit("notification", event));
      bridge.on("diagnostic", (message: string) => this.emit("diagnostic", { preset: preset.id, workspace: workspace.id, message }));
      bridge.on("exit", (error: Error) => this.emit("diagnostic", { preset: preset.id, workspace: workspace.id, message: error.message }));
      this.bridges.set(key, bridge);
    }
    return bridge;
  }

  close(): void {
    for (const bridge of this.bridges.values()) bridge.close();
    this.bridges.clear();
  }
}
