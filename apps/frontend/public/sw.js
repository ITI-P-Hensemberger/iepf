// next-pwa is gone, but browsers may still run the worker it once registered, and a 404
// here would leave that worker in charge. This replaces it, clears its caches and removes
// itself. Safe to delete once no browser can still hold the old registration.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.map(name => caches.delete(name)))
    await self.registration.unregister()
    const pages = await self.clients.matchAll({ type: 'window' })
    await Promise.all(pages.map(page => page.navigate(page.url)))
  })())
})
