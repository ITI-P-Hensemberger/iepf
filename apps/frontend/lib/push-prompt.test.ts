import { describe, expect, it } from 'vitest'

import { readPromptState, rememberIosStep, setOptedOut, shouldPrompt, snooze } from './push-prompt'

const DAY = 24 * 60 * 60 * 1000

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value)
  }
}

describe('push prompt', () => {
  it('asks right away the first time', () => {
    expect(shouldPrompt(readPromptState(memoryStorage(), 'alice'), 0)).toBe(true)
  })

  it('waits 1, 3, 7, 14 and then 30 days after each "later"', () => {
    const storage = memoryStorage()
    let now = 0
    const waits: number[] = []
    for (let index = 0; index < 7; index++) {
      const state = snooze(storage, 'alice', now)
      waits.push((state.until - now) / DAY)
      expect(shouldPrompt(state, state.until - 1)).toBe(false)
      expect(shouldPrompt(state, state.until)).toBe(true)
      now = state.until
    }
    expect(waits).toEqual([1, 3, 7, 14, 30, 30, 30])
  })

  it('stops after turning push off, and starts over after turning it on', () => {
    const storage = memoryStorage()
    snooze(storage, 'alice', 0)
    setOptedOut(storage, 'alice', true)
    expect(shouldPrompt(readPromptState(storage, 'alice'), 100 * DAY)).toBe(false)
    setOptedOut(storage, 'alice', false)
    expect(readPromptState(storage, 'alice')).toEqual({ snoozes: 0, until: 0, optedOut: false, iosStep: 0 })
  })

  it('keeps users apart and remembers the iPhone step', () => {
    const storage = memoryStorage()
    rememberIosStep(storage, 'alice', 2)
    snooze(storage, 'alice', 0)
    expect(readPromptState(storage, 'alice').iosStep).toBe(2)
    expect(readPromptState(storage, 'bob')).toMatchObject({ snoozes: 0, iosStep: 0 })
  })

  it('treats broken storage as a first visit', () => {
    const storage = memoryStorage()
    storage.setItem('iepf:push-prompt:alice', 'not json')
    expect(shouldPrompt(readPromptState(storage, 'alice'), 0)).toBe(true)
  })
})
