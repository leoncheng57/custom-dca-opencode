self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" ? payload.title : "OpenCode";
  const body = typeof payload.body === "string" ? payload.body : "OpenCode needs your attention.";
  let click = "/";
  try {
    const target = new URL(payload.click || "/", self.location.origin);
    if (target.origin === self.location.origin) click = `${target.pathname}${target.search}${target.hash}`;
  } catch {
    click = "/";
  }
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { click },
  }));
});

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
});
