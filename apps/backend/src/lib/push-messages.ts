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

// One fact per line: the lesson's subject, its moment, then what happened. The bell and most
// phones keep the line breaks.
function lines(...parts: Array<string | null | false | undefined>) {
  return parts.filter(Boolean).join('\n')
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// "Mercoledì 12 novembre alle 14:00".
const when = (date: Date) => capitalize(formatWhen(date))

function lessonsUrl(role: Role, lessonId?: string) {
  if (role === 'tutor') {
    return lessonId ? `/tutor/lessons/${lessonId}` : '/tutor/lessons'
  }
  return '/student/lessons'
}

export function bookingConfirmedPush(role: Role, params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: role === 'student' ? 'Prenotazione confermata' : 'Nuova prenotazione',
    body: lines(params.subjectName, when(params.startAt)),
    url: lessonsUrl(role, params.lessonId),
    tag: `lesson-${params.lessonId}`
  }
}

export function bookingCanceledPush(role: Role, params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: 'Prenotazione annullata',
    body: lines(params.subjectName, when(params.startAt)),
    url: lessonsUrl(role, params.lessonId),
    tag: `lesson-${params.lessonId}`
  }
}

export function lessonCanceledPush(role: Role, params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: 'Lezione annullata',
    body: lines(params.subjectName, when(params.startAt)),
    url: lessonsUrl(role),
    tag: `lesson-${params.lessonId}`
  }
}

export interface LessonVersion {
  lessonId: string
  // null while the lesson waits for its first booking to choose the subject.
  subjectName: string | null
  startAt: Date
  durationMinutes: number
}

// What an admin's reschedule changed, as seen by someone who stays on the lesson.
export function lessonChangedPush(role: Role, before: LessonVersion, after: LessonVersion, tutorChanged: boolean): PushMessage | null {
  const timeChanged = before.startAt.getTime() !== after.startAt.getTime()
  const durationChanged = before.durationMinutes !== after.durationMinutes
  // A lesson going back to no subject is not news for the people on it.
  const subjectChanged = before.subjectName !== after.subjectName && after.subjectName !== null
  const tutorNews = tutorChanged && role === 'student'
  const changes = [timeChanged, durationChanged, subjectChanged, tutorNews].filter(Boolean).length
  if (changes === 0) {
    return null
  }

  const base = { url: lessonsUrl(role, after.lessonId), tag: `lesson-${after.lessonId}` }
  if (changes > 1) {
    return {
      ...base,
      title: 'Lezione modificata',
      body: lines(
        after.subjectName,
        when(after.startAt),
        durationChanged && `Durata: ${after.durationMinutes} minuti.`,
        tutorNews && 'Con un altro tutor: trovi i dettagli nell\'email.'
      )
    }
  }
  if (timeChanged) {
    return {
      ...base,
      title: 'Lezione spostata',
      body: lines(after.subjectName, `Prima: ${formatWhen(before.startAt)}`, `Ora: ${formatWhen(after.startAt)}`)
    }
  }
  if (durationChanged) {
    return {
      ...base,
      title: 'Durata cambiata',
      body: lines(after.subjectName, when(after.startAt), `Ora dura ${after.durationMinutes} minuti.`)
    }
  }
  if (subjectChanged) {
    return {
      ...base,
      title: 'Materia cambiata',
      body: lines(when(after.startAt), `Ora è ${after.subjectName}${before.subjectName ? ` (prima ${before.subjectName})` : ''}.`)
    }
  }
  return {
    ...base,
    title: 'Tutor cambiato',
    body: lines(after.subjectName, when(after.startAt), 'Cambia il tutor: trovi i dettagli nell\'email.')
  }
}

export function lessonReassignedPush(before: LessonVersion): PushMessage {
  return {
    title: 'Lezione riassegnata',
    body: lines(before.subjectName, when(before.startAt), 'Affidata a un altro tutor: non devi più tenerla.'),
    url: lessonsUrl('tutor'),
    tag: `lesson-${before.lessonId}`
  }
}

export function lessonAssignedPush(after: LessonVersion, bookedStudents: number): PushMessage {
  const booked = bookedStudents === 0
    ? null
    : bookedStudents === 1 ? '1 studente prenotato.' : `${bookedStudents} studenti prenotati.`
  return {
    title: 'Nuova lezione assegnata',
    body: lines(after.subjectName, when(after.startAt), booked),
    url: lessonsUrl('tutor', after.lessonId),
    tag: `lesson-${after.lessonId}`
  }
}

export function lessonCreatedPush(params: { lessonId: string, subjectName: string | null, startAt: Date }): PushMessage {
  return {
    title: 'Nuova lezione assegnata',
    body: lines(params.subjectName, when(params.startAt)),
    url: lessonsUrl('tutor', params.lessonId),
    tag: `lesson-${params.lessonId}`
  }
}

export function studentReminderPush(params: { lessonId: string, subjectName: string, startAt: Date, today: boolean }): PushMessage {
  return {
    title: params.today ? 'Lezione oggi' : 'Lezione domani',
    body: lines(params.subjectName, `Alle ${formatTime(params.startAt)}`, 'Fatti trovare in atrio all\'inizio.'),
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

export function activationChangedPush(isActive: boolean, reason: string | null = null): PushMessage {
  return {
    title: isActive ? 'Account attivato' : 'Account disattivato',
    body: isActive
      ? 'Il tuo account IEPF è attivo: ora puoi usare la piattaforma.'
      : lines('Il tuo account IEPF è stato disattivato.', reason ? `Motivo: ${reason}` : 'Per informazioni contatta gli organizzatori.'),
    url: '/',
    tag: 'account'
  }
}

export function lessonsGeneratedPush(params: { count: number, weekStart: Date }): PushMessage {
  const week = params.weekStart.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return {
    title: 'Lezioni della settimana assegnate',
    body: params.count === 1
      ? `1 lezione assegnata per la settimana del ${week}.`
      : `${params.count} lezioni assegnate per la settimana del ${week}.`,
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

// Admin notifications: lock screens again, so no names; the email carries the details.

export function lowFeedbackPush(params: { authorRole: Role, rating: number, subjectName: string, startAt: Date }): PushMessage {
  const fromStudent = params.authorRole === 'student'
  return {
    title: fromStudent ? 'Feedback basso da uno studente' : 'Feedback basso da un tutor',
    body: lines(params.subjectName, when(params.startAt), fromStudent ? `Voto ${params.rating}/5 al tutor.` : `Voto ${params.rating}/5 a uno studente.`),
    url: '/admin/feedback'
  }
}

export function lateCancellationPush(params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: 'Annullamento all\'ultimo momento',
    body: lines(params.subjectName, `Oggi alle ${formatTime(params.startAt)}`, 'Uno studente ha annullato la prenotazione.'),
    url: `/admin/lessons/${params.lessonId}`
  }
}

export function absencePush(params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: 'Assenza segnata',
    body: lines(params.subjectName, when(params.startAt), 'Uno studente risulta assente.'),
    url: `/admin/lessons/${params.lessonId}`
  }
}

export function emptyWeekPush(weekStart: Date): PushMessage {
  const week = weekStart.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return {
    title: 'Nessuna lezione generata',
    body: `La settimana del ${week} è vuota: controlla disponibilità e materie dei tutor.`,
    url: '/admin/tutors',
    tag: `empty-week-${week}`
  }
}

export function pendingAdminsPush(count: number): PushMessage {
  return {
    title: 'Admin in attesa di attivazione',
    body: count === 1
      ? 'Un admin ha accettato l\'invito e aspetta l\'attivazione.'
      : `${count} admin hanno accettato l'invito e aspettano l'attivazione.`,
    url: '/admin/admins',
    tag: 'pending-admins'
  }
}

export function subjectRequestsPush(requests: Array<{ subjectName: string, count: number }>): PushMessage {
  return {
    title: 'Nuove richieste di materie',
    body: lines(...requests.map(request => `${request.subjectName}: ${request.count}`)),
    url: '/admin/stats?tab=subject-requests',
    tag: 'subject-requests'
  }
}
