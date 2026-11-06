import { describe, expect, it } from 'vitest'

import { countingAllowed, MAX_COUNT_PER_EVENT, MAX_EVENTS_PER_BATCH, pageTemplate, UsageQueue } from './usage-analytics'

describe('pageTemplate', () => {
  it('replaces ids with [id]', () => {
    expect(pageTemplate('/tutor/lessons/3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBe('/tutor/lessons/[id]')
    expect(pageTemplate('/admin/students/42/')).toBe('/admin/students/[id]')
    expect(pageTemplate('/')).toBe('/')
    expect(pageTemplate('/student/book')).toBe('/student/book')
  })
})

describe('countingAllowed', () => {
  it('stops for Global Privacy Control, Do Not Track and impersonation', () => {
    expect(countingAllowed({})).toBe(true)
    expect(countingAllowed({ globalPrivacyControl: true })).toBe(false)
    expect(countingAllowed({ doNotTrack: '1' })).toBe(false)
    expect(countingAllowed({ windowDoNotTrack: '1' })).toBe(false)
    expect(countingAllowed({ doNotTrack: '0' })).toBe(true)
    expect(countingAllowed({ impersonating: true })).toBe(false)
  })
})

describe('UsageQueue', () => {
  it('adds up repeated events and empties on drain', () => {
    const queue = new UsageQueue()
    queue.add('page_view', '/student')
    queue.add('page_view', '/student')
    queue.add('bell_open')
    expect(queue.drain()).toEqual([[
      { event: 'page_view', detail: '/student', count: 2 },
      { event: 'bell_open', detail: '', count: 1 }
    ]])
    expect(queue.size).toBe(0)
    expect(queue.drain()).toEqual([])
  })

  it('splits counts and batches to the limits the backend accepts', () => {
    const queue = new UsageQueue()
    for (let i = 0; i < MAX_COUNT_PER_EVENT + 1; i += 1) queue.add('bell_open')
    for (let i = 0; i < MAX_EVENTS_PER_BATCH; i += 1) queue.add('page_view', `/p${i}`)
    const batches = queue.drain()
    expect(batches.map(batch => batch.length)).toEqual([MAX_EVENTS_PER_BATCH, 2])
    expect(batches[0].slice(0, 2)).toEqual([
      { event: 'bell_open', detail: '', count: MAX_COUNT_PER_EVENT },
      { event: 'bell_open', detail: '', count: 1 }
    ])
  })
})
