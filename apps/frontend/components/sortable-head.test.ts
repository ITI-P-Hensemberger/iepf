import { describe, expect, it } from 'vitest'

import { nextSort } from './sortable-head'

describe('sorting from a header', () => {
  it('flips the direction of the sorted column and starts a new one from its first direction', () => {
    expect(nextSort({ sortBy: 'lastName', sortDir: 'asc' }, 'lastName')).toEqual({ sortBy: 'lastName', sortDir: 'desc' })
    expect(nextSort({ sortBy: 'lastName', sortDir: 'desc' }, 'lastName')).toEqual({ sortBy: 'lastName', sortDir: 'asc' })
    expect(nextSort({ sortBy: 'lastName', sortDir: 'desc' }, 'year')).toEqual({ sortBy: 'year', sortDir: 'asc' })
    expect(nextSort({ sortBy: 'year', sortDir: 'asc' }, 'startAt', 'desc')).toEqual({ sortBy: 'startAt', sortDir: 'desc' })
  })
})
