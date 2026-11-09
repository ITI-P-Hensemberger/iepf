import { describe, expect, it } from 'vitest'

import { pathWithQuery, safeFrom, withFrom } from './back-link'

describe('back links', () => {
  it('accepts only paths on this site', () => {
    expect(safeFrom('/admin/students/1?tab=hours')).toBe('/admin/students/1?tab=hours')
    expect(safeFrom('https://example.com')).toBeNull()
    expect(safeFrom('//example.com/admin')).toBeNull()
    expect(safeFrom('/\\example.com')).toBeNull()
    expect(safeFrom('/\t/example.com')).toBeNull()
    expect(safeFrom('home')).toBeNull()
    expect(safeFrom(null)).toBeNull()
  })

  it('adds from to a link, keeping its query and nesting the previous one', () => {
    const lesson = withFrom('/admin/lessons/7', '/admin/students/1?tab=lessons')
    expect(lesson).toBe('/admin/lessons/7?from=%2Fadmin%2Fstudents%2F1%3Ftab%3Dlessons')
    const feedback = withFrom('/admin/feedback?feedbackLesson=7', lesson)
    const back = new URL(feedback, 'http://local').searchParams.get('from')
    expect(back).toBe(lesson)
    expect(new URL(back!, 'http://local').searchParams.get('from')).toBe('/admin/students/1?tab=lessons')
  })

  it('writes a path with its query only when there is one', () => {
    expect(pathWithQuery('/admin', '')).toBe('/admin')
    expect(pathWithQuery('/admin/lessons', 'day=2026-11-09')).toBe('/admin/lessons?day=2026-11-09')
  })
})
