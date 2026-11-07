// The theme a signed-in user picked is theirs: whoever opens the site signed out (a first
// visit, or after logging out) gets the device's theme. The choice waits under another key and
// comes back at the next login.
export const THEME_KEY = 'theme'
export const USER_THEME_KEY = 'theme-user'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>

// Signed out: put the user's choice aside, so next-themes falls back to the system theme.
export function parkUserTheme(storage: Storage) {
  const chosen = storage.getItem(THEME_KEY)
  if (chosen && chosen !== 'system') storage.setItem(USER_THEME_KEY, chosen)
  storage.removeItem(THEME_KEY)
  return chosen !== null && chosen !== 'system'
}

// Signed in: the choice put aside, if any, to apply again.
export function takeUserTheme(storage: Storage) {
  const parked = storage.getItem(USER_THEME_KEY)
  storage.removeItem(USER_THEME_KEY)
  return parked
}
