import type { EventBus, OpencodeEvent } from "../opencode/events.js";
import type { PromptInput } from "../opencode/sessions.js";
import { PendingPromptGuardError, PendingPromptStore, type PendingPromptSession } from "./store.js";

export type SessionObservation = "busy" | "retry" | "idle" | "interrupted" | "completed";

export interface PendingPromptDependencies {
  observe: (directory: string, sessionID: string, since?: string) => Promise<SessionObservation>;
  send: (directory: string, sessionID: string, input: PromptInput) => Promise<void>;
  schedule?: (callback: () => void, milliseconds: number) => () => void;
}

export class PendingPromptDispatcher {
  private readonly active = new Set<string>();
  private stopTimer?: () => void;
  private eventHandler?: (event: OpencodeEvent) => void;
  private started = false;

  constructor(
    readonly store: PendingPromptStore,
    private readonly dependencies: PendingPromptDependencies,
  ) {}

  async start(bus?: EventBus): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.store.load();
    if (bus) {
      this.eventHandler = (event) => {
        const sessionID = typeof event.properties.sessionID === "string" ? event.properties.sessionID : undefined;
        if (event.directory && sessionID) void this.reconcile(event.directory, sessionID);
        else void this.reconcileAll();
      };
      bus.on("event", this.eventHandler);
    }
    const schedule = this.dependencies.schedule ?? ((callback, milliseconds) => {
      const timer = setInterval(callback, milliseconds);
      return () => clearInterval(timer);
    });
    this.stopTimer = schedule(() => void this.reconcileAll(), 3_000);
    await this.reconcileAll();
  }

  stop(bus?: EventBus): void {
    this.started = false;
    this.stopTimer?.();
    this.stopTimer = undefined;
    if (bus && this.eventHandler) bus.off("event", this.eventHandler);
    this.eventHandler = undefined;
  }

  async reconcileAll(): Promise<void> {
    const sessions = await this.store.all();
    await Promise.all(sessions.map((session) => this.reconcile(session.directory, session.sessionID)));
  }

  async reconcile(directory: string, sessionID: string): Promise<void> {
    const lock = `${directory}\0${sessionID}`;
    if (this.active.has(lock)) return;
    this.active.add(lock);
    try {
      const session = await this.store.get(directory, sessionID);
      if (session.paused || session.items.length === 0) return;
      const active = session.items.find((item) => item.id === session.activeItemID);
      const observation = await this.dependencies.observe(directory, sessionID, active?.sendingAt);
      if (observation === "interrupted" && session.phase === "ready") {
        await this.pause(directory, sessionID, "interrupted");
        return;
      }
      if (session.phase === "awaiting-busy") {
        if (observation === "busy" || observation === "retry") {
          await this.store.update(directory, sessionID, (state) => { state.phase = "awaiting-idle"; });
        } else if (observation === "completed") {
          await this.store.update(directory, sessionID, (state) => {
            state.items = state.items.filter((item) => item.id !== state.activeItemID);
            state.activeItemID = undefined;
            state.phase = "ready";
          });
        } else if (observation === "interrupted") {
          await this.markUncertain(directory, sessionID, "OpenCode persisted this follow-up but it is unanswered; it will not be retried automatically.");
        }
        return;
      }
      if (session.phase === "awaiting-idle") {
        if (observation === "busy" || observation === "retry") return;
        if (observation === "interrupted") {
          await this.markUncertain(directory, sessionID, "The follow-up run stopped without a completed assistant response; it will not be retried automatically.");
          return;
        }
        await this.store.update(directory, sessionID, (state) => {
          state.items = state.items.filter((item) => item.id !== state.activeItemID);
          state.activeItemID = undefined;
          state.phase = "ready";
        });
        return;
      }
      if (observation === "busy" || observation === "retry") return;
      const item = session.items[0];
      if (item?.status === "uncertain") return;
      if (item?.status !== "queued") return;
      await this.store.update(directory, sessionID, (state) => {
        const active = state.items.find((candidate) => candidate.id === item.id)!;
        active.status = "sending";
        active.sendingAt = new Date().toISOString();
        active.updatedAt = active.sendingAt;
        state.activeItemID = active.id;
        state.phase = "awaiting-busy";
      });
      try {
        // A different OpenCode client can become busy after our idle check and
        // before prompt_async. There is no cross-system transaction for this race.
        await this.dependencies.send(directory, sessionID, item);
        await this.store.update(directory, sessionID, (state) => {
          const active = state.items.find((candidate) => candidate.id === item.id);
          if (active) active.acceptedAt = new Date().toISOString();
        });
      } catch (error) {
        await this.markUncertain(directory, sessionID, error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.active.delete(lock);
    }
  }

  async pause(directory: string, sessionID: string, reason: PendingPromptSession["pauseReason"] = "manual"): Promise<void> {
    await this.store.update(directory, sessionID, (session) => {
      session.paused = true;
      session.pauseReason = reason;
    });
  }

  async resume(directory: string, sessionID: string): Promise<void> {
    const current = await this.store.get(directory, sessionID);
    if (current.items.some((item) => item.status === "uncertain")) {
      throw new PendingPromptGuardError("uncertain follow-ups require manual transcript review and cannot be resumed");
    }
    await this.store.update(directory, sessionID, (session) => {
      session.paused = false;
      session.pauseReason = undefined;
    });
    await this.reconcile(directory, sessionID);
  }

  async steer(directory: string, sessionID: string, itemID: string): Promise<void> {
    const session = await this.store.get(directory, sessionID);
    const item = session.items.find((candidate) => candidate.id === itemID);
    if (!item) throw new PendingPromptGuardError("queued follow-up not found");
    if (item.status !== "queued") throw new PendingPromptGuardError("only queued follow-ups can be steered now");
    const observation = await this.dependencies.observe(directory, sessionID);
    if (observation !== "busy" && observation !== "retry") {
      throw new PendingPromptGuardError("session is idle; send this as a normal prompt");
    }
    await this.store.update(directory, sessionID, (state) => {
      const active = state.items.find((candidate) => candidate.id === itemID)!;
      active.status = "sending";
      active.sendingAt = new Date().toISOString();
      state.activeItemID = itemID;
      state.phase = "awaiting-busy";
    });
    try {
      await this.dependencies.send(directory, sessionID, item);
      await this.store.update(directory, sessionID, (state) => {
        state.items = state.items.filter((candidate) => candidate.id !== itemID);
        state.activeItemID = undefined;
        state.phase = "ready";
      });
    } catch (error) {
      await this.markUncertain(directory, sessionID, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async markUncertain(directory: string, sessionID: string, message: string): Promise<void> {
    await this.store.update(directory, sessionID, (state) => {
      const active = state.items.find((candidate) => candidate.id === state.activeItemID);
      if (active) {
        active.status = "uncertain";
        active.lastError = message;
        active.updatedAt = new Date().toISOString();
      }
      state.phase = "ready";
      state.activeItemID = undefined;
      state.paused = true;
      state.pauseReason = "uncertain";
    });
  }
}
