import { api } from "./api.js";

const INSTALLATION_ID_KEY = "dca-web-push-installation-id";

// Mirrored into IndexedDB because a service worker cannot read localStorage,
// and `pushsubscriptionchange` fires with no page open to ask. These three
// constants are duplicated in client/public/sw.js — a plain public asset that
// cannot import from here — and tests/web-push.test.ts asserts both copies
// agree, because a silent drift would disable self-healing without failing.
const PUSH_STATE_DB = "opencode-pwa-state";
const PUSH_STATE_STORE = "metadata";
const PUSH_IDENTITY_KEY = "pushIdentity";

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return bytes;
}

function getOrCreateInstallationId(): string {
  try {
    const existing = localStorage.getItem(INSTALLATION_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_ID_KEY, id);
    return id;
  } catch {
    // Fall back to a session-only ID if localStorage is unavailable
    return crypto.randomUUID();
  }
}

/**
 * Reads the installation token without minting one. The Settings list uses this
 * to mark the caller's own row; a device that has never subscribed has no row
 * to mark, so creating an id here would be inventing an identity for nothing.
 */
export function currentInstallationId(): string | null {
  try {
    return localStorage.getItem(INSTALLATION_ID_KEY);
  } catch {
    return null;
  }
}

function pushStateDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_STATE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PUSH_STATE_STORE)) {
        request.result.createObjectStore(PUSH_STATE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Hands the service worker the two facts it cannot otherwise obtain when the
 * browser rotates this device's subscription: which installation to re-register
 * as, and the VAPID key to re-subscribe with. `event.oldSubscription` is
 * specified to carry the key but is not reliably populated in practice, so the
 * mirrored copy is the fallback rather than the other way round.
 */
async function rememberPushIdentity(installationId: string, publicKey: string): Promise<void> {
  const database = await pushStateDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PUSH_STATE_STORE, "readwrite");
      transaction.objectStore(PUSH_STATE_STORE).put({ installationId, applicationServerKey: publicKey }, PUSH_IDENTITY_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function webPushSupported(): boolean {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("The notification service worker did not become ready")), 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null;
  const registration = await serviceWorkerRegistration();
  return registration.pushManager.getSubscription();
}

export async function subscribeWebPush(publicKey: string): Promise<PushSubscription> {
  if (!webPushSupported()) throw new Error("PWA push is unavailable in this browser or origin");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");
  const registration = await serviceWorkerRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  });
  const installationId = getOrCreateInstallationId();
  // Best-effort: a browser that refuses IndexedDB still gets working push, it
  // just loses the ability to heal itself after a rotation.
  await rememberPushIdentity(installationId, publicKey).catch(() => undefined);
  await api.addPushSubscription({ ...subscription.toJSON(), installationId });
  return subscription;
}

export async function unsubscribeWebPush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await api.removePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
