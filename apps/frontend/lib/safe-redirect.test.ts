import { describe, expect, it } from 'vitest'

import { safeInternalPath } from './safe-redirect'

describe('safeInternalPath', () => {
  it.each([
    ['/admin', '/admin'],
    ['/admin/stats?tab=feedback', '/admin/stats?tab=feedback'],
    ['/student/book#lesson', '/student/book#lesson'],
    ['/', '/']
  ])('keeps the internal path %s', (value, expected) => {
    expect(safeInternalPath(value)).toBe(expected)
  })

  it.each([
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    'admin',
    ''
  ])('refuses %j', (value) => {
    expect(safeInternalPath(value)).toBeNull()
  })

  it('refuses a missing value', () => {
    expect(safeInternalPath(null)).toBeNull()
    expect(safeInternalPath(undefined)).toBeNull()
  })
})
