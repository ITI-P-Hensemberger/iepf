import { describe, expect, it } from 'vitest'

import { diffWords } from './text-diff'

function rebuild(parts: ReturnType<typeof diffWords>, side: 'before' | 'after') {
  return parts.filter(part => part.kind === 'same' || part.kind === (side === 'before' ? 'removed' : 'added')).map(part => part.text).join('')
}

describe('diffWords', () => {
  it('marks the added and removed words', () => {
    expect(diffWords('Ha svolto gli esercizi.', 'Ha svolto da sola gli esercizi.')).toEqual([
      { kind: 'same', text: 'Ha svolto ' },
      { kind: 'added', text: 'da sola ' },
      { kind: 'same', text: 'gli esercizi.' }
    ])
    expect(diffWords('Bene. Si distrae col telefono.', 'Bene.')).toEqual([
      { kind: 'same', text: 'Bene.' },
      { kind: 'removed', text: ' Si distrae col telefono.' }
    ])
  })

  it('gives back both texts exactly', () => {
    const before = 'Ripassare  i sistemi,\npoi le disequazioni'
    const after = 'Ripassare le disequazioni e i sistemi'
    const parts = diffWords(before, after)
    expect(rebuild(parts, 'before')).toBe(before)
    expect(rebuild(parts, 'after')).toBe(after)
  })

  it('handles empty texts', () => {
    expect(diffWords('', 'Nuovo')).toEqual([{ kind: 'added', text: 'Nuovo' }])
    expect(diffWords('Vecchio', '')).toEqual([{ kind: 'removed', text: 'Vecchio' }])
    expect(diffWords('', '')).toEqual([])
  })
})
