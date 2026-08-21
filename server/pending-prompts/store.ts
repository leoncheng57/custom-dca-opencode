import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PromptInput } from "../opencode/sessions.js";

export const MAX_PENDING_ITEMS = 20;
export const MAX_PENDING_BYTES = 64 * 1024 * 1024;

export type PendingPauseReason = "manual" | "stopped" | "interrupted" | "uncertain";
export type PendingItemStatus = "queued" | "sending" | "uncertain";

export interface PendingPromptItem extends PromptInput {
  id: string;
  idempotencyKey: string;
  directory: string;
  sessionID: string;
  sequence: number;
  status: PendingItemStatus;
  createdAt: string;
  updatedAt: string;
  sendingAt?: string;
  acceptedAt?: string;
  bytes: number;
  lastError?: string;
}

export interface PendingPromptSession {
  directory: string;
  sessionID: string;
  paused: boolean;
  pauseReason?: PendingPauseReason;
  phase: "ready" | "awaiting-busy" | "awaiting-idle";
  activeItemID?: string;
  items: PendingPromptItem[];
  updatedAt: string;
}

interface PendingPromptFile {
  version: 1;
  nextSequence: number;
  sessions: PendingPromptSession[];
}

function keyOf(directory: string, sessionID: string): string {
  return `${directory}\0${sessionID}`;
}

function inputBytes(input: PromptInput): number {
  return Buffer.byteLength(JSON.stringify(input), "utf8");
}

function emptySession(directory: string, sessionID: string): PendingPromptSession {
  return {
    directory,
    sessionID,
    paused: false,
    phase: "ready",
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

export class PendingPromptLimitError extends Error {}
export class PendingPromptGuardError extends Error {}

export class PendingPromptStore {
  private sessions = new Map<string, PendingPromptSession>();
  private nextSequence = 1;
  private loaded = false;
  private operations: Promise<void> = Promise.resolve();

  constructor(
    readonly file = process.env.FOLLOWUPS_FILE || path.resolve(process.cwd(), ".state/followups.json"),
    private readonly limits = { items: MAX_PENDING_ITEMS, bytes: MAX_PENDING_BYTES },
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as PendingPromptFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) return;
      this.nextSequence = Math.max(Number(parsed.nextSequence) || 1, 1);
      let recovered = false;
      for (const session of parsed.sessions) {
        const ambiguous = session.items.some((item) => item.status === "sending") || session.phase !== "ready";
        if (ambiguous) {
          recovered = true;
          session.paused = true;
          session.pauseReason = "uncertain";
          session.phase = "ready";
          session.activeItemID = undefined;
          session.items = session.items.map((item) => item.status === "sending" ? {
            ...item,
            status: "uncertain",
            updatedAt: new Date().toISOString(),
            lastError: "The BFF restarted while this follow-up was sending; it will not be retried automatically.",
          } : item);
        }
        session.items.sort((a, b) => a.sequence - b.sequence);
        this.sessions.set(keyOf(session.directory, session.sessionID), session);
      }
      if (recovered) await this.persistNow();
    } catch {
      // Missing or malformed state starts empty. The next mutation replaces it atomically.
    }
  }

  async all(): Promise<PendingPromptSession[]> {
    await this.load();
    await this.operations;
    return structuredClone([...this.sessions.values()]);
  }

  async get(directory: string, sessionID: string): Promise<PendingPromptSession> {
    await this.load();
    await this.operations;
    return structuredClone(this.sessions.get(keyOf(directory, sessionID)) ?? emptySession(directory, sessionID));
  }

  async add(directory: string, sessionID: string, idempotencyKey: string, input: PromptInput): Promise<PendingPromptItem> {
    return this.mutate((session) => {
      const duplicate = session.items.find((item) => item.idempotencyKey === idempotencyKey);
      if (duplicate) return duplicate;
      const bytes = inputBytes(input);
      if (session.items.length >= this.limits.items) {
        throw new PendingPromptLimitError(`at most ${this.limits.items} queued follow-ups are allowed per session`);
      }
      if (session.items.reduce((sum, item) => sum + item.bytes, 0) + bytes > this.limits.bytes) {
        throw new PendingPromptLimitError(`queued follow-ups may use at most ${this.limits.bytes} bytes per session`);
      }
      const now = new Date().toISOString();
      const item: PendingPromptItem = {
        id: randomUUID(), idempotencyKey, directory, sessionID, sequence: this.nextSequence++,
        ...input, status: "queued", createdAt: now, updatedAt: now, bytes,
      };
      session.items.push(item);
      return item;
    }, directory, sessionID);
  }

  async edit(directory: string, sessionID: string, itemID: string, text: string): Promise<PendingPromptItem> {
    return this.mutate((session) => {
      const index = session.items.findIndex((item) => item.id === itemID);
      if (index < 0) throw new PendingPromptGuardError("queued follow-up not found");
      if (session.items[index].status !== "queued") throw new PendingPromptGuardError("only queued follow-ups can be edited");
      const current = session.items[index];
      const bytes = inputBytes({ text, mode: current.mode, model: current.model, attachments: current.attachments, reminder: current.reminder });
      const total = session.items.reduce((sum, item, itemIndex) => sum + (itemIndex === index ? bytes : item.bytes), 0);
      if (total > this.limits.bytes) throw new PendingPromptLimitError(`queued follow-ups may use at most ${this.limits.bytes} bytes per session`);
      const item = { ...session.items[index], text, bytes, updatedAt: new Date().toISOString() };
      session.items[index] = item;
      return item;
    }, directory, sessionID);
  }

  async remove(directory: string, sessionID: string, itemID: string): Promise<void> {
    await this.mutate((session) => {
      const item = session.items.find((candidate) => candidate.id === itemID);
      if (!item) throw new PendingPromptGuardError("queued follow-up not found");
      if (item.status !== "queued") throw new PendingPromptGuardError("only queued follow-ups can be removed");
      session.items = session.items.filter((candidate) => candidate.id !== itemID);
    }, directory, sessionID);
  }

  async update(directory: string, sessionID: string, change: (session: PendingPromptSession) => void): Promise<PendingPromptSession> {
    return this.mutate((session) => {
      change(session);
      return session;
    }, directory, sessionID);
  }

  private async mutate<T>(change: (session: PendingPromptSession) => T, directory: string, sessionID: string): Promise<T> {
    await this.load();
    let result!: T;
    const operation = this.operations.then(async () => {
      const key = keyOf(directory, sessionID);
      const session = this.sessions.get(key) ?? emptySession(directory, sessionID);
      this.sessions.set(key, session);
      result = change(session);
      session.updatedAt = new Date().toISOString();
      await this.persistNow();
    });
    this.operations = operation.catch(() => undefined);
    await operation;
    return structuredClone(result);
  }

  private async persistNow(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const contents = `${JSON.stringify({ version: 1, nextSequence: this.nextSequence, sessions: [...this.sessions.values()] } satisfies PendingPromptFile, null, 2)}\n`;
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, contents, { mode: 0o600 });
    await rename(temporary, this.file);
  }
}
