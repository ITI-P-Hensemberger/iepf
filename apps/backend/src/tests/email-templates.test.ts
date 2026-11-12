import { describe, expect, it } from 'vitest'

import {
  buildActivationChangedMessage,
  buildLessonBookingCanceledMessage,
  buildLessonBookingConfirmedMessage,
  buildLessonCanceledMessage,
  buildLessonCreatedMessage,
  buildLessonPresenceUpdatedMessage,
  buildLessonReassignedMessage,
  buildLessonReminderStudentMessage,
  buildLessonReminderTutorMessage,
  buildLessonRescheduledMessage,
  buildLowFeedbackAdminMessage,
  buildSubjectRequestsAdminMessage
} from '@/lib/email-templates'

const SCRIPT = '<script>alert(1)</script>'
const LINK = '<a href="https://evil.example">clicca</a>'
const SCRIPT_ESCAPED = '&lt;script&gt;alert(1)&lt;/script&gt;'
const LINK_ESCAPED = '&lt;a href=&quot;https://evil.example&quot;&gt;clicca&lt;/a&gt;'
const startAt = new Date('2026-11-10T13:00:00Z')

function expectEscaped(html: string) {
  expect(html).not.toContain('<script')
  expect(html).not.toContain('evil.example">')
  expect(html).not.toMatch(/<a href="https:\/\/evil/)
}

describe('email templates escape user-written values in HTML', () => {
  it('renders a topic with markup as text in the tutor booking email', () => {
    for (const topic of [SCRIPT, LINK]) {
      const message = buildLessonBookingConfirmedMessage({
        recipientRole: 'tutor',
        lessonStartAt: startAt,
        subjectName: 'Matematica',
        topic,
        tutorName: 'Mario Rossi',
        studentName: 'Luca Bianchi',
        studentClass: '4A'
      })
      expectEscaped(message.html)
      expect(message.html).toContain(topic === SCRIPT
        ? SCRIPT_ESCAPED
        : LINK_ESCAPED)
      // Plain text keeps the value as the user wrote it.
      expect(message.text).toContain(topic)
    }
  })

  it('escapes topics, names, classes, subjects and reasons in every email that shows them', () => {
    const htmls = [
      buildLessonBookingConfirmedMessage({
        recipientRole: 'student',
        lessonStartAt: startAt,
        subjectName: SCRIPT,
        topic: LINK,
        tutorName: SCRIPT,
        studentName: LINK,
        studentClass: SCRIPT
      }).html,
      buildLessonBookingConfirmedMessage({
        recipientRole: 'tutor',
        lessonStartAt: startAt,
        subjectName: SCRIPT,
        topic: LINK,
        tutorName: SCRIPT,
        studentName: LINK,
        studentClass: SCRIPT
      }).html,
      ...(['student', 'tutor'] as const).flatMap(recipientRole => (['student', 'admin'] as const).map(canceledBy =>
        buildLessonBookingCanceledMessage({
          recipientRole,
          canceledBy,
          lessonStartAt: startAt,
          subjectName: SCRIPT,
          topic: LINK,
          tutorName: SCRIPT,
          studentName: LINK,
          studentClass: SCRIPT
        }).html)),
      ...(['student', 'tutor'] as const).flatMap(recipientRole => (['tutor', 'admin'] as const).map(canceledBy =>
        buildLessonCanceledMessage({
          recipientRole,
          canceledBy,
          lessonStartAt: startAt,
          subjectName: SCRIPT,
          topic: LINK,
          topics: [SCRIPT, LINK],
          tutorName: SCRIPT,
          students: [
            { name: LINK, classLabel: SCRIPT }
          ]
        }).html)),
      ...(['student', 'tutor'] as const).map(recipientRole =>
        buildLessonRescheduledMessage({
          recipientRole,
          oldStartAt: startAt,
          newStartAt: startAt,
          oldSubjectName: SCRIPT,
          newSubjectName: SCRIPT,
          oldTutorName: LINK,
          newTutorName: LINK,
          students: [
            { name: LINK, classLabel: SCRIPT }
          ]
        }).html),
      buildLessonReminderStudentMessage({
        lessonStartAt: startAt,
        subjectName: SCRIPT,
        tutorName: LINK,
        studentName: SCRIPT,
        studentClass: LINK,
        topic: SCRIPT,
        today: true
      }).html,
      buildLessonReminderTutorMessage({
        tutorName: SCRIPT,
        lessons: [
          {
            startAt,
            subjectName: SCRIPT,
            students: [
              { name: LINK, classLabel: SCRIPT }
            ],
            topics: [LINK, SCRIPT]
          }
        ],
        today: false
      }).html,
      buildLessonCreatedMessage({
        lessonId: 'lesson-1',
        lessonStartAt: startAt,
        subjectName: SCRIPT,
        tutorName: LINK
      }).html,
      buildLessonReassignedMessage({ lessonStartAt: startAt, subjectName: SCRIPT, tutorName: LINK }).html,
      buildLessonPresenceUpdatedMessage({
        lessonStartAt: startAt,
        subjectName: SCRIPT,
        tutorName: LINK,
        present: false
      }).html,
      buildLowFeedbackAdminMessage({
        authorRole: 'student',
        rating: 1,
        subjectName: SCRIPT,
        lessonStartAt: startAt,
        tutorName: LINK,
        studentName: SCRIPT,
        studentClass: null
      }).html,
      buildSubjectRequestsAdminMessage([
        { subjectName: SCRIPT, count: 1, total: 1 }
      ]).html,
      buildActivationChangedMessage(false, LINK).html
    ]
    for (const html of htmls) {
      expectEscaped(html)
      expect(html.includes(SCRIPT_ESCAPED) || html.includes(LINK_ESCAPED)).toBe(true)
    }
  })

  it('leaves ordinary values and the action URL untouched', () => {
    const message = buildLessonCreatedMessage({
      lessonId: 'lesson-1',
      lessonStartAt: startAt,
      subjectName: 'Fisica & Chimica',
      tutorName: 'Anna D\'Amico'
    })
    expect(message.html).toContain('Fisica &amp; Chimica')
    expect(message.html).toContain('Anna D&#39;Amico')
    expect(message.html).toMatch(/href="https?:\/\/[^"]+\/tutor\/lessons\/lesson-1"/)
    expect(message.text).toContain('Fisica & Chimica')
    expect(message.text).toContain('Anna D\'Amico')
  })
})

describe('lesson messages without a subject yet', () => {
  it('leave the subject out instead of naming a placeholder', () => {
    const reassigned = buildLessonReassignedMessage({ lessonStartAt: startAt, subjectName: null, tutorName: 'Sara' })
    expect(reassigned.text).toMatch(/^Un amministratore ha affidato questa lezione a un altro tutor: non devi più tenerla\.\n\nLezione\n/)
    for (const recipientRole of ['student', 'tutor'] as const) {
      const moved = buildLessonRescheduledMessage({
        recipientRole,
        oldStartAt: startAt,
        newStartAt: startAt,
        oldSubjectName: null,
        newSubjectName: null,
        oldTutorName: 'Sara',
        newTutorName: 'Luca',
        students: []
      })
      expect(moved.text).not.toContain('Materia')
      expect(moved.html).not.toContain('Materia')
      expect(moved.text).not.toContain('null')
    }
    const named = buildLessonRescheduledMessage({
      recipientRole: 'tutor',
      oldStartAt: startAt,
      newStartAt: startAt,
      oldSubjectName: null,
      newSubjectName: 'Fisica',
      oldTutorName: 'Sara',
      newTutorName: 'Luca',
      students: []
    })
    expect(named.text).toContain('\n\nFisica\nPrima: ')
  })
})
