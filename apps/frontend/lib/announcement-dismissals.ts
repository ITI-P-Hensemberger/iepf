// Which popups this browser already closed. once_account is filtered by the backend; the
// other two modes live here, per user, so two people on one browser do not share them.

export type DismissMode = 'once_account' | 'once_device' | 'every_session'

export type ActiveAnnouncement = {
  id: string
  title: string
  body: string
  linkUrl: string | null
  linkLabel: string | null
  dismissMode: DismissMode
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

const LOGIN_KEY = 'iepf:login-session'
const deviceKey = (userId: string) => `iepf:popups:device:${userId}`
const sessionKey = (userId: string) => `iepf:popups:session:${userId}`

function readJson<T>(storage: KeyValueStorage, key: string): T | null {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(storage: KeyValueStorage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or full storage: the popup simply shows again next time.
  }
}

// Called after every successful login: every_session popups come back with a new id.
export function startLoginSession(storage: KeyValueStorage, id = crypto.randomUUID()) {
  try {
    storage.setItem(LOGIN_KEY, id)
  } catch {
    // See writeJson.
  }
}

function currentLogin(storage: KeyValueStorage) {
  try {
    return storage.getItem(LOGIN_KEY) ?? ''
  } catch {
    return ''
  }
}

function sessionIds(storage: KeyValueStorage, userId: string) {
  const saved = readJson<{ login: string, ids: string[] }>(storage, sessionKey(userId))
  return saved && saved.login === currentLogin(storage) && Array.isArray(saved.ids) ? saved.ids : []
}

function deviceIds(storage: KeyValueStorage, userId: string) {
  const saved = readJson<string[]>(storage, deviceKey(userId))
  return Array.isArray(saved) ? saved : []
}

export function isDismissedHere(storage: KeyValueStorage, userId: string, announcement: ActiveAnnouncement) {
  switch (announcement.dismissMode) {
    case 'once_device':
      return deviceIds(storage, userId).includes(announcement.id)
    case 'every_session':
      return sessionIds(storage, userId).includes(announcement.id)
    default:
      return false
  }
}

export function rememberDismissal(storage: KeyValueStorage, userId: string, announcement: ActiveAnnouncement) {
  if (announcement.dismissMode === 'once_device') {
    writeJson(storage, deviceKey(userId), [...new Set([...deviceIds(storage, userId), announcement.id])])
  } else if (announcement.dismissMode === 'every_session') {
    writeJson(storage, sessionKey(userId), {
      login: currentLogin(storage),
      ids: [...new Set([...sessionIds(storage, userId), announcement.id])]
    })
  }
}
