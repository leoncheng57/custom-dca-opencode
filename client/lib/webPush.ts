import { api } from "./api.js";

const INSTALLATION_ID_KEY = "dca-web-push-installation-id";

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
  await api.addPushSubscription({ ...subscription.toJSON(), installationId });
  return subscription;
}

export async function unsubscribeWebPush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await api.removePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
