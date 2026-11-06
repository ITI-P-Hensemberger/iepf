import { describe, expect, it } from 'vitest'

import { parseInline, parseMarkdown, safeHref } from './markdown'

describe('safeHref', () => {
  it('keeps https, mailto and paths inside IEPF', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com')
    expect(safeHref('mailto:a@b.it')).toBe('mailto:a@b.it')
    expect(safeHref('/student/book')).toBe('/student/book')
  })

  it('drops everything else', () => {
    for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'http://example.com', '//evil.example', '/\\evil.example', 'nonsense']) {
      expect(safeHref(href), href).toBeNull()
    }
  })
})

describe('parseInline', () => {
  it('reads bold, italic, code and links', () => {
    expect(parseInline('**a** *b* _c_ `d` [e](https://x.it)')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'a' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'd' },
      { type: 'text', text: ' ' },
      { type: 'link', href: 'https://x.it', children: [{ type: 'text', text: 'e' }] }
    ])
  })

  it('keeps the words of an unsafe link and drops the link', () => {
    expect(parseInline('[clicca](javascript:alert(1))')).toEqual([{ type: 'text', text: 'clicca)' }])
  })

  it('leaves HTML as plain text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'text', text: '<img src=x onerror=alert(1)>' }
    ])
  })

  it('keeps unmatched markers and escaped ones as text', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ type: 'text', text: '2 * 3 = 6' }])
    expect(parseInline('\\*no\\*')).toEqual([{ type: 'text', text: '*no*' }])
  })
})

describe('parseMarkdown', () => {
  it('splits headings, lists and paragraphs', () => {
    const blocks = parseMarkdown('# Grande\n#### Piccolo\n\nRiga uno\nriga due\n\n- a\n- b\n\n1. uno\n2. due')
    expect(blocks.map(block => block.type)).toEqual(['heading', 'heading', 'paragraph', 'list', 'list'])
    expect(blocks[0]).toMatchObject({ level: 3 })
    expect(blocks[1]).toMatchObject({ level: 4 })
    expect(blocks[2]).toMatchObject({ children: [{ type: 'text', text: 'Riga uno' }, { type: 'break' }, { type: 'text', text: 'riga due' }] })
    expect(blocks[3]).toMatchObject({ ordered: false, items: [[{ text: 'a' }], [{ text: 'b' }]] })
    expect(blocks[4]).toMatchObject({ ordered: true })
  })
})
