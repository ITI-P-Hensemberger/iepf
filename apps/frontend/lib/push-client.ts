'use client'

import type { PushEnvironment } from '@/lib/push-platform'

export type PushSupport =
  | 'supported'
  // iPhone and iPad: push only once the site is added to the Home Screen.
  | 'ios-needs-install'
  | 'unsupported'

// Only the kinds people can switch off: lesson changes, account and the empty week always arrive.
export const USER_CATEGORIES = ['bookings', 'reminders', 'feedback', 'lessons'] as const
export const ADMIN_CATEGORIES = [
  'adminLowFeedback',
  'adminLateCancellations',
  'adminAbsences',
  'adminPendingAdmins',
  'adminSubjectRequests',
  'adminMissingPresence'
] as const
export type UserCategory = typeof USER_CATEGORIES[number]
export type AdminCategory = typeof ADMIN_CATEGORIES[number]
// Admin email switches: emailAdminLowFeedback for adminLowFeedback, and so on.
export type EmailPreference = `email${Capitalize<AdminCategory>}`
export type PreferenceKey = UserCategory | AdminCategory | EmailPreference
export type PushPreferences = Record<PreferenceKey, boolean>

export function emailPreference(category: AdminCategory): EmailPreference {
  return `email${category.charAt(0).toUpperCase()}${category.slice(1)}` as EmailPreference
}

function isIos() {
  const { userAgent, maxTouchPoints } = navigator
  // iPadOS reports itself as a Mac, but a Mac has no touch screen.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function detectPushSupport(): PushSupport {
  if (typeof window === 'undefined') {
    return 'unsupported'
  }
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (isIos() && !isStandalone()) {
    return 'ios-needs-install'
  }
  return hasApi ? 'supported' : 'unsupported'
}

function decodeKey(base64Url: string) {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, char => char.charCodeAt(0))
}

async function currentRegistration() {
  if (!('serviceWorker' in navigator)) {
    return null
  }
  return (await navigator.serviceWorker.getRegistration('/')) ?? null
}

export async function currentSubscription() {
  const registration = await currentRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON()
  const response = await fetch('/api/notifications/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
  })
  if (!response.ok) {
    throw new Error(response.status === 403
      ? 'Le notifiche si attivano solo dal proprio account, non durante un\'impersonazione.'
      : 'Non è stato possibile salvare l\'iscrizione alle notifiche.')
  }
}

// Must run from a click: browsers (Safari above all) refuse a permission prompt otherwise.
export async function enablePush() {
  const configResponse = await fetch('/api/notifications/push/config', { cache: 'no-store' })
  const config = configResponse.ok ? await configResponse.json() as { enabled: boolean, publicKey: string | null } : null
  if (!config?.enabled || !config.publicKey) {
    throw new Error('Le notifiche push non sono ancora disponibili su questo sito.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Le notifiche sono bloccate per questo sito: riattivale dalle impostazioni del browser.'
      : 'Permesso non concesso.')
  }

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const applicationServerKey = decodeKey(config.publicKey)
  let subscription = await registration.pushManager.getSubscription()
  // A subscription made with other keys (changed VAPID keys) would never receive anything.
  const existingKey = subscription?.options.applicationServerKey
  if (subscription && existingKey && !sameBytes(new Uint8Array(existingKey), applicationServerKey)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  await saveSubscription(subscription)
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

// Re-confirms the device to the backend, which forgets devices silent for months.
export async function refreshPushSubscription() {
  if (detectPushSupport() !== 'supported' || Notification.permission !== 'granted') {
    return false
  }
  const subscription = await currentSubscription()
  if (!subscription) {
    return false
  }
  await saveSubscription(subscription)
  return true
}

export async function disablePush() {
  const subscription = await currentSubscription()
  if (!subscription) {
    return
  }
  await fetch('/api/notifications/push/subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  })
  await subscription.unsubscribe()
}

// --- Guided setup: the popup, the cards and the profile all read the device the same way.

export function isImpersonating() {
  return typeof document !== 'undefined'
    && document.cookie.split(';').some(cookie => cookie.trim() === 'iepf_impersonating=true')
}

export async function readPushEnvironment(): Promise<PushEnvironment> {
  const hasPushApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const permission = 'Notification' in window ? Notification.permission : null
  const hasSubscription = hasPushApi && permission === 'granted'
    ? Boolean(await currentSubscription().catch(() => null))
    : false
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(),
    hasPushApi,
    permission,
    hasSubscription
  }
}

// The header, the popup and the cards all ask: one request per page load is enough.
let configured: Promise<boolean> | null = null

export function isPushConfigured() {
  configured ??= (async () => {
    try {
      const response = await fetch('/api/notifications/push/config', { cache: 'no-store' })
      if (!response.ok) return false
      const config = await response.json() as { enabled?: boolean }
      return config.enabled === true
    } catch {
      return false
    }
  })()
  return configured
}

// Callers asking at the same moment share one request; the next call asks again.
let devicesInFlight: Promise<number | null> | null = null

export function fetchDeviceCount(): Promise<number | null> {
  devicesInFlight ??= (async () => {
    try {
      const response = await fetch('/api/notifications/push/devices', { cache: 'no-store' })
      if (!response.ok) return null
      const payload = await response.json() as { count?: number }
      return typeof payload.count === 'number' ? payload.count : null
    } catch {
      return null
    } finally {
      devicesInFlight = null
    }
  })()
  return devicesInFlight
}

export async function emailSetupLink() {
  const response = await fetch('/api/notifications/push/setup-link', { method: 'POST' })
  if (response.status === 429) {
    throw new Error('Ti abbiamo appena mandato il link: controlla la posta, o riprova tra qualche minuto.')
  }
  if (!response.ok) {
    throw new Error('Non è stato possibile mandare l\'email.')
  }
}

// A local notification right after enabling: proof that it works, with nothing sent by the server.
export async function showTestNotification() {
  const registration = await currentRegistration()
  await registration?.showNotification('Notifiche attive', {
    body: 'Da ora gli avvisi di IEPF arrivano anche qui.',
    icon: '/icons/notification-192.png',
    tag: 'iepf-push-test'
  })
}
