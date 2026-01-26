// Purpose: Centralized email subjects and text bodies.
import fs from 'node:fs'
import path from 'node:path'

import env from '@/env'

function buildVerificationLink(token: string) {
  const baseUrl = env.SITE_URL ?? 'http://localhost:3000'
  const url = new URL('/auth/verify-email', baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

function buildPasswordResetLink(token: string) {
  const baseUrl = env.SITE_URL ?? 'http://localhost:3000'
  const url = new URL('/auth/reset-password', baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

interface EmailTemplate {
  subject: string
  text: string
  html: string
}

const LOGO_FILENAME = 'logo.png'
let cachedLogoDataUri: string | null = null

function loadLogoDataUri() {
  if (cachedLogoDataUri !== null) {
    return cachedLogoDataUri
  }

  try {
    const logoPath = path.resolve(process.cwd(), 'assets', LOGO_FILENAME)
    const file = fs.readFileSync(logoPath)
    cachedLogoDataUri = `data:image/png;base64,${file.toString('base64')}`
  }
  catch {
    cachedLogoDataUri = ''
  }

  return cachedLogoDataUri
}

function buildEmailHtml(
  title: string,
  message: string,
  action?: { label: string, url: string },
  options?: { hideHomeButton?: boolean }
) {
  const homeUrl = env.SITE_URL ?? 'http://localhost:3000'
  const actions: string[] = []
  if (action) {
    actions.push(`<a href="${action.url}" class="cta-button" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;text-align:center;">${action.label}</a>`)
  }
  if (!options?.hideHomeButton) {
    actions.push(`<a href="${homeUrl}" class="cta-button" style="display:inline-block;padding:12px 20px;background:#1e293b;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;text-align:center;">Vai alla home</a>`)
  }
  const actionHtml = actions.length > 0
    ? `<div style="margin-top:24px;text-align:center;">${actions.map((link, index) => `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto ${index === actions.length - 1 ? 0 : 12}px;">
          <tr>
            <td class="cta-cell" style="border-radius:8px;">
              ${link}
            </td>
          </tr>
        </table>
      `.trim()).join('')}</div>`
    : ''
  const logoDataUri = loadLogoDataUri()
  const logoHtml = logoDataUri
    ? `<img src="${logoDataUri}" alt="Logo" style="display:block;width:96px;height:96px;margin:0 auto 12px;object-fit:contain;" />`
    : `<div style="width:96px;height:96px;margin:0 auto 12px;border-radius:16px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-weight:700;color:#334155;letter-spacing:1px;">LOGO</div>`

  return `
  <div style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <style>
      @media (max-width: 480px) {
        .cta-button {
          display: block !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .cta-cell {
          width: 100% !important;
        }
      }
    </style>
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;text-align:center;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
      ${logoHtml}
      <div style="margin:0 0 16px;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700;">IEPF</div>
      <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">${title}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${message}</p>
      ${actionHtml}
    </div>
    <p style="margin:20px 0 0;text-align:center;font-size:12px;color:#94a3b8;">Se non hai richiesto questa email, puoi ignorarla.</p>
  </div>
  `.trim()
}

function formatLessonDate(date: Date) {
  return date.toLocaleString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function buildStudentLabel(name: string, classLabel?: string | null) {
  if (!classLabel) {
    return name
  }

  const normalized = classLabel.trim()
  const annoMatch = normalized.match(/anno\s*(\d+)/i)
  if (annoMatch) {
    const year = annoMatch[1]
    const section = normalized
      .replace(/anno\s*\d+/i, '')
      .replace(/[-–—]/g, '')
      .trim()
      .replace(/\s+/g, '')
    const compact = `${year}${section}`.trim()
    return compact ? `${name} (${compact})` : name
  }

  const compact = normalized.replace(/\s+/g, '')
  return `${name} (${compact})`
}

export function buildStudentRegistrationMessage(token: string) {
  const link = buildVerificationLink(token)
  return {
    subject: 'Verifica la tua email',
    text: `Benvenuto! Verifica la tua email visitando: ${link}`,
    html: buildEmailHtml(
      'Verifica la tua email',
      'Benvenuto! Verifica la tua email per completare la registrazione.',
      { label: 'Verifica email', url: link },
      { hideHomeButton: true }
    )
  } satisfies EmailTemplate
}

export function buildEmailVerificationMessage(token: string) {
  const link = buildVerificationLink(token)
  return {
    subject: 'Verifica la tua email',
    text: `Verifica la tua email visitando: ${link}`,
    html: buildEmailHtml(
      'Verifica la tua email',
      'Per continuare, verifica la tua email.',
      { label: 'Verifica email', url: link },
      { hideHomeButton: true }
    )
  } satisfies EmailTemplate
}

export function buildPasswordResetMessage(token: string) {
  const link = buildPasswordResetLink(token)
  return {
    subject: 'Reimposta la tua password',
    text: `Reimposta la tua password visitando: ${link}`,
    html: buildEmailHtml(
      'Reimposta la tua password',
      'Clicca sul pulsante per reimpostare la tua password.',
      { label: 'Reimposta password', url: link },
      { hideHomeButton: true }
    )
  } satisfies EmailTemplate
}

export function buildTutorCreatedMessage(token: string) {
  const link = buildVerificationLink(token)
  return {
    subject: 'Il tuo account tutor è pronto',
    text: `Un amministratore ha creato il tuo account tutor. Verifica la tua email visitando: ${link}`,
    html: buildEmailHtml(
      'Account tutor creato',
      'Un amministratore ha creato il tuo account tutor. Verifica la tua email per continuare.',
      { label: 'Verifica email', url: link },
      { hideHomeButton: true }
    )
  } satisfies EmailTemplate
}

export function buildProfileUpdatedMessage() {
  return {
    subject: 'Il tuo profilo è stato aggiornato',
    text: 'I dettagli del tuo profilo sono stati aggiornati.',
    html: buildEmailHtml(
      'Profilo aggiornato',
      'I dettagli del tuo profilo sono stati aggiornati.'
    )
  } satisfies EmailTemplate
}

export function buildActivationChangedMessage(isActive: boolean) {
  const message = isActive
    ? 'Il tuo account è stato attivato. Ora puoi accedere alle lezioni.'
    : 'Il tuo account è stato disattivato. Contatta il supporto se non ti aspettavi questa modifica.'

  return {
    subject: isActive ? 'Il tuo account è ora attivo' : 'Il tuo account è stato disattivato',
    text: message,
    html: buildEmailHtml(
      isActive ? 'Account attivo' : 'Account disattivato',
      message
    )
  } satisfies EmailTemplate
}

export function buildTutorInviteMessage(token: string) {
  const baseUrl = env.SITE_URL ?? 'http://localhost:3000'
  const url = new URL('/auth/sign-up-tutor', baseUrl)
  url.searchParams.set('token', token)
  const link = url.toString()

  return {
    subject: 'Invito registrazione tutor',
    text: `Sei stato invitato a registrarti come tutor. Completa la registrazione qui: ${link}`,
    html: buildEmailHtml(
      'Invito registrazione tutor',
      'Sei stato invitato a registrarti come tutor. Completa la registrazione con il pulsante qui sotto.',
      { label: 'Registrati come tutor', url: link },
      { hideHomeButton: true }
    )
  } satisfies EmailTemplate
}

export function buildAdminInviteMessage(token: string) {
  const baseUrl = env.SITE_URL ?? 'http://localhost:3000'
  const url = new URL('/auth/sign-up-admin', baseUrl)
  url.searchParams.set('token', token)
  const link = url.toString()

  return {
    subject: 'Invito registrazione admin',
    text: `Sei stato invitato a registrarti come admin. Completa la registrazione qui: ${link}`,
    html: buildEmailHtml(
      'Invito registrazione admin',
      'Sei stato invitato a registrarti come admin. Completa la registrazione con il pulsante qui sotto.',
      { label: 'Registrati come admin', url: link },
      { hideHomeButton: true }
    )
  } satisfies EmailTemplate
}

export function buildRegistrationConfirmedMessage() {
  return {
    subject: 'Registrazione completata',
    text: 'La tua email è stata verificata. Ora puoi accedere.',
    html: buildEmailHtml(
      'Registrazione completata',
      'La tua email è stata verificata. Ora puoi accedere.'
    )
  } satisfies EmailTemplate
}

export function buildLessonFeedbackReminderMessage(role: 'student' | 'tutor', count: number) {
  const baseUrl = env.SITE_URL ?? 'http://localhost:3000'
  const url = new URL('/lessons', baseUrl).toString()
  const heading = role === 'tutor'
    ? 'Ricorda di lasciare il feedback'
    : 'Ricorda di lasciare il feedback al tutor'
  const message = role === 'tutor'
    ? `Hai ${count} feedback da completare per le lezioni di oggi.`
    : `Hai ${count} feedback da completare per le lezioni di oggi.`

  return {
    subject: 'Promemoria feedback lezioni',
    text: `${message} Accedi qui: ${url}`,
    html: buildEmailHtml(
      heading,
      message,
      { label: 'Vai alle lezioni', url },
      { hideHomeButton: true }
    )
  } satisfies EmailTemplate
}

export function buildBookingCanceledByAdminMessage(recipientRole: 'student' | 'tutor', lessonStartAt: Date) {
  const formattedDate = lessonStartAt.toLocaleString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
  const heading = recipientRole === 'tutor'
    ? 'Lezione annullata da un amministratore'
    : 'Lezione annullata da un amministratore'
  const message = `La lezione prevista per ${formattedDate} è stata annullata. Operazione effettuata da un amministratore.`

  return {
    subject: 'Lezione annullata',
    text: message,
    html: buildEmailHtml(heading, message)
  } satisfies EmailTemplate
}

export function buildLessonBookingConfirmedMessage(params: {
  recipientRole: 'student' | 'tutor'
  lessonStartAt: Date
  subjectName: string
  tutorName: string
  studentName: string
  studentClass?: string | null
  bookedByAdmin?: boolean
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  const adminLabel = params.bookedByAdmin ? ' Prenotazione effettuata da un amministratore.' : ''
  if (params.recipientRole === 'student') {
    return {
      subject: 'Prenotazione confermata',
      text: `La tua prenotazione è confermata per ${dateLabel}. Materia: ${params.subjectName}. Tutor: ${params.tutorName}.${adminLabel}`,
      html: buildEmailHtml(
        'Prenotazione confermata',
        `La tua prenotazione è confermata per <strong>${dateLabel}</strong>.<br />Materia: <strong>${params.subjectName}</strong>.<br />Tutor: <strong>${params.tutorName}</strong>.${params.bookedByAdmin ? '<br />Prenotazione effettuata da un amministratore.' : ''}`
      )
    } satisfies EmailTemplate
  }

  const studentLabel = buildStudentLabel(params.studentName, params.studentClass)
  return {
    subject: 'Nuova prenotazione',
    text: `Hai una nuova prenotazione per ${dateLabel}. Materia: ${params.subjectName}. Studente: ${studentLabel}.${adminLabel}`,
    html: buildEmailHtml(
      'Nuova prenotazione',
      `Hai una nuova prenotazione per <strong>${dateLabel}</strong>.<br />Materia: <strong>${params.subjectName}</strong>.<br />Studente: <strong>${studentLabel}</strong>.${params.bookedByAdmin ? '<br />Prenotazione effettuata da un amministratore.' : ''}`
    )
  } satisfies EmailTemplate
}

export function buildLessonBookingCanceledMessage(params: {
  recipientRole: 'student' | 'tutor'
  canceledBy: 'student' | 'tutor' | 'admin'
  lessonStartAt: Date
  subjectName: string
  tutorName: string
  studentName: string
  studentClass?: string | null
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  const canceledByLabel = params.canceledBy === 'admin'
    ? 'da un amministratore'
    : params.canceledBy === 'tutor' ? 'dal tutor' : 'dallo studente'
  const adminSuffix = params.canceledBy === 'admin' ? ' Operazione effettuata da un amministratore.' : ''

  if (params.recipientRole === 'student') {
    return {
      subject: 'Prenotazione annullata',
      text: params.canceledBy === 'admin'
        ? `La prenotazione per ${dateLabel} è stata annullata. Materia: ${params.subjectName}. Tutor: ${params.tutorName}.${adminSuffix}`
        : `La prenotazione per ${dateLabel} è stata annullata ${canceledByLabel}. Materia: ${params.subjectName}. Tutor: ${params.tutorName}.`,
      html: buildEmailHtml(
        'Prenotazione annullata',
        params.canceledBy === 'admin'
          ? `La prenotazione per <strong>${dateLabel}</strong> è stata annullata.<br />Materia: <strong>${params.subjectName}</strong>.<br />Tutor: <strong>${params.tutorName}</strong>.<br />Operazione effettuata da un amministratore.`
          : `La prenotazione per <strong>${dateLabel}</strong> è stata annullata ${canceledByLabel}.<br />Materia: <strong>${params.subjectName}</strong>.<br />Tutor: <strong>${params.tutorName}</strong>.`
      )
    } satisfies EmailTemplate
  }

  const studentLabel = buildStudentLabel(params.studentName, params.studentClass)
  return {
    subject: 'Prenotazione annullata',
    text: params.canceledBy === 'admin'
      ? `La prenotazione di ${studentLabel} per ${dateLabel} è stata annullata. Materia: ${params.subjectName}.${adminSuffix}`
      : `La prenotazione di ${studentLabel} per ${dateLabel} è stata annullata ${canceledByLabel}. Materia: ${params.subjectName}.`,
    html: buildEmailHtml(
      'Prenotazione annullata',
      params.canceledBy === 'admin'
        ? `La prenotazione di <strong>${studentLabel}</strong> per <strong>${dateLabel}</strong> è stata annullata.<br />Materia: <strong>${params.subjectName}</strong>.<br />Operazione effettuata da un amministratore.`
        : `La prenotazione di <strong>${studentLabel}</strong> per <strong>${dateLabel}</strong> è stata annullata ${canceledByLabel}.<br />Materia: <strong>${params.subjectName}</strong>.`
    )
  } satisfies EmailTemplate
}

export function buildLessonCanceledMessage(params: {
  recipientRole: 'student' | 'tutor'
  canceledBy: 'student' | 'tutor' | 'admin'
  lessonStartAt: Date
  subjectName: string
  tutorName: string
  students: Array<{ name: string, classLabel?: string | null }>
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  const canceledByLabel = params.canceledBy === 'admin'
    ? 'da un amministratore'
    : params.canceledBy === 'tutor' ? 'dal tutor' : 'dallo studente'
  const adminSuffix = params.canceledBy === 'admin' ? ' Operazione effettuata da un amministratore.' : ''

  if (params.recipientRole === 'student') {
    return {
      subject: 'Lezione annullata',
      text: params.canceledBy === 'admin'
        ? `La lezione del ${dateLabel} è stata annullata. Materia: ${params.subjectName}. Tutor: ${params.tutorName}.${adminSuffix}`
        : `La lezione del ${dateLabel} è stata annullata ${canceledByLabel}. Materia: ${params.subjectName}. Tutor: ${params.tutorName}.`,
      html: buildEmailHtml(
        'Lezione annullata',
        params.canceledBy === 'admin'
          ? `La lezione del <strong>${dateLabel}</strong> è stata annullata.<br />Materia: <strong>${params.subjectName}</strong>.<br />Tutor: <strong>${params.tutorName}</strong>.<br />Operazione effettuata da un amministratore.`
          : `La lezione del <strong>${dateLabel}</strong> è stata annullata ${canceledByLabel}.<br />Materia: <strong>${params.subjectName}</strong>.<br />Tutor: <strong>${params.tutorName}</strong>.`
      )
    } satisfies EmailTemplate
  }

  const studentItems = params.students.length > 0
    ? `<ul style="margin:12px 0 0;padding-left:20px;text-align:left;">${params.students
      .map(student => `<li>${buildStudentLabel(student.name, student.classLabel)}</li>`)
      .join('')}</ul>`
    : '<p style="margin:12px 0 0;">Nessuno studente prenotato.</p>'

  return {
    subject: 'Lezione annullata',
    text: params.canceledBy === 'admin'
      ? `La lezione del ${dateLabel} è stata annullata. Materia: ${params.subjectName}. Studenti: ${params.students.map(student => buildStudentLabel(student.name, student.classLabel)).join(', ') || 'nessuno'}.${adminSuffix}`
      : `La lezione del ${dateLabel} è stata annullata ${canceledByLabel}. Materia: ${params.subjectName}. Studenti: ${params.students.map(student => buildStudentLabel(student.name, student.classLabel)).join(', ') || 'nessuno'}.`,
    html: buildEmailHtml(
      'Lezione annullata',
      params.canceledBy === 'admin'
        ? `La lezione del <strong>${dateLabel}</strong> è stata annullata.<br />Materia: <strong>${params.subjectName}</strong>.<br />Studenti:${studentItems}<br />Operazione effettuata da un amministratore.`
        : `La lezione del <strong>${dateLabel}</strong> è stata annullata ${canceledByLabel}.<br />Materia: <strong>${params.subjectName}</strong>.<br />Studenti:${studentItems}`
    )
  } satisfies EmailTemplate
}

export function buildLessonRescheduledMessage(params: {
  recipientRole: 'student' | 'tutor'
  oldStartAt: Date
  newStartAt: Date
  oldSubjectName: string
  newSubjectName: string
  oldTutorName: string
  newTutorName: string
  students: Array<{ name: string, classLabel?: string | null }>
  rescheduledByAdmin?: boolean
}) {
  const oldDate = formatLessonDate(params.oldStartAt)
  const newDate = formatLessonDate(params.newStartAt)
  const adminSuffix = params.rescheduledByAdmin ? ' Operazione effettuata da un amministratore.' : ''

  if (params.recipientRole === 'student') {
    return {
      subject: 'Lezione riprogrammata',
      text: `La lezione del ${oldDate} è stata riprogrammata al ${newDate}. Materia: ${params.newSubjectName}. Tutor: ${params.newTutorName}.${adminSuffix}`,
      html: buildEmailHtml(
        'Lezione riprogrammata',
        `La lezione del <strong>${oldDate}</strong> è stata riprogrammata al <strong>${newDate}</strong>.<br />Materia: <strong>${params.newSubjectName}</strong>.<br />Tutor: <strong>${params.newTutorName}</strong>.${params.rescheduledByAdmin ? '<br />Operazione effettuata da un amministratore.' : ''}`
      )
    } satisfies EmailTemplate
  }

  const studentItems = params.students.length > 0
    ? `<ul style="margin:12px 0 0;padding-left:20px;text-align:left;">${params.students
      .map(student => `<li>${buildStudentLabel(student.name, student.classLabel)}</li>`)
      .join('')}</ul>`
    : '<p style="margin:12px 0 0;">Nessuno studente prenotato.</p>'

  return {
    subject: 'Lezione riprogrammata',
    text: `La lezione del ${oldDate} è stata riprogrammata al ${newDate}. Materia: ${params.newSubjectName}. Studenti: ${params.students.map(student => buildStudentLabel(student.name, student.classLabel)).join(', ') || 'nessuno'}.${adminSuffix}`,
    html: buildEmailHtml(
      'Lezione riprogrammata',
      `La lezione del <strong>${oldDate}</strong> è stata riprogrammata al <strong>${newDate}</strong>.<br />Materia: <strong>${params.newSubjectName}</strong>.<br />Studenti:${studentItems}${params.rescheduledByAdmin ? '<br />Operazione effettuata da un amministratore.' : ''}`
    )
  } satisfies EmailTemplate
}

export function buildPasswordChangedMessage() {
  return {
    subject: 'Password aggiornata',
    text: 'La tua password è stata aggiornata. Se non sei stato tu, contatta il supporto.',
    html: buildEmailHtml(
      'Password aggiornata',
      'La tua password è stata aggiornata. Se non sei stato tu, contatta il supporto.'
    )
  } satisfies EmailTemplate
}

export function buildLessonReminderStudentMessage(params: {
  lessonStartAt: Date
  subjectName: string
  tutorName: string
  studentName: string
  studentClass?: string | null
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  return {
    subject: 'Promemoria lezione di domani',
    text: `Promemoria: lezione il ${dateLabel}. Materia: ${params.subjectName}. Tutor: ${params.tutorName}.`,
    html: buildEmailHtml(
      'Promemoria lezione di domani',
      `Promemoria: lezione il <strong>${dateLabel}</strong>.<br />Materia: <strong>${params.subjectName}</strong>.<br />Tutor: <strong>${params.tutorName}</strong>.`
    )
  } satisfies EmailTemplate
}

export function buildLessonReminderTutorMessage(params: {
  tutorName: string
  lessons: Array<{
    startAt: Date
    subjectName: string
    students: Array<{ name: string, classLabel?: string | null }>
  }>
}) {
  const itemsHtml = params.lessons.map((lesson) => {
    const dateLabel = formatLessonDate(lesson.startAt)
    const studentsList = lesson.students.length > 0
      ? `<ul style="margin:8px 0 0;padding-left:20px;">${lesson.students
        .map(student => `<li>${buildStudentLabel(student.name, student.classLabel)}</li>`)
        .join('')}</ul>`
      : '<p style="margin:8px 0 0;">Nessuno studente prenotato.</p>'
    return `
      <div style="margin-bottom:16px;">
        <div><strong>${dateLabel}</strong> — ${lesson.subjectName}</div>
        ${studentsList}
      </div>
    `.trim()
  }).join('')

  const itemsText = params.lessons.map((lesson) => {
    const dateLabel = formatLessonDate(lesson.startAt)
    const students = lesson.students.map(student => buildStudentLabel(student.name, student.classLabel)).join(', ') || 'nessuno'
    return `- ${dateLabel} — ${lesson.subjectName} (Studenti: ${students})`
  }).join('\n')

  return {
    subject: 'Promemoria lezioni di domani',
    text: `Ecco le lezioni confermate di domani:\n${itemsText}`,
    html: buildEmailHtml(
      'Promemoria lezioni di domani',
      `Ecco le lezioni confermate di domani:${itemsHtml}`
    )
  } satisfies EmailTemplate
}
