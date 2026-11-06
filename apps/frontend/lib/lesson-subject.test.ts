import { describe, expect, it } from 'vitest'

import { lessonSubject } from './lesson-subject'

const math = { id: 'm', name: 'Matematica' }

describe('lessonSubject', () => {
  it('shows no name for open lessons and finds known subjects', () => {
    const subjects = new Map([[math.id, math]])
    expect(lessonSubject(null, subjects)?.name).toBe('')
    expect(lessonSubject('m', subjects)).toBe(math)
    expect(lessonSubject('x', subjects)).toBeUndefined()
  })
})
