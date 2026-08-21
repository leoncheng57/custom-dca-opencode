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
  private readonly onEvent = (event: OpencodeEvent) => {
    if (event.type === "permission.asked") void this.handleAsked(event);
  };
  private readonly onConnected = () => {
    for (const [directory, state] of this.states) {
      if (state.enabled) void this.reconcile(directory, state.generation);
    }
  };

  constructor(
    private readonly config: OpencodeConfig,
    private readonly bus: EventBus,
  ) {}

  start(): void {
    this.bus.on("event", this.onEvent);
    this.bus.on("connected", this.onConnected);
  }

  stop(): void {
    this.bus.off("event", this.onEvent);
    this.bus.off("connected", this.onConnected);
  }

  isEnabled(directory: string | undefined): boolean {
    return Boolean(directory && this.states.get(directory)?.enabled);
  }

  status(directory: string): AutoPermissionStatus {
    const state = this.states.get(directory);
    return {
      enabled: state?.enabled ?? false,
      error: state?.failures.values().next().value ?? null,
    };
  }

  async setEnabled(directory: string, enabled: boolean): Promise<AutoPermissionStatus> {
    const state = this.state(directory);
    state.enabled = enabled;
    state.generation += 1;
    state.failures.clear();
    if (enabled) {
      await this.reconcile(directory, state.generation);
    } else {
      // State flips before queued work drains, so pending event handlers observe
      // the disable and cannot approve after this call resolves.
      await state.queue;
    }
    return this.status(directory);
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
