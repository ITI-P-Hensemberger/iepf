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

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'IEPF'
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    lang: 'it',
    data: { url: safePath(data.url) }
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin)
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
