// When to ask again about push on this device. Every "Più tardi" pushes the next request
// further away; turning push off from the profile stops the requests on this device.

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export const SNOOZE_DAYS = [1, 3, 7, 14, 30] as const
const DAY = 24 * 60 * 60 * 1000

export type PromptState = {
  snoozes: number
  // Epoch milliseconds before which nothing is asked.
  until: number
  optedOut: boolean
  // iPhone: the step reached in the Home Screen guide, to pick up from there.
  iosStep: number
}

const EMPTY: PromptState = { snoozes: 0, until: 0, optedOut: false, iosStep: 0 }
const key = (userId: string) => `iepf:push-prompt:${userId}`

export function readPromptState(storage: KeyValueStorage, userId: string): PromptState {
  try {
    const raw = storage.getItem(key(userId))
    const saved = raw ? (JSON.parse(raw) as Partial<PromptState>) : null
    return {
      snoozes: typeof saved?.snoozes === 'number' ? saved.snoozes : 0,
      until: typeof saved?.until === 'number' ? saved.until : 0,
      optedOut: saved?.optedOut === true,
      iosStep: typeof saved?.iosStep === 'number' ? saved.iosStep : 0
    }
  } catch {
    return { ...EMPTY }
  }
}

function write(storage: KeyValueStorage, userId: string, state: PromptState) {
  try {
    storage.setItem(key(userId), JSON.stringify(state))
  } catch {
    // Private mode or full storage: the request simply comes back sooner.
  }
}

export function shouldPrompt(state: PromptState, now = Date.now()) {
  return !state.optedOut && now >= state.until
}

export function snooze(storage: KeyValueStorage, userId: string, now = Date.now()) {
  const state = readPromptState(storage, userId)
  const days = SNOOZE_DAYS[Math.min(state.snoozes, SNOOZE_DAYS.length - 1)]
  const next = { ...state, snoozes: state.snoozes + 1, until: now + days * DAY }
  write(storage, userId, next)
  return next
}

// Called from the profile: off means off here; on clears the history for a fresh start.
export function setOptedOut(storage: KeyValueStorage, userId: string, optedOut: boolean) {
  write(storage, userId, optedOut ? { ...readPromptState(storage, userId), optedOut: true } : { ...EMPTY })
}

export function rememberIosStep(storage: KeyValueStorage, userId: string, step: number) {
  write(storage, userId, { ...readPromptState(storage, userId), iosStep: step })
}

// Every invitation (header entry, popup, cards in the pages) listens to this and checks again
// what the device still needs: turning push on in one of them hides all the others.
export const PUSH_SETUP_CHANGED_EVENT = 'iepf:push-setup-changed'

export function notifyPushSetupChanged() {
  window.dispatchEvent(new Event(PUSH_SETUP_CHANGED_EVENT))
}
