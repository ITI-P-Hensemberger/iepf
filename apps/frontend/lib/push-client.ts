'use client'

export type PushSupport =
  | 'supported'
  // iPhone and iPad: push only once the site is added to the Home Screen.
  | 'ios-needs-install'
  | 'unsupported'

export const USER_CATEGORIES = ['bookings', 'reminders', 'feedback', 'account', 'lessons'] as const
export const ADMIN_CATEGORIES = [
  'adminLowFeedback',
  'adminLateCancellations',
  'adminAbsences',
  'adminEmptyWeek',
  'adminPendingAdmins',
  'adminSubjectRequests'
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
