// Moj Ljubimac — Web Push service worker (TC ADR-05). Registered from S12 /podesavanja/podsetnici.
// A reminder push carries the API §9.4 payload { title, body, url, done_url } (≤ 4 KB). Showing the
// notification and opening `url` on click is Step 18; the done_url action ("Urađeno") is wired in Step 19.

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

function readPayload(event) {
  if (!event.data) return {}
  try {
    return event.data.json()
  } catch {
    return { body: event.data.text() }
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event)
  const title = typeof payload.title === "string" && payload.title !== "" ? payload.title : "Moj Ljubimac"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === "string" ? payload.body : "",
      icon: "/brand/app-icon-192.png",
      badge: "/brand/app-icon-192.png",
      data: {
        url: typeof payload.url === "string" && payload.url !== "" ? payload.url : "/podsetnici",
        done_url: typeof payload.done_url === "string" ? payload.done_url : null,
      },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || "/podsetnici", self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target.href && "focus" in client) return client.focus()
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
