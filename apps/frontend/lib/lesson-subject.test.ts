import { describe, expect, it } from 'vitest'

import { lessonSubject, OPEN_SUBJECT_LABEL } from './lesson-subject'

const math = { id: 'm', name: 'Matematica' }

describe('lessonSubject', () => {
  it('names open lessons and finds known subjects', () => {
    const subjects = new Map([[math.id, math]])
    expect(lessonSubject(null, subjects)?.name).toBe(OPEN_SUBJECT_LABEL)
    expect(lessonSubject('m', subjects)).toBe(math)
    expect(lessonSubject('x', subjects)).toBeUndefined()
  })
})
