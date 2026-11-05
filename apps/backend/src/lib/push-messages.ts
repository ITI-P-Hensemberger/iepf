// Purpose: Texts of push notifications. They show on lock screens, often of minors' phones:
// subject and time only, never other people's names or the lesson topic.
import type { PushMessage } from '@/lib/push'

type Role = 'student' | 'tutor'

function formatWhen(date: Date) {
  return date.toLocaleString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function lessonsUrl(role: Role, lessonId?: string) {
  if (role === 'tutor') {
    return lessonId ? `/tutor/lessons/${lessonId}` : '/tutor/lessons'
  }
  return '/student/lessons'
}

export function bookingConfirmedPush(role: Role, params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: role === 'student' ? 'Prenotazione confermata' : 'Nuova prenotazione',
    body: `${params.subjectName}, ${formatWhen(params.startAt)}`,
    url: lessonsUrl(role, params.lessonId),
    tag: `lesson-${params.lessonId}`
  }
}

export function bookingCanceledPush(role: Role, params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: 'Prenotazione annullata',
    body: `${params.subjectName}, ${formatWhen(params.startAt)}`,
    url: lessonsUrl(role, params.lessonId),
    tag: `lesson-${params.lessonId}`
  }
}

export function lessonCanceledPush(role: Role, params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: 'Lezione annullata',
    body: `${params.subjectName}, ${formatWhen(params.startAt)}`,
    url: lessonsUrl(role),
    tag: `lesson-${params.lessonId}`
  }
}

export interface LessonVersion {
  lessonId: string
  subjectName: string
  startAt: Date
  durationMinutes: number
}

// What an admin's reschedule changed, as seen by someone who stays on the lesson.
export function lessonChangedPush(role: Role, before: LessonVersion, after: LessonVersion, tutorChanged: boolean): PushMessage | null {
  const timeChanged = before.startAt.getTime() !== after.startAt.getTime()
  const durationChanged = before.durationMinutes !== after.durationMinutes
  const subjectChanged = before.subjectName !== after.subjectName
  const tutorNews = tutorChanged && role === 'student'
  const changes = [timeChanged, durationChanged, subjectChanged, tutorNews].filter(Boolean).length
  if (changes === 0) {
    return null
  }

  const base = { url: lessonsUrl(role, after.lessonId), tag: `lesson-${after.lessonId}` }
  if (changes > 1) {
    const extras = [
      durationChanged ? `${after.durationMinutes} minuti` : null,
      tutorNews ? 'con un altro tutor' : null
    ].filter(Boolean)
    return {
      ...base,
      title: 'Lezione modificata',
      body: `Ora: ${after.subjectName}, ${formatWhen(after.startAt)}${extras.length ? `, ${extras.join(', ')}` : ''}.`
    }
  }
  if (timeChanged) {
    return {
      ...base,
      title: 'Lezione spostata',
      body: `${after.subjectName}: da ${formatWhen(before.startAt)} a ${formatWhen(after.startAt)}`
    }
  }
  if (durationChanged) {
    return {
      ...base,
      title: 'Durata cambiata',
      body: `${after.subjectName}, ${formatWhen(after.startAt)}: ora dura ${after.durationMinutes} minuti.`
    }
  }
  if (subjectChanged) {
    return {
      ...base,
      title: 'Materia cambiata',
      body: `Lezione di ${formatWhen(after.startAt)}: ora è ${after.subjectName} (prima ${before.subjectName}).`
    }
  }
  return {
    ...base,
    title: 'Tutor cambiato',
    body: `${after.subjectName}, ${formatWhen(after.startAt)}: cambia il tutor. Trovi i dettagli nell'email.`
  }
}

export function lessonReassignedPush(before: LessonVersion): PushMessage {
  return {
    title: 'Lezione riassegnata',
    body: `${before.subjectName}, ${formatWhen(before.startAt)} è stata affidata a un altro tutor.`,
    url: lessonsUrl('tutor'),
    tag: `lesson-${before.lessonId}`
  }
}

export function lessonAssignedPush(after: LessonVersion, bookedStudents: number): PushMessage {
  const booked = bookedStudents === 0
    ? ''
    : bookedStudents === 1 ? ' (1 studente prenotato)' : ` (${bookedStudents} studenti prenotati)`
  return {
    title: 'Nuova lezione assegnata',
    body: `${after.subjectName}, ${formatWhen(after.startAt)}${booked}.`,
    url: lessonsUrl('tutor', after.lessonId),
    tag: `lesson-${after.lessonId}`
  }
}

export function lessonCreatedPush(params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: 'Nuova lezione in calendario',
    body: `${params.subjectName}, ${formatWhen(params.startAt)}`,
    url: lessonsUrl('tutor', params.lessonId),
    tag: `lesson-${params.lessonId}`
  }
}

export function studentReminderPush(params: { lessonId: string, subjectName: string, startAt: Date, today: boolean }): PushMessage {
  return {
    title: params.today ? 'Lezione oggi' : 'Lezione domani',
    body: `${params.subjectName} alle ${formatTime(params.startAt)}. Fatti trovare in atrio all'inizio.`,
    url: lessonsUrl('student'),
    tag: `reminder-${params.lessonId}`
  }
}

export function tutorReminderPush(params: { startTimes: Date[], today: boolean }): PushMessage {
  const first = params.startTimes.reduce((earliest, date) => (date < earliest ? date : earliest))
  const count = params.startTimes.length
  const when = params.today ? 'oggi' : 'domani'
  return {
    title: `Lezioni di ${when}`,
    body: count === 1
      ? `Hai 1 lezione ${when} alle ${formatTime(first)}.`
      : `Hai ${count} lezioni ${when}, la prima alle ${formatTime(first)}.`,
    url: lessonsUrl('tutor'),
    tag: `reminder-tutor-${when}`
  }
}

export function feedbackReminderPush(role: Role, count: number): PushMessage {
  return {
    title: 'Feedback da lasciare',
    body: count === 1
      ? 'Una lezione aspetta il tuo feedback.'
      : `${count} lezioni aspettano il tuo feedback.`,
    url: lessonsUrl(role),
    tag: 'feedback'
  }
}

export function activationChangedPush(isActive: boolean): PushMessage {
  return {
    title: isActive ? 'Account attivato' : 'Account disattivato',
    body: isActive
      ? 'Il tuo account IEPF è attivo: ora puoi usare la piattaforma.'
      : 'Il tuo account IEPF è stato disattivato. Per informazioni contatta la scuola.',
    url: '/',
    tag: 'account'
  }
}

export function lessonsGeneratedPush(params: { count: number, weekStart: Date }): PushMessage {
  const week = params.weekStart.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return {
    title: 'Lezioni della settimana pronte',
    body: params.count === 1
      ? `1 lezione creata per la settimana del ${week}.`
      : `${params.count} lezioni create per la settimana del ${week}.`,
    url: lessonsUrl('tutor'),
    tag: `generated-${week}`
  }
}

export function lessonsAvailablePush(weekStart: Date): PushMessage {
  const week = weekStart.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return {
    title: 'Nuove lezioni disponibili',
    body: `Ci sono nuove lezioni per la settimana del ${week}: prenota quella che ti serve.`,
    url: '/student/book',
    tag: `available-${week}`
  }
}
