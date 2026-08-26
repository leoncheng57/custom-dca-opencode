// server/opencode/instruction-audit.ts
//
// Audit ledger for machine-authored instructions this BFF sends to child
// sessions (issue #91).
//
// The contract is explicit, never inferred: a record is appended only at the
// moment the BFF itself submits an instruction — a Managed Child launch
// assignment or a Managed Child follow-up prompt. Nothing here parses
// transcript wording, and lanes the BFF does not operate (native task prompts
// authored by an agent, external orchestration controllers) are deliberately
// absent; the UI states that gap rather than fabricating records for it.
//
// Delivery states mirror what the BFF actually observed:
//   - "acknowledged": upstream confirmed receipt (prompt_async answered 204).
//   - "rejected":     the send was refused, with a safe reason — either the
//                     BFF's own verification failed or upstream errored.
// "queued" never persists because the BFF holds no queue: a send either
// reaches upstream in-request or it fails in-request.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type InstructionSource = "managed-child-launch" | "managed-child-prompt";
export type InstructionDelivery = "acknowledged" | "rejected";

export interface InstructionRecord {
  id: string;
  /** Epoch milliseconds at which the send settled. */
  at: number;
  source: InstructionSource;
  directory: string;
  /** The child session the instruction addressed. */
  targetSessionID: string;
  /** The parent whose delegated-work panel should surface this record. */
  parentSessionID?: string;
  targetAgent?: string;
  /** Redacted, bounded instruction text. */
  text: string;
  truncated?: true;
  delivery: InstructionDelivery;
  /** Safe failure reason; present only when delivery is "rejected". */
  reason?: string;
}

export interface AppendInstruction {
  source: InstructionSource;
  directory: string;
  targetSessionID: string;
  parentSessionID?: string;
  targetAgent?: string;
  text: string;
  delivery: InstructionDelivery;
  reason?: string;
}

const TEXT_LIMIT = 4_000;
const REASON_LIMIT = 500;
const RECORD_LIMIT = 500;

/**
 * Strip credential-shaped substrings before the text is persisted or shown.
 *
 * Deliberately scoped to shapes that are almost certainly secrets. Ordinary
 * development artifacts (git SHAs, file paths, code) survive, because an
 * audit log of instructions that redacts the instruction is useless.
 */
export function redactInstructionText(text: string): string {
  return text
    // URL userinfo credentials: scheme://user:pass@host
    .replace(/\b([a-z][a-z\d+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/giu, "$1[redacted]@")
    // Well-known token prefixes (GitHub, OpenAI-style, Slack).
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/gu, "[redacted-token]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/gu, "[redacted-token]")
    .replace(/\bxox[a-z]-[A-Za-z0-9-]{10,}\b/gu, "[redacted-token]")
    // Authorization header values.
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu, "$1 [redacted]")
    // key=value / key: value assignments for secret-named keys.
    .replace(
      /\b((?:api[_-]?key|access[_-]?key|secret|token|password|passwd|authorization|credential)s?\s*[:=]\s*)(["']?)[^\s"']+\2/giu,
      "$1$2[redacted]$2",
    );
}

function bounded(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: `${text.slice(0, limit - 1)}…`, truncated: true };
}

function normalizeRecord(value: unknown): InstructionRecord | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const at = Number(source.at);
  if (
    typeof source.id !== "string" ||
    !Number.isFinite(at) ||
    (source.source !== "managed-child-launch" && source.source !== "managed-child-prompt") ||
    typeof source.directory !== "string" ||
    typeof source.targetSessionID !== "string" ||
    typeof source.text !== "string" ||
    (source.delivery !== "acknowledged" && source.delivery !== "rejected")
  ) {
    return null;
  }
  return {
    id: source.id,
    at,
    source: source.source,
    directory: source.directory,
    targetSessionID: source.targetSessionID,
    ...(typeof source.parentSessionID === "string" && source.parentSessionID
      ? { parentSessionID: source.parentSessionID }
      : {}),
    ...(typeof source.targetAgent === "string" && source.targetAgent ? { targetAgent: source.targetAgent } : {}),
    text: source.text,
    ...(source.truncated === true ? { truncated: true as const } : {}),
    delivery: source.delivery,
    ...(typeof source.reason === "string" && source.reason ? { reason: source.reason } : {}),
  };
}

/**
 * Append-only instruction ledger with a durability file, mirroring the
 * notification HistoryStore idiom: reads from memory, serialized atomic
 * writes, bounded retention, and a corrupt or missing file starts empty
 * because losing audit history must never block the prompt path itself.
 */
export class InstructionAuditStore {
  private records: InstructionRecord[] = [];
  private loaded: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private writeCounter = 0;

  constructor(
    readonly file = process.env.INSTRUCTION_AUDIT_FILE ||
      path.resolve(process.cwd(), ".state/instruction-audit.json"),
    private readonly limit = RECORD_LIMIT,
  ) {}

  private load(): Promise<void> {
    this.loaded ??= readFile(this.file, "utf8")
      .then((raw) => {
        const parsed: unknown = JSON.parse(raw);
        const source = Array.isArray((parsed as Record<string, unknown>)?.records)
          ? ((parsed as Record<string, unknown>).records as unknown[])
          : [];
        this.records = source
          .map(normalizeRecord)
          .filter((record): record is InstructionRecord => record !== null);
        this.prune();
      })
      .catch(() => {
        this.records = [];
      });
    return this.loaded;
  }

  private persist(): void {
    const snapshot = this.records.slice();
    this.queue = this.queue
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${process.pid}.${(this.writeCounter += 1)}.tmp`;
        await writeFile(temporary, `${JSON.stringify({ version: 1, records: snapshot }, null, 2)}\n`, {
          mode: 0o600,
        });
        await rename(temporary, this.file);
      })
      .catch((error: unknown) => {
        console.warn("[instruction-audit]", error instanceof Error ? error.message : String(error));
      });
  }

  private prune(): void {
    if (this.records.length > this.limit) {
      this.records = this.records.slice(this.records.length - this.limit);
    }
  }

  /** Resolves once every queued write has drained. Tests and shutdown use this. */
  flush(): Promise<void> {
    return this.queue;
  }

  async append(entry: AppendInstruction): Promise<InstructionRecord> {
    await this.load();
    const body = bounded(redactInstructionText(entry.text), TEXT_LIMIT);
    const reason = entry.reason === undefined
      ? undefined
      : bounded(redactInstructionText(entry.reason), REASON_LIMIT).text;
    const record: InstructionRecord = {
      id: randomUUID(),
      at: Date.now(),
      source: entry.source,
      directory: entry.directory,
      targetSessionID: entry.targetSessionID,
      ...(entry.parentSessionID ? { parentSessionID: entry.parentSessionID } : {}),
      ...(entry.targetAgent ? { targetAgent: entry.targetAgent } : {}),
      text: body.text,
      ...(body.truncated ? { truncated: true as const } : {}),
      delivery: entry.delivery,
      ...(reason ? { reason } : {}),
    };
    this.records.push(record);
    this.prune();
    this.persist();
    return record;
  }

  /**
   * Records addressed to `sessionID`, or sent to its children when the record
   * names it as parent. Newest first, bounded.
   */
  async list(directory: string, sessionID: string, limit = 100): Promise<InstructionRecord[]> {
    await this.load();
    return this.records
      .filter(
        (record) =>
          record.directory === directory &&
          (record.targetSessionID === sessionID || record.parentSessionID === sessionID),
      )
      .slice(-limit)
      .reverse();
  }
}

/**
 * Process-wide ledger. Recording must never fail the send it audits, so
 * callers go through this fire-and-forget helper rather than awaiting
 * persistence on the prompt path.
 */
export const instructionAudit = new InstructionAuditStore();

export function recordInstruction(entry: AppendInstruction): void {
  void instructionAudit.append(entry).catch((error: unknown) => {
    console.warn("[instruction-audit]", error instanceof Error ? error.message : String(error));
  });
}
