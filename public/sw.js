const CACHE_NAME = "heartlink-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      if (cached) return cached;
      return Response.error();
    }),
  );
});

self.addEventListener("push", (event) => {
  let notification = {};
  try {
    notification = event.data ? event.data.json() : {};
  } catch (error) {
    console.error("Unable to parse Heartlink push notification:", error);
  }

  const title = typeof notification.title === "string" ? notification.title : "Heartlink";
  const options = {
    body: typeof notification.body === "string" ? notification.body : "Your partner sent you a Heartlink update.",
    icon: "/heartlink-icon-192.png",
    badge: "/heartlink-icon-192.png",
    tag: typeof notification.tag === "string" ? notification.tag : "heartlink-update",
    data: { url: typeof notification.url === "string" ? notification.url : "/" },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => client.url.startsWith(self.location.origin));
      if (matchingClient) {
        return matchingClient.focus().then(() => matchingClient.navigate(targetUrl));
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
