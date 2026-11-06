import { describe, expect, it } from 'vitest'

import { initialBookingSubject, lessonSubject, OPEN_SUBJECT_LABEL } from './lesson-subject'

const math = { id: 'm', name: 'Matematica' }
const physics = { id: 'f', name: 'Fisica' }

describe('lessonSubject', () => {
  it('names open lessons and finds known subjects', () => {
    const subjects = new Map([[math.id, math]])
    expect(lessonSubject(null, subjects)?.name).toBe(OPEN_SUBJECT_LABEL)
    expect(lessonSubject('m', subjects)).toBe(math)
    expect(lessonSubject('x', subjects)).toBeUndefined()
  })
})

describe('initialBookingSubject', () => {
  it('keeps the subject a lesson already has', () => {
    expect(initialBookingSubject({ subjectId: 'm', subjectOptions: [math] }, 'f')).toBe('m')
  })

  it('starts an open lesson on the subject the student searched, if offered', () => {
    expect(initialBookingSubject({ subjectId: null, subjectOptions: [math, physics] }, 'f')).toBe('f')
    expect(initialBookingSubject({ subjectId: null, subjectOptions: [math, physics] }, 'z')).toBe('')
    expect(initialBookingSubject({ subjectId: null, subjectOptions: [physics] })).toBe('f')
  })
})
