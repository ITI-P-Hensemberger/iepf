// Service worker for push notifications only: no caching, no offline mode.
// Written by hand on purpose; keep it small, it updates on every deploy.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function safePath(url) {
  // Only paths on this site: a payload must never open another origin.
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/'
}

// The unread count on the app icon. Not every browser has it, and it must never stop
// the notification itself.
function updateBadge(count) {
  if (typeof count !== 'number' || !('setAppBadge' in self.navigator)) {
    return Promise.resolve()
  }
  const update = count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge()
  return update.catch(() => undefined)
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'IEPF'
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/icons/notification-192.png',
      badge: '/icons/notification-192.png',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      lang: 'it',
      data: { url: safePath(data.url), category: typeof data.category === 'string' ? data.category : '' }
    }),
    updateBadge(data.badge),
    // Open pages refresh the notification panel's counter without polling.
    self.clients.matchAll({ type: 'window' }).then((windows) => {
      for (const client of windows) {
        client.postMessage({ type: 'iepf:notification' })
      }
    })
  ]))
})

// Counts the opening on our own server, by kind of notification only. The page's own
// checks apply here too: nothing with Global Privacy Control, and /api/analytics drops it for
// visitors and while impersonating. A failure is ignored: it must not stop the page opening.
function countOpen(category) {
  if (self.navigator.globalPrivacyControl === true || !category) {
    return Promise.resolve()
  }
  return fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({ events: [{ event: 'push_open', detail: category, count: 1 }] })
  }).catch(() => undefined)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const target = new URL(safePath(data.url), self.location.origin)
  event.waitUntil(countOpen(data.category))
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === target.origin && 'focus' in client) {
        await client.focus()
        if ('navigate' in client) {
          await client.navigate(target.href)
        }
        return
      }
    }
    await self.clients.openWindow(target.href)
  })())
})
