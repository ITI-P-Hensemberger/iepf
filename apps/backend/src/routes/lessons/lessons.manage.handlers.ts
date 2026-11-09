// Purpose: Lesson management: create, cancel, reschedule and whether a lesson counts for the tutor.

import { and, eq } from 'drizzle-orm'

import type { AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import {
  buildLessonCanceledMessage,
  buildLessonCreatedMessage,
  buildLessonReassignedMessage,
  buildLessonRescheduledMessage
} from '@/lib/email-templates'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { listLessonHistory, recordLessonChange } from '@/lib/lesson-history'
import { lockUsers } from '@/lib/lesson-tokens'
import { sendMail } from '@/lib/mailer'
import { notifyUsers } from '@/lib/push'
import { lessonAssignedPush, lessonCanceledPush, lessonChangedPush, lessonCreatedPush, lessonReassignedPush } from '@/lib/push-messages'

import type {
  CancelLessonRoute,
  CreateLessonRoute,
  LessonHistoryRoute,
  RescheduleLessonRoute,
  UpdateLessonCountsRoute
} from './lessons.routes'

import {
  cancelConfirmedBookings,
  ensureAdmin,
  fetchLessonEmailDetails,
  fetchStudentsDetails,
  forbid,
  getTutorDailyBookingCount,
  getTutorDailyCapacity
} from './lessons.shared'

export const cancelLesson: AppRouteHandler<CancelLessonRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json') ?? {}
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }

  const isAdmin = currentUser.role === 'admin' && currentUser.isActive === true
  const isTutor = currentUser.role === 'tutor'

  if (!isAdmin && !isTutor) {
    forbid()
  }

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (isTutor && lesson.tutorId !== currentUser.id) {
    forbid()
  }

  const countsForTutor = isAdmin ? (payload?.countsForTutor ?? false) : false

  // The tutor lock serializes this with new bookings, so none can slip in unrefunded.
  const confirmedBookings = await db.transaction(async (tx) => {
    await lockUsers(tx, [lesson.tutorId])

    const bookings = await tx.query.lessonBookings.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: { studentId: true, subjectId: true, topic: true }
    })

    if (isTutor && bookings.length > 0) {
      return null
    }

    await tx.update(lessons)
      .set({ status: 'canceled', countsForTutor })
      .where(eq(lessons.id, lessonId))

    if (isAdmin) {
      await cancelConfirmedBookings(tx, lessonId, currentUser.id)
    }

    return bookings
  })

  if (!confirmedBookings) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  let confirmedStudentIds: string[] = []
  const topicsByStudentId = new Map<string, string | null>()
  let confirmedTopics: string[] = []
  if (isAdmin) {
    confirmedStudentIds = confirmedBookings.map(booking => booking.studentId)
    confirmedTopics = confirmedBookings
      .map(booking => booking.topic?.trim())
      .filter((topic): topic is string => Boolean(topic))
    for (const booking of confirmedBookings) {
      topicsByStudentId.set(booking.studentId, booking.topic ?? null)
    }
  }

  if (isAdmin && confirmedStudentIds.length > 0) {
    const lessonDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, lesson.subjectId ?? confirmedBookings[0].subjectId)
    const studentsMap = await fetchStudentsDetails(confirmedStudentIds)
    if (lessonDetails) {
      for (const studentId of confirmedStudentIds) {
        const studentDetails = studentsMap.get(studentId)
        if (!studentDetails?.email) {
          continue
        }
        const studentMessage = buildLessonCanceledMessage({
          recipientRole: 'student',
          canceledBy: 'admin',
          lessonStartAt: new Date(lesson.startAt),
          subjectName: lessonDetails.subjectName,
          topic: topicsByStudentId.get(studentId) ?? null,
          tutorName: lessonDetails.tutorName,
          students: [{ name: studentDetails.name, classLabel: studentDetails.classLabel }]
        })
        sendMail({
          to: studentDetails.email,
          subject: studentMessage.subject,
          text: studentMessage.text,
          html: studentMessage.html
        }).catch(err => console.error('Failed to send lesson canceled email:', err))
      }

      if (lessonDetails.tutorEmail) {
        const studentList = confirmedStudentIds
          .map((id) => {
            const student = studentsMap.get(id)
            return student ? { name: student.name, classLabel: student.classLabel } : null
          })
          .filter((student): student is { name: string, classLabel: string | null } => Boolean(student))
        const tutorMessage = buildLessonCanceledMessage({
          recipientRole: 'tutor',
          canceledBy: 'admin',
          lessonStartAt: new Date(lesson.startAt),
          subjectName: lessonDetails.subjectName,
          topics: Array.from(new Set(confirmedTopics)),
          tutorName: lessonDetails.tutorName,
          students: studentList
        })
        sendMail({
          to: lessonDetails.tutorEmail,
          subject: tutorMessage.subject,
          text: tutorMessage.text,
          html: tutorMessage.html
        }).catch(err => console.error('Failed to send tutor lesson canceled email:', err))
      }

      const canceledLesson = { lessonId: lesson.id, subjectName: lessonDetails.subjectName, startAt: new Date(lesson.startAt) }
      notifyUsers(confirmedStudentIds, 'bookings', lessonCanceledPush('student', canceledLesson))
      notifyUsers([lesson.tutorId], 'bookings', lessonCanceledPush('tutor', canceledLesson))
    }
  }

  return c.json({ message: 'Lezione annullata' }, HttpStatusCodes.OK)
}

export const updateLessonCounts: AppRouteHandler<UpdateLessonCountsRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdmin(c)

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const [updated] = await db.update(lessons)
    .set({ countsForTutor: payload.countsForTutor })
    .where(eq(lessons.id, lessonId))
    .returning({
      id: lessons.id,
      tutorId: lessons.tutorId,
      subjectId: lessons.subjectId,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      countsForTutor: lessons.countsForTutor,
      status: lessons.status,
      subjectFromBooking: lessons.subjectFromBooking
    })

  const bookingCount = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, updated.id),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { id: true }
  })
  const dailyCapacity = await getTutorDailyCapacity(updated.tutorId)
  const dailyBookings = await getTutorDailyBookingCount(updated.tutorId, new Date(updated.startAt))
  const availableSeats = Math.max(0, updated.seats - bookingCount.length)

  return c.json(
    {
      id: updated.id,
      tutorId: updated.tutorId,
      subjectId: updated.subjectId,
      startAt: new Date(updated.startAt).toISOString(),
      durationMinutes: updated.durationMinutes,
      status: updated.status,
      subjectFromBooking: updated.subjectFromBooking,
      lessonCapacity: updated.seats,
      dailyCapacity,
      dailyOccupancy: dailyBookings,
      availableSeats,
      countsForTutor: updated.countsForTutor ?? false
    },
    HttpStatusCodes.OK
  )
}

export const rescheduleLesson: AppRouteHandler<RescheduleLessonRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const admin = ensureAdmin(c)

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (lesson.status === 'canceled') {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const newStartAt = new Date(payload.startAt)
  // Without a subject the lesson keeps letting bookings choose it, starting from the one it has now.
  const subjectFromBooking = payload.subjectId === null
  const newSubjectId = payload.subjectId ?? lesson.subjectId

  const outcome = await db.transaction(async (tx) => {
    await lockUsers(tx, [lesson.tutorId, payload.tutorId])

    // Read again under the lock: "before" is what this change replaces, not what an earlier read saw.
    const [previous] = await tx.select()
      .from(lessons)
      .where(eq(lessons.id, lesson.id))
      .for('update')

    if (!previous || previous.status === 'canceled') {
      return null
    }

    const bookings = await tx.query.lessonBookings.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: { studentId: true, studentPresence: true }
    })

    const tutorChanged = previous.tutorId !== payload.tutorId
    const seats = await getTutorDailyCapacity(payload.tutorId, tx)

    // The lesson keeps its id, bookings and feedback: links already sent still lead to it.
    await tx.update(lessons)
      .set({
        tutorId: payload.tutorId,
        subjectId: newSubjectId,
        subjectFromBooking,
        startAt: newStartAt,
        durationMinutes: payload.durationMinutes,
        seats,
        // A new tutor is credited only for presences already marked; the same tutor keeps the flag.
        countsForTutor: tutorChanged
          ? bookings.some(booking => booking.studentPresence !== null)
          : previous.countsForTutor
      })
      .where(eq(lessons.id, lesson.id))

    // Bookings follow the subject the admin set; kept open, they keep their own.
    if (newSubjectId !== null && bookings.length > 0) {
      await tx.update(lessonBookings)
        .set({ subjectId: newSubjectId })
        .where(and(
          eq(lessonBookings.lessonId, lesson.id),
          eq(lessonBookings.status, 'confirmed')
        ))
    }

    const changed = tutorChanged
      || previous.subjectId !== newSubjectId
      || previous.startAt.getTime() !== newStartAt.getTime()
      || previous.durationMinutes !== payload.durationMinutes

    const [oldDetails, newDetails] = changed
      ? await Promise.all([
          fetchLessonEmailDetails(lesson.id, previous.tutorId, previous.subjectId),
          fetchLessonEmailDetails(lesson.id, payload.tutorId, newSubjectId)
        ])
      : [null, null]

    if (changed) {
      await recordLessonChange(tx, {
        lessonId: lesson.id,
        actorId: admin.id,
        before: {
          startAt: previous.startAt.toISOString(),
          durationMinutes: previous.durationMinutes,
          tutorId: previous.tutorId,
          tutorName: oldDetails?.tutorName ?? '',
          subjectId: previous.subjectId,
          subjectName: oldDetails?.subjectName ?? null
        },
        after: {
          startAt: newStartAt.toISOString(),
          durationMinutes: payload.durationMinutes,
          tutorId: payload.tutorId,
          tutorName: newDetails?.tutorName ?? '',
          subjectId: newSubjectId,
          subjectName: newDetails?.subjectName ?? null
        }
      })
    }

    return { previous, bookings, tutorChanged, changed, oldDetails, newDetails }
  })

  if (!outcome) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const { previous, bookings, tutorChanged, changed, oldDetails, newDetails } = outcome
  const studentIds = bookings.map(booking => booking.studentId)

  // A tutor who loses or gains the lesson hears about it even when nobody booked it.
  if (changed && (studentIds.length > 0 || tutorChanged)) {
    const studentsMap = await fetchStudentsDetails(studentIds)

    if (oldDetails && newDetails) {
      const studentList = studentIds
        .map((id) => {
          const student = studentsMap.get(id)
          return student ? { name: student.name, classLabel: student.classLabel } : null
        })
        .filter((student): student is { name: string, classLabel: string | null } => Boolean(student))

      for (const studentId of studentIds) {
        const student = studentsMap.get(studentId)
        if (!student?.email) {
          continue
        }
        const studentMessage = buildLessonRescheduledMessage({
          recipientRole: 'student',
          oldStartAt: previous.startAt,
          newStartAt,
          oldSubjectName: oldDetails.subjectName,
          newSubjectName: newDetails.subjectName,
          oldTutorName: oldDetails.tutorName,
          newTutorName: newDetails.tutorName,
          students: [{ name: student.name, classLabel: student.classLabel }],
          rescheduledByAdmin: true
        })
        sendMail({
          to: student.email,
          subject: studentMessage.subject,
          text: studentMessage.text,
          html: studentMessage.html
        }).catch(err => console.error('Failed to send reschedule email:', err))
      }

      if (newDetails.tutorEmail) {
        const tutorMessage = buildLessonRescheduledMessage({
          recipientRole: 'tutor',
          oldStartAt: previous.startAt,
          newStartAt,
          oldSubjectName: oldDetails.subjectName,
          newSubjectName: newDetails.subjectName,
          oldTutorName: oldDetails.tutorName,
          newTutorName: newDetails.tutorName,
          students: studentList,
          rescheduledByAdmin: true
        })
        sendMail({
          to: newDetails.tutorEmail,
          subject: tutorMessage.subject,
          text: tutorMessage.text,
          html: tutorMessage.html
        }).catch(err => console.error('Failed to send tutor reschedule email:', err))
      }

      if (tutorChanged && oldDetails.tutorEmail) {
        const reassignedMessage = buildLessonReassignedMessage({
          lessonStartAt: previous.startAt,
          subjectName: oldDetails.subjectName,
          tutorName: oldDetails.tutorName
        })
        sendMail({
          to: oldDetails.tutorEmail,
          subject: reassignedMessage.subject,
          text: reassignedMessage.text,
          html: reassignedMessage.html
        }).catch(err => console.error('Failed to send lesson reassigned email:', err))
      }

      const before = { lessonId: lesson.id, subjectName: oldDetails.subjectName, startAt: previous.startAt, durationMinutes: previous.durationMinutes }
      const after = { lessonId: lesson.id, subjectName: newDetails.subjectName, startAt: newStartAt, durationMinutes: payload.durationMinutes }
      const studentPush = lessonChangedPush('student', before, after, tutorChanged)
      if (studentPush) {
        notifyUsers(studentIds, 'bookings', studentPush)
      }
      if (tutorChanged) {
        notifyUsers([previous.tutorId], 'bookings', lessonReassignedPush(before))
        notifyUsers([payload.tutorId], 'bookings', lessonAssignedPush(after, studentIds.length))
      }
      else {
        const tutorPush = lessonChangedPush('tutor', before, after, false)
        if (tutorPush) {
          notifyUsers([payload.tutorId], 'bookings', tutorPush)
        }
      }
    }
  }

  return c.json(
    {
      message: 'Lezione riprogrammata',
      lessonId: lesson.id
    },
    HttpStatusCodes.OK
  )
}

export const lessonHistory: AppRouteHandler<LessonHistoryRoute> = async (c) => {
  ensureAdmin(c)
  const { lessonId } = c.req.valid('param')
  return c.json(await listLessonHistory(lessonId), HttpStatusCodes.OK)
}

export const createLesson: AppRouteHandler<CreateLessonRoute> = async (c) => {
  const payload = c.req.valid('json')
  ensureAdmin(c)

  const newStartAt = new Date(payload.startAt)
  // No subject: an open lesson, whose first booking picks one of the tutor's subjects.
  const subjectId = payload.subjectId ?? null
  const dailyCapacity = await getTutorDailyCapacity(payload.tutorId)
  const seats = dailyCapacity

  const [newLesson] = await db.insert(lessons).values({
    tutorId: payload.tutorId,
    subjectId,
    subjectFromBooking: subjectId === null,
    startAt: newStartAt,
    durationMinutes: payload.durationMinutes,
    seats,
    status: 'scheduled'
  }).returning({
    id: lessons.id
  })

  const details = await fetchLessonEmailDetails(newLesson.id, payload.tutorId, subjectId)
  if (details?.tutorEmail) {
    const message = buildLessonCreatedMessage({
      lessonId: newLesson.id,
      lessonStartAt: newStartAt,
      subjectName: details.subjectName,
      tutorName: details.tutorName
    })
    sendMail({
      to: details.tutorEmail,
      subject: message.subject,
      text: message.text,
      html: message.html
    }).catch(err => console.error('Failed to send lesson created email:', err))
  }
  if (details) {
    notifyUsers([payload.tutorId], 'lessons', lessonCreatedPush({ lessonId: newLesson.id, subjectName: details.subjectName, startAt: newStartAt }))
  }

  return c.json(
    {
      message: 'Lezione creata',
      lessonId: newLesson.id
    },
    HttpStatusCodes.CREATED
  )
}
