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
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
    ]
  }
}
