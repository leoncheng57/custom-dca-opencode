import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { OpencodeError, type OpencodeConfig } from "./client.js";
import type { EventBus, OpencodeEvent } from "./events.js";
import { listPermissions, parsePermissionRequest, replyPermission, type PermissionRequest } from "./permissions.js";
import { requireWorkspaceDirectory } from "../paths.js";

export interface AutoPermissionStatus {
  enabled: boolean;
  error: string | null;
}

interface DirectoryState {
  enabled: boolean;
  generation: number;
  queue: Promise<void>;
  failures: Map<string, string>;
  completed: Set<string>;
}

export class AutoPermissionService {
  private readonly states = new Map<string, DirectoryState>();
  /** Serializes state-file writes so a rapid toggle cannot interleave rewrites. */
  private persistQueue = Promise.resolve();
  private loaded: Promise<void> = Promise.resolve();
  private readonly onEvent = (event: OpencodeEvent) => {
    if (event.type === "permission.asked") void this.handleAsked(event);
    if (event.type === "permission.replied") void this.handleReplied(event);
  };
  private readonly onConnected = () => {
    for (const [directory, state] of this.states) {
      if (state.enabled) void this.reconcile(directory, state.generation);
    }
  };

  /**
   * `stateFile` makes the per-directory enabled flags survive a restart. The
   * flag used to be memory-only, which read as a safety default but had the
   * opposite effect in practice: every deploy silently flipped a directory the
   * user had explicitly set to auto-approve back into ask mode, so the next
   * agent turn fired a permission push per tool call at their phone until they
   * noticed and re-toggled. Persisting an instruction the user already gave
   * through the authenticated UI is not an escalation; forgetting it was noise.
   * Pass no file to stay volatile (unit tests, and any caller that wants the
   * old behaviour).
   */
  constructor(
    private readonly config: OpencodeConfig,
    private readonly bus: EventBus,
    private readonly stateFile: string | null = null,
  ) {}

  start(): void {
    this.bus.on("event", this.onEvent);
    this.bus.on("connected", this.onConnected);
    if (this.stateFile) this.loaded = this.load();
  }

  stop(): void {
    this.bus.off("event", this.onEvent);
    this.bus.off("connected", this.onConnected);
  }

  isEnabled(directory: string | undefined): boolean {
    return Boolean(directory && this.states.get(directory)?.enabled);
  }

  async isEnabledCanonical(directory: string | undefined): Promise<boolean> {
    if (!directory) return false;
    // An event can arrive while persisted auto-approval state is restoring.
    // Wait so notification suppression sees the user's prior setting.
    await this.loaded.catch(() => undefined);
    try {
      return this.isEnabled(await requireWorkspaceDirectory(directory));
    } catch {
      return false;
    }
  }

  status(directory: string): AutoPermissionStatus {
    const state = this.states.get(directory);
    return {
      enabled: state?.enabled ?? false,
      error: state?.failures.values().next().value ?? null,
    };
  }

  async setEnabled(directory: string, enabled: boolean): Promise<AutoPermissionStatus> {
    // An explicit toggle must never lose to a concurrent startup load.
    await this.loaded.catch(() => undefined);
    const state = this.state(directory);
    state.enabled = enabled;
    state.generation += 1;
    state.failures.clear();
    await this.persist();
    if (enabled) {
      await this.reconcile(directory, state.generation);
    } else {
      // State flips before queued work drains, so pending event handlers observe
      // the disable and cannot approve after this call resolves.
      await state.queue;
    }
    return this.status(directory);
  }

  /**
   * Restore persisted flags without overriding anything toggled since boot.
   * A directory that already has in-memory state was touched by an explicit
   * request, and that request wins over the file it may itself have rewritten.
   */
  private async load(): Promise<void> {
    if (!this.stateFile) return;
    let enabled: string[];
    try {
      const parsed: unknown = JSON.parse(await readFile(this.stateFile, "utf8"));
      const candidate = (parsed as { enabled?: unknown })?.enabled;
      enabled = Array.isArray(candidate)
        ? candidate.filter((item): item is string => typeof item === "string" && item.length > 0)
        : [];
    } catch (error) {
      // A missing file is the first run; anything else fails closed to the old
      // volatile default rather than guessing at a corrupt instruction list.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[auto-permission]", `Could not restore state: ${this.message(error)}`);
      }
      return;
    }
    for (const directory of enabled) {
      if (this.states.has(directory)) continue;
      const state = this.state(directory);
      state.enabled = true;
      state.generation += 1;
      void this.reconcile(directory, state.generation);
    }
  }

  private persist(): Promise<void> {
    if (!this.stateFile) return Promise.resolve();
    const file = this.stateFile;
    const enabled = [...this.states.entries()]
      .filter(([, state]) => state.enabled)
      .map(([directory]) => directory)
      .sort();
    this.persistQueue = this.persistQueue
      .then(async () => {
        await mkdir(path.dirname(file), { recursive: true });
        const temporary = `${file}.tmp-${process.pid}`;
        await writeFile(temporary, `${JSON.stringify({ version: 1, enabled }, null, 2)}\n`, { mode: 0o600 });
        await rename(temporary, file);
      })
      .catch((error: unknown) => {
        console.warn("[auto-permission]", `Could not persist state: ${this.message(error)}`);
      });
    return this.persistQueue;
  }

  private state(directory: string): DirectoryState {
    let state = this.states.get(directory);
    if (!state) {
      state = {
        enabled: false,
        generation: 0,
        queue: Promise.resolve(),
        failures: new Map(),
        completed: new Set(),
      };
      this.states.set(directory, state);
    }
    return state;
  }

  private enqueue(directory: string, task: (state: DirectoryState) => Promise<void>): Promise<void> {
    const state = this.state(directory);
    const run = state.queue.then(() => task(state));
    state.queue = run.catch((error: unknown) => {
      console.warn("[auto-permission]", error instanceof Error ? error.message : String(error));
    });
    return state.queue;
  }

  private async handleAsked(event: OpencodeEvent): Promise<void> {
    if (!event.directory) return;
    let directory: string;
    try {
      directory = await requireWorkspaceDirectory(event.directory);
    } catch {
      return;
    }
    const pending = parsePermissionRequest(event.properties);
    const state = this.states.get(directory);
    if (!pending || !state?.enabled) return;
    const generation = state.generation;
    await this.enqueue(directory, async (current) => {
      if (!current.enabled || current.generation !== generation || current.completed.has(pending.id)) return;
      await this.approve(directory, current, pending);
    });
  }

  private async handleReplied(event: OpencodeEvent): Promise<void> {
    const requestID = event.properties.requestID;
    if (!event.directory || typeof requestID !== "string") return;
    let directory: string;
    try {
      directory = await requireWorkspaceDirectory(event.directory);
    } catch {
      return;
    }
    const state = this.states.get(directory);
    if (!state) return;
    await this.enqueue(directory, async (current) => {
      current.failures.delete(requestID);
      current.completed.delete(requestID);
    });
  }

  private reconcile(directory: string, generation: number): Promise<void> {
    return this.enqueue(directory, async (state) => {
      if (!state.enabled || state.generation !== generation) return;
      let pending: PermissionRequest[];
      try {
        pending = await listPermissions(this.config, directory);
        state.failures.delete("reconcile");
      } catch (error) {
        state.failures.set("reconcile", `Could not list pending permissions: ${this.message(error)}`);
        return;
      }
      const pendingIDs = new Set(pending.map((permission) => permission.id));
      for (const requestID of state.failures.keys()) {
        if (requestID !== "reconcile" && !pendingIDs.has(requestID)) state.failures.delete(requestID);
      }
      for (const requestID of state.completed) {
        if (!pendingIDs.has(requestID)) state.completed.delete(requestID);
      }
      for (const permission of pending) {
        if (!state.enabled || state.generation !== generation) return;
        if (!state.completed.has(permission.id)) await this.approve(directory, state, permission);
      }
    });
  }

  private async approve(directory: string, state: DirectoryState, pending: PermissionRequest): Promise<void> {
    try {
      await replyPermission(this.config, directory, pending.id, "once");
      state.failures.delete(pending.id);
      this.complete(state, pending.id);
    } catch (error) {
      if (error instanceof OpencodeError && error.status === 404) {
        state.failures.delete(pending.id);
        this.complete(state, pending.id);
        return;
      }
      state.failures.set(pending.id, `Could not auto-approve ${pending.permission}: ${this.message(error)}`);
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private complete(state: DirectoryState, requestID: string): void {
    state.completed.add(requestID);
    if (state.completed.size > 500) {
      const oldest = state.completed.values().next().value;
      if (oldest) state.completed.delete(oldest);
    }
  }
}
