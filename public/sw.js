// RogueMeso service worker — Web Push delivery for ADHD Mode reminders.
// Served at the root so its scope is "/". Kept tiny and dependency-free; it only
// renders pushed notifications and routes Snooze/Done taps back to the server.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "RogueMeso", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "RogueMeso";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag,
    renotify: true,
    // "Plate clank" haptic — a double knock followed by a heavier hit.
    vibrate: [70, 40, 70, 40, 180],
    data: payload.data || {},
    actions: payload.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};

  if (action === "snooze" || action === "done") {
    event.waitUntil(
      fetch("/api/push/action", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      }).catch(() => {}),
    );
    return;
  }

  // Body tap → focus an open tab or open the ADHD Mode page.
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientsList.find((c) => c.url.includes("/adhd-mode")) || clientsList[0];
      if (existing) return existing.focus();
      return self.clients.openWindow("/adhd-mode");
    })(),
  );
});
