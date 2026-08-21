import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const NOTIFY_EVENTS = ["idle", "error", "abort", "permission", "question", "parked"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export interface NotificationPreferences {
  version: 1;
  ntfy: {
    enabled: boolean;
    server: string;
    topic: string;
    events: Record<NotifyEvent, boolean>;
  };
  browser: {
    desktop: boolean;
    sound: boolean;
    volume: number;
    events: Record<NotifyEvent, boolean>;
  };
  parkedPermissionSeconds: number;
}

const DEFAULT_EVENTS: Record<NotifyEvent, boolean> = {
  idle: true,
  error: true,
  abort: false,
  permission: true,
  question: true,
  parked: true,
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  version: 1,
  ntfy: {
    enabled: false,
    server: "https://ntfy.sh",
    topic: "",
    events: { ...DEFAULT_EVENTS },
  },
  browser: {
    desktop: true,
    sound: false,
    volume: 0.5,
    events: { ...DEFAULT_EVENTS },
  },
  parkedPermissionSeconds: 30,
};

function eventMap(value: unknown): Record<NotifyEvent, boolean> {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    NOTIFY_EVENTS.map((event) => [event, typeof source[event] === "boolean" ? source[event] : DEFAULT_EVENTS[event]]),
  ) as Record<NotifyEvent, boolean>;
}

export function trustedNtfyOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NTFY_SERVER ?? "https://ntfy.sh";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.username || url.password || url.search || url.hash) {
    throw new Error("NTFY_SERVER must be an HTTP(S) origin");
  }
  return url.origin;
}

function validServer(value: unknown): string {
  if (typeof value !== "string") throw new Error("ntfy.server must be an HTTP(S) origin");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.username || url.password || url.search || url.hash) {
    throw new Error("ntfy.server must be an HTTP(S) origin");
  }
  const trusted = trustedNtfyOrigin();
  if (url.origin !== trusted) {
    throw new Error("ntfy.server is fixed by NTFY_SERVER on the BFF");
  }
  return trusted;
}

function validTopic(value: unknown): string {
  if (typeof value !== "string" || (value && !/^[A-Za-z0-9_.~-]{1,64}$/.test(value))) {
    throw new Error("ntfy.topic must use 1-64 letters, digits, '.', '_', '~' or '-'");
  }
  return value;
}

export function normalizePreferences(value: unknown): NotificationPreferences {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const ntfy = source.ntfy && typeof source.ntfy === "object" ? (source.ntfy as Record<string, unknown>) : {};
  const browser = source.browser && typeof source.browser === "object" ? (source.browser as Record<string, unknown>) : {};
  const seconds = Number(source.parkedPermissionSeconds ?? 30);
  const volume = Number(browser.volume ?? 0.5);
  return {
    version: 1,
    ntfy: {
      enabled: ntfy.enabled === true,
      server: validServer(ntfy.server ?? "https://ntfy.sh"),
      topic: validTopic(ntfy.topic ?? ""),
      events: eventMap(ntfy.events),
    },
    browser: {
      desktop: browser.desktop !== false,
      sound: browser.sound === true,
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.5,
      events: eventMap(browser.events),
    },
    parkedPermissionSeconds: Number.isFinite(seconds) ? Math.max(5, Math.min(3600, Math.trunc(seconds))) : 30,
  };
}

export class PreferenceStore {
  constructor(
    readonly file = process.env.NOTIFICATION_PREFS_FILE || path.resolve(process.cwd(), ".state/notification-prefs.json"),
  ) {}

  async read(): Promise<NotificationPreferences> {
    try {
      return normalizePreferences(JSON.parse(await readFile(this.file, "utf8")));
    } catch {
      const topic = process.env.NTFY_TOPIC ?? DEFAULT_NOTIFICATION_PREFERENCES.ntfy.topic;
      return normalizePreferences({
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ntfy: {
          ...DEFAULT_NOTIFICATION_PREFERENCES.ntfy,
          enabled: Boolean(topic),
          server: trustedNtfyOrigin(),
          topic,
        },
      });
    }
  }

  async write(value: unknown): Promise<NotificationPreferences> {
    const normalized = normalizePreferences(value);
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.file);
    return normalized;
  }
}
