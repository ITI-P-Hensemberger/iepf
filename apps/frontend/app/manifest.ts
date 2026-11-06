import type { MetadataRoute } from 'next'

// Minimal web app manifest: on iPhone, push notifications only work once the site is added
// to the Home Screen, and that needs a manifest with display standalone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'IEPF - InsiemeÈ+Facile',
    short_name: 'IEPF',
    description: 'Tutoraggio tra studenti',
    lang: 'it',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Dark like the home screen icon, so the launch screen and the icon look like one app.
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    // The plain icons are the same opaque artwork as the maskable ones. Chrome without Google
    // Play Services (no WebAPK) adds a shortcut from the plain icon and crops it to the
    // launcher's shape: a transparent icon with a large mark came out clipped on a black circle.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android crops these to its own shape: opaque dark background, mark inside the safe zone.
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }
}
