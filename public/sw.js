// Moj Ljubimac — Web Push service worker (TC ADR-05). Registered from S12 /podesavanja/podsetnici.
// A reminder push carries the API §9.4 payload { title, body, url, done_url } (≤ 4 KB). Showing the
// notification and opening `url` on click is Step 18. Step 19: the notification gets a "Urađeno" action
// (Design §9.1 reminder_push; "Done" when the browser language is English) that opens `done_url`, the
// signed EP-32 link that marks the reminder done and shows the confirmation page.

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

function doneActionTitle() {
  const language = (self.navigator && self.navigator.language) || ""
  return language.toLowerCase().startsWith("en") ? "Done" : "Urađeno"
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event)
  const title = typeof payload.title === "string" && payload.title !== "" ? payload.title : "Moj Ljubimac"
  const doneUrl = typeof payload.done_url === "string" && payload.done_url !== "" ? payload.done_url : null
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === "string" ? payload.body : "",
      icon: "/brand/app-icon-192.png",
      badge: "/brand/app-icon-192.png",
      data: {
        url: typeof payload.url === "string" && payload.url !== "" ? payload.url : "/podsetnici",
        done_url: doneUrl,
      },
      actions: doneUrl ? [{ action: "done", title: doneActionTitle() }] : [],
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  if (event.action === "done" && data.done_url) {
    event.waitUntil(self.clients.openWindow(new URL(data.done_url, self.location.origin).href))
    return
  }
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
