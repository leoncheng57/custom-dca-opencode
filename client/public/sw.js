// Which build of this worker is actually running on a device. Decision 18
// activates a new worker only on an explicit user-approved Update, so the
// deployed sw.js and the executing sw.js routinely differ — and during the
// duplicate-notification investigation that difference was undiagnosable: "did
// you tap Update?" had to be asked instead of answered. A diagnostic push
// (payload.diag === true) appends this to the shown body, so the card itself
// names the worker that rendered it. Bump on every behavioural change.
const SW_VERSION = "3";
const BADGE_DB = "opencode-pwa-state";
const BADGE_STORE = "metadata";
// Written by client/lib/webPush.ts, which cannot be imported here. Both copies
// of these constants are asserted equal in tests/web-push.test.ts.
const PUSH_IDENTITY_KEY = "pushIdentity";
let badgeQueue = Promise.resolve();
// Serializes the read-modify-write in showCollapsed. See queueNotification.
let notificationQueue = Promise.resolve();

function badgeDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BADGE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(BADGE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storedBadgeState() {
  const database = await badgeDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(BADGE_STORE).objectStore(BADGE_STORE).get("badgeState");
    request.onsuccess = () => {
      const revision = Number(request.result?.revision);
      const count = Number(request.result?.count);
      resolve({
        revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : -1,
        count: Number.isSafeInteger(count) && count >= 0 ? count : null,
      });
    };
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

async function storeBadgeState(count, revision) {
  const database = await badgeDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BADGE_STORE, "readwrite");
    transaction.objectStore(BADGE_STORE).put({ count, revision }, "badgeState");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}

async function acceptBadgeState(count, revision) {
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(revision) || revision < 0) return;
  const stored = await storedBadgeState();
  if (revision < stored.revision || (revision === stored.revision && stored.count !== count)) return false;
  await storeBadgeState(count, revision);
  return true;
}

async function applyBadge(count, revision) {
  if (!await acceptBadgeState(count, revision)) return false;
  return applyBadgeValue(count);
}

async function applyBadgeValue(count) {
  if (count === 0 && typeof self.navigator.clearAppBadge === "function") return self.navigator.clearAppBadge();
  if (count === 0 && typeof self.navigator.setAppBadge === "function") return self.navigator.setAppBadge(0);
  if (count > 0 && typeof self.navigator.setAppBadge === "function") return self.navigator.setAppBadge(count);
  return true;
}

async function reapplyStoredBadge() {
  const stored = await storedBadgeState();
  if (stored.count !== null) await applyBadgeValue(stored.count);
}

function waitForBadgeApplied(port) {
  let releaseQueue;
  let finishLifecycle;
  const queueRelease = new Promise((resolve) => { releaseQueue = resolve; });
  const lifecycle = new Promise((resolve) => { finishLifecycle = resolve; });
  let finished = false;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    releaseQueue();
  };
  const restoreAndFinish = () => {
    if (finished) return;
    finished = true;
    badgeQueue = badgeQueue.then(reapplyStoredBadge, reapplyStoredBadge);
    void badgeQueue.finally(finishLifecycle);
  };

  const releaseTimer = setTimeout(release, 2_000);
  const abandonTimer = setTimeout(() => {
    port.close();
    release();
    restoreAndFinish();
  }, 30_000);

  port.onmessage = (message) => {
    if (message.data?.applied !== true || finished) return;
    clearTimeout(releaseTimer);
    clearTimeout(abandonTimer);
    port.close();
    if (released) {
      restoreAndFinish();
    } else {
      finished = true;
      release();
      finishLifecycle();
    }
  };

  return { queueRelease, lifecycle };
}

function queueBadge(count, revision) {
  badgeQueue = badgeQueue.then(() => applyBadge(count, revision), () => applyBadge(count, revision));
  return badgeQueue;
}

async function storedPushIdentity() {
  const database = await badgeDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(BADGE_STORE).objectStore(BADGE_STORE).get(PUSH_IDENTITY_KEY);
    request.onsuccess = () => {
      const value = request.result;
      resolve({
        installationId: typeof value?.installationId === "string" ? value.installationId : null,
        applicationServerKey: typeof value?.applicationServerKey === "string" ? value.applicationServerKey : null,
      });
    };
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

function decodeApplicationServerKey(value) {
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

/**
 * The browser rotates or invalidates a push subscription on its own schedule
 * and this event is the only signal it gives. Without it the server keeps
 * posting to an endpoint the device no longer listens on — the push service
 * still answers 200, so nothing looks broken from either side — and the only
 * recovery is a human remembering to re-save Settings. Re-registering here
 * makes that recovery automatic.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const identity = await storedPushIdentity()
        .catch(() => ({ installationId: null, applicationServerKey: null }));
      // Some browsers hand over the replacement directly; the rest expect the
      // worker to re-subscribe itself.
      let subscription = event.newSubscription ?? null;
      if (!subscription) {
        const key = event.oldSubscription?.options?.applicationServerKey
          ?? (identity.applicationServerKey ? decodeApplicationServerKey(identity.applicationServerKey) : null);
        if (!key) throw new Error("no application server key available to re-subscribe");
        subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      // The installationId is what makes this a replacement rather than an
      // append: without it the server matches on the endpoint, which by
      // definition just changed, and the dead record survives alongside the
      // live one.
      const body = subscription.toJSON();
      const response = await fetch("/api/notifications/push-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(identity.installationId ? { ...body, installationId: identity.installationId } : body),
      });
      if (!response.ok) throw new Error(`re-registration rejected with ${response.status}`);
    } catch (error) {
      // Never rethrow: this must not take down unrelated push or message
      // handling, and re-saving Settings remains the manual fallback.
      console.warn("[web-push] could not re-register a rotated subscription", error);
    }
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" ? payload.title : "OpenCode";
  const rawBody = typeof payload.body === "string" ? payload.body : "OpenCode needs your attention.";
  // Diagnostic pushes only: the card names the worker that rendered it, so
  // "which sw.js is this device actually running?" is answered by reading the
  // notification instead of asked. Never set on real notifications.
  const body = payload.diag === true ? `${rawBody} [sw v${SW_VERSION}]` : rawBody;
  const badgeCount = Number.isSafeInteger(payload.badgeCount) && payload.badgeCount >= 0 ? payload.badgeCount : null;
  const badgeRevision = Number.isSafeInteger(payload.badgeRevision) && payload.badgeRevision >= 0 ? payload.badgeRevision : null;
  let click = "/";
  try {
    const target = new URL(payload.click || "/", self.location.origin);
    if (target.origin === self.location.origin) click = `${target.pathname}${target.search}${target.hash}`;
  } catch {
    click = "/";
  }
  const badge = badgeCount === null || badgeRevision === null
    ? Promise.resolve()
    : queueBadge(badgeCount, badgeRevision);
  // Tagged so an installed PWA that is open in the foreground — and therefore
  // also showing this record via the page's own Notification — collapses the
  // two into one popup instead of buzzing the device twice for one event.
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag : null;
  event.waitUntil(Promise.all([
    queueNotification(title, body, click, tag),
    badge.catch(() => undefined),
  ]));
});

/**
 * Serializes card display so that two pushes arriving together cannot both
 * decide, independently and correctly, that there is nothing to replace.
 *
 * showCollapsed is check-then-act: it reads the shown notifications, closes the
 * matches, then shows. Run concurrently, two handlers for the same content both
 * read an empty list before either has shown anything, so neither closes
 * anything and two cards appear. That is exactly the observed failure — pushes
 * seconds apart collapsed correctly while a duplicate arriving within
 * milliseconds did not.
 *
 * Same pattern as badgeQueue above, and it must chain through rejection as well
 * as fulfilment: a single failed show must not wedge every later notification.
 */
function queueNotification(title, body, click, tag) {
  notificationQueue = notificationQueue.then(
    () => showCollapsed(title, body, click, tag),
    () => showCollapsed(title, body, click, tag),
  );
  return notificationQueue;
}

/**
 * Shows exactly one card for a given piece of content.
 *
 * `tag` is supposed to make a later notification replace an earlier one with
 * the same tag. Measured on an installed iOS PWA, it does not: two pushes sent
 * seconds apart with an identical tag and `renotify: false` produced two cards.
 * So on the platform this app is mainly read on, the replacement contract the
 * tag was chosen for simply does not hold, and any repeat stacks.
 *
 * This does the replacement by hand — find cards already showing this exact
 * title and body, close them, then show the new one.
 *
 * Deliberately close-then-show rather than skip-if-duplicate: the subscription
 * is `userVisibleOnly`, so a push handler that resolves without showing
 * anything invites the browser's own "this site was updated in the background"
 * notification. Suppressing our card could therefore replace a useful
 * notification with a useless one. Showing exactly one is the only safe shape.
 *
 * Failure here must never cost a notification, so any error falls through to
 * showing the card — a duplicate is a far cheaper mistake than silence.
 */
async function showCollapsed(title, body, click, tag) {
  try {
    // Matching on content, not tag: the whole problem is that a distinct
    // record can carry the same tag while a repeat of one record can arrive
    // with no tag at all.
    const existing = await self.registration.getNotifications();
    for (const notification of existing) {
      if (notification.title === title && notification.body === body) notification.close();
    }
  } catch {
    // getNotifications is unavailable or refused; fall through and show.
  }
  return self.registration.showNotification(title, {
    body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { click },
    ...(tag ? { tag, renotify: false } : {}),
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const click = typeof event.notification.data?.click === "string" ? event.notification.data.click : "/";
  event.waitUntil((async () => {
    const destination = new URL(click, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(destination);
      return existing.focus();
    }
    return self.clients.openWindow(destination);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (event.data?.type === "SYNC_BADGE") {
    let finishEvent;
    const eventLifetime = new Promise((resolve) => { finishEvent = resolve; });
    const update = badgeQueue
      .then(() => acceptBadgeState(event.data.count, event.data.revision), () => acceptBadgeState(event.data.count, event.data.revision))
      .then(async (accepted) => {
        const port = event.ports[0];
        if (!port || !accepted) {
          port?.postMessage({ accepted });
          finishEvent();
          return;
        }
        const lease = waitForBadgeApplied(port);
        void lease.lifecycle.finally(finishEvent);
        port.postMessage({ accepted: true });
        await lease.queueRelease;
      })
      .catch(() => finishEvent());
    badgeQueue = update;
    event.waitUntil(Promise.all([update, eventLifetime]));
  }
});
