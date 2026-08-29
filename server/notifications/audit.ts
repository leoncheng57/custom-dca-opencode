/**
 * Privacy-safe structured audit logs for the notification delivery pipeline
 * and auto-approval decisions.
 *
 * All identifiers (directory paths, session IDs, request IDs, notification
 * record IDs) are HMAC-hashed before logging. The raw values never appear in
 * logs — only their correlation IDs do. This lets operators correlate events
 * across the pipeline without exposing sensitive paths or identifiers.
 *
 * The HMAC key is read from `NOTIFICATION_AUDIT_HMAC_KEY`. If absent, a random
 * key is generated at startup. This is acceptable because:
 * 1. Correlation still works within a single process lifetime
 * 2. Cross-restart correlation is a nice-to-have, not a requirement
 * 3. The alternative (failing closed) would block the entire notification system
 */

import { createHmac, randomBytes } from "node:crypto";

import { auditLogWriter } from "./auditLog.js";
import type { SuppressionReason } from "./history.js";
import type { NotifyEvent } from "./preferences.js";

// -----------------------------------------------------------------------------
// HMAC correlation ID generation
// -----------------------------------------------------------------------------

const HMAC_KEY: Buffer = process.env.NOTIFICATION_AUDIT_HMAC_KEY
  ? Buffer.from(process.env.NOTIFICATION_AUDIT_HMAC_KEY, "utf8")
  : randomBytes(32);

/**
 * Generate a privacy-safe correlation ID from a sensitive identifier.
 * Returns a truncated HMAC-SHA256 hex string (16 chars = 64 bits).
 *
 * The truncation is intentional: these are correlation tokens for log analysis,
 * not cryptographic commitments. 64 bits provides sufficient collision resistance
 * for the expected cardinality of sessions/directories/requests.
 */
export function correlationId(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return createHmac("sha256", HMAC_KEY).update(value).digest("hex").slice(0, 16);
}

// -----------------------------------------------------------------------------
// Audit event types (closed vocabulary)
// -----------------------------------------------------------------------------

/**
 * Audit event types. This is a closed vocabulary — only these exact strings
 * are valid. Adding a new event type requires updating this union and the
 * corresponding payload type.
 */
export type AuditEventType =
  | "auto_approval_restore_completed"
  | "permission_asked_observed"
  | "auto_approval_reply"
  | "notification_decided"
  | "webpush_delivery_finished";

// -----------------------------------------------------------------------------
// Audit event payloads (per-event-type structured data)
// -----------------------------------------------------------------------------

export interface AutoApprovalRestoreCompletedPayload {
  /** Number of directories restored from the state file. */
  restoredCount: number;
  /** Whether the restore succeeded or failed. */
  outcome: "success" | "file_not_found" | "parse_error" | "stat_error";
}

export interface PermissionAskedObservedPayload {
  /** Correlation ID for the directory (HMAC of path). */
  directoryCorrelation: string | undefined;
  /** Correlation ID for the session (HMAC of session ID). */
  sessionCorrelation: string | undefined;
  /** Correlation ID for the permission request (HMAC of request ID). */
  requestCorrelation: string | undefined;
  /** Whether auto-approval is enabled for this directory. */
  autoApprovalEnabled: boolean;
}

export interface AutoApprovalReplyPayload {
  /** Correlation ID for the directory (HMAC of path). */
  directoryCorrelation: string | undefined;
  /** Correlation ID for the permission request (HMAC of request ID). */
  requestCorrelation: string | undefined;
  /** The outcome of the auto-approval attempt. */
  outcome: "approved" | "already_handled" | "not_found" | "error";
}

export interface NotificationDecidedPayload {
  /** Correlation ID for the notification record (HMAC of record ID). */
  recordCorrelation: string | undefined;
  /** Correlation ID for the directory (HMAC of path). */
  directoryCorrelation: string | undefined;
  /** Correlation ID for the session (HMAC of session ID). */
  sessionCorrelation: string | undefined;
  /** The notification kind (permission, idle, error, etc.). */
  kind: NotifyEvent;
  /** The decision outcome. */
  outcome: "delivered" | "suppressed";
  /** If suppressed, the reason. */
  suppressionReason: SuppressionReason | undefined;
}

export interface WebpushDeliveryFinishedPayload {
  /** Correlation ID for the notification record (HMAC of record ID). */
  recordCorrelation: string | undefined;
  /** Number of subscriptions that received the push successfully. */
  sent: number;
  /** Number of subscriptions that failed. */
  failed: number;
  /** Number of expired subscriptions that were cleaned up. */
  expired: number;
}

// -----------------------------------------------------------------------------
// Audit event structure
// -----------------------------------------------------------------------------

export interface AuditEvent<T extends AuditEventType = AuditEventType> {
  /** ISO 8601 timestamp. */
  ts: string;
  /** The audit subsystem identifier. */
  audit: "notification";
  /** The event type from the closed vocabulary. */
  event: T;
  /** Event-specific payload (structure depends on event type). */
  payload: T extends "auto_approval_restore_completed"
    ? AutoApprovalRestoreCompletedPayload
    : T extends "permission_asked_observed"
    ? PermissionAskedObservedPayload
    : T extends "auto_approval_reply"
    ? AutoApprovalReplyPayload
    : T extends "notification_decided"
    ? NotificationDecidedPayload
    : T extends "webpush_delivery_finished"
    ? WebpushDeliveryFinishedPayload
    : never;
}

// -----------------------------------------------------------------------------
// Logging function
// -----------------------------------------------------------------------------

type PayloadFor<T extends AuditEventType> = AuditEvent<T>["payload"];

/**
 * Emit a structured audit log event as a single JSON line.
 *
 * The durable destination is `.state/logs/audit.jsonl`, a file this process
 * owns and bounds (see `auditLog.ts`). It is deliberately NOT duplicated to
 * stdout in production: audit lines were 83% of the unrotated launchd log, so
 * moving them is what bounds that file without rotating a descriptor launchd
 * holds open.
 *
 * Outside production the line is also echoed to stdout, because `npm run dev`
 * runs the BFF in a terminal and silently losing audit output there would be a
 * real regression. The supervised LaunchAgent sets NODE_ENV=production
 * (`scripts/launchd.ts`), so the echo is off exactly where growth matters.
 */
export function logAuditEvent<T extends AuditEventType>(
  event: T,
  payload: PayloadFor<T>,
): void {
  const auditEvent: AuditEvent<T> = {
    ts: new Date().toISOString(),
    audit: "notification",
    event,
    payload,
  };
  const line = JSON.stringify(auditEvent);
  if (process.env.NODE_ENV !== "production") console.log(line);
  auditLogWriter().append(line);
}
