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

export function lessonRescheduledPush(role: Role, params: { lessonId: string, subjectName: string, startAt: Date }): PushMessage {
  return {
    title: 'Lezione spostata',
    body: `Nuovo orario: ${params.subjectName}, ${formatWhen(params.startAt)}`,
    url: lessonsUrl(role, params.lessonId),
    tag: `lesson-${params.lessonId}`
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
