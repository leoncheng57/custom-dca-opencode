import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import webpush from "web-push";

import type { NotificationMessage } from "./ntfy.js";

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  installationId?: string;
}

interface StoredPushSubscriptionRecord extends PushSubscriptionRecord {
  id: string;
  addedAt: number;
}

interface StoredSubscriptions {
  version: 1;
  subscriptions: StoredPushSubscriptionRecord[];
}

export const MAX_PUSH_SUBSCRIPTIONS = 32;
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);

function trustedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && (PUSH_HOSTS.has(url.hostname) || url.hostname.endsWith(".notify.windows.com"));
  } catch {
    return false;
  }
}

function validSubscription(value: unknown): PushSubscriptionRecord | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const keys = source.keys && typeof source.keys === "object" ? source.keys as Record<string, unknown> : null;
  if (typeof source.endpoint !== "string" || source.endpoint.length > 2048
    || !trustedPushEndpoint(source.endpoint)
    || !keys || typeof keys.p256dh !== "string" || keys.p256dh.length > 512
    || typeof keys.auth !== "string" || keys.auth.length > 512) return null;
  const installationId = source.installationId;
  if (installationId !== undefined && (typeof installationId !== "string" || installationId.length > 256)) return null;
  return {
    endpoint: source.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    ...(installationId !== undefined ? { installationId } : {}),
  };
}

export class PushSubscriptionStore {
  private pending = Promise.resolve();

  constructor(readonly file = process.env.WEB_PUSH_SUBSCRIPTIONS_FILE || path.resolve(process.cwd(), ".state/web-push-subscriptions.json")) {}

  async list(): Promise<PushSubscriptionRecord[]> {
    const stored = await this.listStored();
    return stored.map(({ endpoint, keys, installationId }) => ({
      endpoint,
      keys,
      ...(installationId !== undefined ? { installationId } : {}),
    }));
  }

  private async listStored(): Promise<StoredPushSubscriptionRecord[]> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as StoredSubscriptions;
      if (parsed.version !== 1 || !Array.isArray(parsed.subscriptions) || parsed.subscriptions.length > MAX_PUSH_SUBSCRIPTIONS) {
        throw new Error("invalid Web Push subscription store");
      }
      const subscriptions = parsed.subscriptions.map((item) => {
        const valid = validSubscription(item);
        if (!valid) return null;
        // Backward compatibility: stored records might lack id/addedAt
        const id = typeof item.id === "string" ? item.id : randomUUID();
        const addedAt = typeof item.addedAt === "number" ? item.addedAt : Date.now();
        return { ...valid, id, addedAt };
      });
      if (subscriptions.some((item) => item === null)) throw new Error("invalid Web Push subscription store");
      return subscriptions as StoredPushSubscriptionRecord[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async add(value: unknown): Promise<void> {
    const subscription = validSubscription(value);
    if (!subscription) throw new Error("invalid push subscription");
    await this.queue(async () => {
      let subscriptions = await this.listStored();
      
      // If the incoming subscription has an installationId, replace any existing
      // record with the same installationId (updating endpoint/keys/addedAt but keeping the same id)
      if (subscription.installationId) {
        const existingIndex = subscriptions.findIndex((item) => item.installationId === subscription.installationId);
        if (existingIndex !== -1) {
          const existing = subscriptions[existingIndex];
          subscriptions[existingIndex] = {
            ...subscription,
            id: existing.id,
            addedAt: Date.now(),
          };
          await this.writeStored(subscriptions);
          return;
        }
      }
      
      // Fall back to endpoint-based deduplication (old behavior)
      subscriptions = subscriptions.filter((item) => item.endpoint !== subscription.endpoint);
      subscriptions.push({
        ...subscription,
        id: randomUUID(),
        addedAt: Date.now(),
      });
      
      if (subscriptions.length > MAX_PUSH_SUBSCRIPTIONS) {
        throw new Error(`at most ${MAX_PUSH_SUBSCRIPTIONS} push subscriptions are allowed`);
      }
      await this.writeStored(subscriptions);
    });
  }

  async remove(endpoint: string, expectedKeys?: PushSubscriptionRecord["keys"]): Promise<void> {
    await this.queue(async () => {
      await this.writeStored((await this.listStored()).filter((item) => item.endpoint !== endpoint
        || (expectedKeys !== undefined && (item.keys.p256dh !== expectedKeys.p256dh || item.keys.auth !== expectedKeys.auth))));
    });
  }

  async removeById(id: string): Promise<void> {
    await this.queue(async () => {
      await this.writeStored((await this.listStored()).filter((item) => item.id !== id));
    });
  }

  async removeAll(): Promise<void> {
    await this.queue(async () => {
      await this.writeStored([]);
    });
  }

  async summaries(): Promise<Array<{ id: string; addedAt: number; label: string }>> {
    const stored = await this.listStored();
    return stored.map((item) => ({
      id: item.id,
      addedAt: item.addedAt,
      label: `Registered ${new Date(item.addedAt).toISOString()}`,
    }));
  }

  private async queue(operation: () => Promise<void>): Promise<void> {
    const result = this.pending.then(operation, operation);
    this.pending = result.catch(() => undefined);
    await result;
  }

  private async writeStored(subscriptions: StoredPushSubscriptionRecord[]): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, subscriptions }, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.file);
  }
}

export interface WebPushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function webPushConfig(env: NodeJS.ProcessEnv = process.env): WebPushConfig | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = env;
  if (!publicKey && !privateKey && !subject) return null;
  if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/u.test(subject)) {
    throw new Error("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be configured together");
  }
  // Validate key encoding and subject now so the BFF cannot advertise a
  // channel that will fail only after a user subscribes.
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, privateKey, subject };
}

export async function sendWebPush(
  subscriptions: PushSubscriptionRecord[],
  message: NotificationMessage,
  config = webPushConfig(),
): Promise<{ sent: number; failed: number; expired: string[] }> {
  if (!config) throw new Error("Web Push is not configured");
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const click = typeof message.click === "string" && message.click.length <= 2048 ? message.click : undefined;
  const badgeCount = Number.isSafeInteger(message.badgeCount) && Number(message.badgeCount) >= 0
    ? Number(message.badgeCount)
    : undefined;
  const badgeRevision = Number.isSafeInteger(message.badgeRevision) && Number(message.badgeRevision) >= 0
    ? Number(message.badgeRevision)
    : undefined;
  const tag = typeof message.tag === "string" && message.tag.length <= 128 ? message.tag : undefined;
  const payload = JSON.stringify({ title: message.title, body: message.body, click, badgeCount, badgeRevision, tag });
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60, timeout: 10_000 });
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = error && typeof error === "object" ? (error as { statusCode?: unknown }).statusCode : undefined;
      if (statusCode === 404 || statusCode === 410) expired.push(subscription.endpoint);
    }
  }));
  return { sent, failed, expired };
}
