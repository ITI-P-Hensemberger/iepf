// Purpose: Types and formatting helpers for the admin lesson details page.
import { classLabel } from '@/lib/class-label'
import { type SubjectOption } from '@/lib/lesson-subject'

export const AVAILABLE_TIMES = ['13:00', '14:00', '15:00', '16:00']
// Reschedule choice that leaves the subject to the bookings, as on generated lessons.
export const OPEN_SUBJECT_VALUE = '__open__'

export type Lesson = {
  id: string
  tutorId: string
  subjectId: string | null
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyCapacity?: number | null
  dailyOccupancy?: number | null
  availableSeats: number
  countsForTutor?: boolean | null
  status: string
  // True when bookings choose the subject: subjectId stays null until the first one.
  subjectFromBooking?: boolean
  subjectOptions?: SubjectOption[]
}

export type Booking = {
  id: string
  lessonId: string
  studentId: string
  topic: string
  status: string
  studentPresence: boolean | null
  studentPresenceAt: string | null
  countsForStudent?: boolean | null
}

export type Tutor = {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  year?: number | null
  sectionName?: string | null
}

export type Student = {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  year?: number | null
  sectionName?: string | null
}

export type Subject = {
  id: string
  name: string
}

export type PagedPayloadObject<T> = {
  items?: T[]
  total?: number
  data?: PagedPayloadObject<T>
  rows?: T[]
  results?: T[]
}

export function normalizePaged<T>(payload: unknown): { items: T[]; total: number } {
  if (!payload) {
    return { items: [], total: 0 }
  }
  if (Array.isArray(payload)) {
    return { items: payload as T[], total: payload.length }
  }
  if (typeof payload !== 'object' || payload === null) {
    return { items: [], total: 0 }
  }

  const candidate = payload as PagedPayloadObject<T>
  const items = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray(candidate.rows)
      ? candidate.rows
      : Array.isArray(candidate.results)
        ? candidate.results
        : Array.isArray((candidate as Record<string, unknown>).data)
          ? (candidate as Record<string, unknown>).data
          : []
  const total =
    typeof candidate.total === 'number'
      ? candidate.total
      : Array.isArray(candidate.items)
        ? candidate.items.length
        : Array.isArray(candidate.rows)
          ? candidate.rows.length
          : Array.isArray(candidate.results)
            ? candidate.results.length
            : Array.isArray(candidate.data?.items)
              ? candidate.data!.items!.length
              : Array.isArray(candidate.data?.rows)
                ? candidate.data!.rows!.length
                : Array.isArray(candidate.data?.results)
                  ? candidate.data!.results!.length
                  : 0
  return { items: items as T[], total }
}

export function formatBookingStatus(status?: string | null) {
  if (!status) {
    return '-'
  }
  const normalized = status.toLowerCase()
  const mapping: Record<string, string> = {
    confirmed: 'Confermato',
    canceled: 'Annullato',
    cancelled: 'Annullato'
  }
  return mapping[normalized] ?? status
}

export function countsBadgeLabel(value?: boolean | null) {
  if (value === true) {
    return 'Conteggiata'
  }
  if (value === false) {
    return 'Non conteggiata'
  }
  return '-'
}

export function countsBadgeVariant(value?: boolean | null): 'default' | 'secondary' {
  return value ? 'default' : 'secondary'
}

export function isCanceledStatus(status?: string | null) {
  if (!status) {
    return false
  }
  const normalized = status.toLowerCase()
  return normalized === 'canceled' || normalized === 'cancelled'
}

export function timeFromDate(value?: string | null) {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  const hours = `${parsed.getHours()}`.padStart(2, '0')
  const minutes = `${parsed.getMinutes()}`.padStart(2, '0')
  return `${hours}:${minutes}`
}

export function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const combined = new Date(date)
  combined.setHours(hours || 0, minutes || 0, 0, 0)
  return combined
}

export function isCanceledBooking(status?: string | null) {
  if (!status) {
    return false
  }
  const normalized = status.toLowerCase()
  return normalized === 'canceled' || normalized === 'cancelled'
}

export function lessonOccupiedSeats(lesson?: Lesson | null) {
  if (!lesson || typeof lesson.availableSeats !== 'number') {
    return 0
  }
  return Math.max(0, lesson.lessonCapacity - lesson.availableSeats)
}

export function parseNumeric(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function lessonDailySeatsLabel(lesson?: Lesson | null) {
  if (!lesson) {
    return '-'
  }
  const occupancy = parseNumeric(lesson.dailyOccupancy)
  const availability = parseNumeric(lesson.dailyCapacity)
  if (occupancy === null || availability === null) {
    return '-'
  }
  return `${Math.max(0, occupancy)}/${availability}`
}

export function tutorClassLabel(tutor: Tutor) {
  return classLabel(tutor.year, tutor.sectionName)
}

export function tutorLabel(tutor?: Tutor | null) {
  if (!tutor) {
    return null
  }
  const label = `${tutor.lastName} ${tutor.firstName}`.trim()
  return label || tutor.id
}

export function studentLabel(student?: Student) {
  if (!student) {
    return null
  }
  const label = `${student.lastName} ${student.firstName}`.trim()
  return label || student.id
}

export function studentClassLabel(student?: Student) {
  return student ? classLabel(student.year, student.sectionName) ?? '' : ''
}
