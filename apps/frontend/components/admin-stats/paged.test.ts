import { describe, expect, it } from 'vitest'

import { normalizePaged } from './paged'

describe('normalizePaged', () => {
  it('reads the paged shapes the backend answers with', () => {
    expect(normalizePaged([1, 2])).toEqual({ items: [1, 2], total: 2 })
    expect(normalizePaged({ data: [1], total: 9 })).toEqual({ items: [1], total: 9 })
    expect(normalizePaged({ items: [1, 2, 3] })).toEqual({ items: [1, 2, 3], total: 3 })
    expect(normalizePaged(null)).toEqual({ items: [], total: 0 })
  })
})
