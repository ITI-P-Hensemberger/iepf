// Lessons with their bookings as GET /lessons/schedule returns them, and how the views group them.
import { type SubjectOption } from '@/lib/lesson-subject'
import { dayKeyOf } from '@/lib/school-week'

export type ScheduleBooking = {
  id: string
  studentId: string
  studentName: string
  classLabel: string | null
  subjectId: string
  topic: string
  studentPresence: boolean | null
}

export type ScheduleLesson = {
  id: string
  tutorId: string
  tutorName: string
  tutorYear: number | null
  tutorDailyCapacity: number
  subjectId: string | null
  subjectName: string | null
  subjectFromBooking: boolean
  subjectOptions: SubjectOption[]
  startAt: string
  durationMinutes: number
  seats: number
  status: string
  bookingsOpen: boolean
  bookings: ScheduleBooking[]
}

export function subjectLabel(lesson: Pick<ScheduleLesson, 'subjectName'>) {
  // A lesson nobody booked has no subject yet, and shows none.
  return lesson.subjectName ?? ''
}

export function isCanceled(lesson: Pick<ScheduleLesson, 'status'>) {
  return lesson.status === 'canceled'
}

// Tutors may mark presence from the start of the lesson until two hours later.
export function canMarkPresence(lesson: Pick<ScheduleLesson, 'startAt' | 'status'>, now = new Date()) {
  const start = new Date(lesson.startAt).getTime()
  return !isCanceled(lesson) && now.getTime() >= start && now.getTime() <= start + 2 * 60 * 60 * 1000
}

export function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const list = groups.get(key(item)) ?? []
    list.push(item)
    groups.set(key(item), list)
  }
  return groups
}

export function lessonsByDay(lessons: ScheduleLesson[]) {
  return groupBy(lessons, (lesson) => dayKeyOf(new Date(lesson.startAt)))
}

// The figures above the admin's day: slots that still run, booked seats, free seats, open slots.
// Free seats stop at each tutor's daily capacity, which spans all of that tutor's lessons.
export function daySummary(lessons: ScheduleLesson[]) {
  const running = lessons.filter((lesson) => !isCanceled(lesson))
  const booked = running.reduce((sum, lesson) => sum + lesson.bookings.length, 0)
  let free = 0
  for (const tutorLessons of groupBy(running, (lesson) => lesson.tutorId).values()) {
    const tutorBooked = tutorLessons.reduce((sum, lesson) => sum + lesson.bookings.length, 0)
    const seatsLeft = tutorLessons
      .filter((lesson) => lesson.bookingsOpen)
      .reduce((sum, lesson) => sum + Math.max(0, lesson.seats - lesson.bookings.length), 0)
    free += Math.max(0, Math.min(seatsLeft, tutorLessons[0].tutorDailyCapacity - tutorBooked))
  }
  const open = running.filter((lesson) => !lesson.subjectId).length
  return { slots: running.length, booked, free, open }
}
