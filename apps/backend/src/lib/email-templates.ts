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

function buildLessonDetailsLink(lessonId: string) {
  const baseUrl = env.SITE_URL ?? 'http://localhost:3000'
  return new URL(`/tutor/lessons/${lessonId}`, baseUrl).toString()
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

function buildInfoCard(title: string, lines: string[]) {
  return `
    <div style="margin:12px 0;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;text-align:left;">
      <div style="font-weight:700;color:#0f172a;font-size:15px;">${title}</div>
      ${lines.map(line => `<div style="margin-top:6px;color:#475569;font-size:14px;">${line}</div>`).join('')}
    </div>
  `.trim()
}

function buildLessonCardHtml(title: string, lines: string[]) {
  return `
    <div style="margin:12px 0;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;text-align:left;">
      <div style="font-weight:700;color:#0f172a;font-size:15px;">${title}</div>
      ${lines.map((line, index) => `<div style="margin-top:${index === 0 ? 4 : 6}px;color:#475569;font-size:14px;">${line}</div>`).join('')}
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
  const url = new URL(`${role === 'student' ? '/student' : '/tutor'}/lessons`, baseUrl).toString()
  const heading = role === 'tutor'
    ? 'Ricorda di lasciare il feedback'
    : 'Ricorda di lasciare il feedback al tutor'
  const message = role === 'tutor'
    ? `Hai ${count} feedback da completare per le lezioni di oggi.`
    : `Hai ${count} feedback da completare per le lezioni di oggi.`

  return {
    subject: 'Ricorda di lasciare il feedback',
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
    html: buildEmailHtml(
      heading,
      `La lezione prevista per <strong>${formattedDate}</strong> è stata annullata.
      <div style="margin-top:12px;">${buildInfoCard('Lezione annullata', [
        `Data: <strong>${formattedDate}</strong>`,
        'Annullata da un amministratore.'
      ])}</div>`
    )
  } satisfies EmailTemplate
}

export function buildLessonBookingConfirmedMessage(params: {
  recipientRole: 'student' | 'tutor'
  lessonStartAt: Date
  subjectName: string
  topic?: string | null
  tutorName: string
  studentName: string
  studentClass?: string | null
  bookedByAdmin?: boolean
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  const adminLabel = params.bookedByAdmin ? ' Prenotazione effettuata da un amministratore.' : ''
  const topicText = params.topic ? ` Argomento: ${params.topic}.` : ''
  if (params.recipientRole === 'student') {
    const cardLines = [
      dateLabel,
      `Tutor: <strong>${params.tutorName}</strong>`,
      ...(params.topic ? [`Argomento: <strong>${params.topic}</strong>`] : [])
    ]
    return {
      subject: 'Prenotazione confermata',
      text: `Prenotazione confermata per ${dateLabel}. Materia: ${params.subjectName}.${topicText} Tutor: ${params.tutorName}. Dovrai farti trovare in atrio all'ora di inizio della lezione. In caso di grave ritardo, verrai segnato assente e la lezione non verrà rimborsata.${adminLabel}`,
      html: buildEmailHtml(
        'Prenotazione confermata',
        `Prenotazione confermata per <strong>${dateLabel}</strong>.
        <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>
        <div style="margin-top:12px;">Dovrai farti trovare in atrio all'ora di inizio della lezione.</div>
        <div style="margin-top:8px;">In caso di grave ritardo, verrai segnato assente e la lezione non verrà rimborsata.</div>
        ${params.bookedByAdmin ? '<div style="margin-top:12px;color:#64748b;font-size:13px;">Prenotazione effettuata da un amministratore.</div>' : ''}`
      )
    } satisfies EmailTemplate
  }

  const studentLabel = buildStudentLabel(params.studentName, params.studentClass)
  const cardLines = [
    dateLabel,
    `Studente: <strong>${studentLabel}</strong>`,
    ...(params.topic ? [`Argomento: <strong>${params.topic}</strong>`] : [])
  ]
  return {
    subject: 'Nuova prenotazione',
    text: `Hai una nuova prenotazione alla lezione del ${dateLabel}. Materia: ${params.subjectName}.${topicText} Studente: ${studentLabel}. Aspetta il tuo studente in atrio. Una volta arrivato, spostatevi nell'atrio del primo piano.${adminLabel}`,
    html: buildEmailHtml(
      'Nuova prenotazione',
      `Hai una nuova prenotazione alla lezione del <strong>${dateLabel}</strong>.
      <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>
      <div style="margin-top:12px;">Aspetta il tuo studente in atrio. Una volta arrivato, spostatevi nell'atrio del primo piano.</div>
      ${params.bookedByAdmin ? '<div style="margin-top:12px;color:#64748b;font-size:13px;">Prenotazione effettuata da un amministratore.</div>' : ''}`
    )
  } satisfies EmailTemplate
}

export function buildLessonBookingCanceledMessage(params: {
  recipientRole: 'student' | 'tutor'
  canceledBy: 'student' | 'tutor' | 'admin'
  lessonStartAt: Date
  subjectName: string
  topic?: string | null
  noRefundNotice?: boolean
  tutorPartialNotice?: boolean
  tutorName: string
  studentName: string
  studentClass?: string | null
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  const canceledByLabel = params.canceledBy === 'admin'
    ? 'da un amministratore'
    : params.canceledBy === 'tutor' ? 'dal tutor' : 'dallo studente'
  const adminSuffix = params.canceledBy === 'admin' ? ' Operazione effettuata da un amministratore.' : ''
  const topicText = params.topic ? ` Argomento: ${params.topic}.` : ''
  const noRefundText = params.noRefundNotice
    ? ' La lezione non verrà rimborsata perché l\'annullamento è avvenuto dopo le 20 del giorno precedente la lezione.'
    : ''
  const tutorPartialText = params.tutorPartialNotice
    ? ' Lo studente ha annullato dopo le 8 del giorno stesso della lezione: la lezione verrà conteggiata parzialmente.'
    : ''

  if (params.recipientRole === 'student') {
    const cardLines = [
      dateLabel,
      `Tutor: <strong>${params.tutorName}</strong>`,
      ...(params.topic ? [`Argomento: <strong>${params.topic}</strong>`] : [])
    ]
    return {
      subject: 'Prenotazione annullata',
      text: params.canceledBy === 'admin'
        ? `La prenotazione del ${dateLabel} è stata annullata. Materia: ${params.subjectName}.${topicText} Tutor: ${params.tutorName}.${adminSuffix}`
        : `La prenotazione del ${dateLabel} è stata annullata ${canceledByLabel}. Materia: ${params.subjectName}.${topicText} Tutor: ${params.tutorName}.${noRefundText}`,
      html: buildEmailHtml(
        'Prenotazione annullata',
        params.canceledBy === 'admin'
          ? `La prenotazione del <strong>${dateLabel}</strong> è stata annullata.
          <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>
          <div style="margin-top:12px;color:#64748b;font-size:13px;">Operazione effettuata da un amministratore.</div>`
          : `La prenotazione del <strong>${dateLabel}</strong> è stata annullata ${canceledByLabel}.
          <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>
          ${params.noRefundNotice ? '<div style="margin-top:12px;font-size:13px;color:#dc2626;">La lezione non verrà rimborsata perché l\'annullamento è avvenuto dopo le 20 del giorno precedente la lezione.</div>' : ''}`
      )
    } satisfies EmailTemplate
  }

  const studentLabel = buildStudentLabel(params.studentName, params.studentClass)
  const cardLines = [
    dateLabel,
    `Studente: <strong>${studentLabel}</strong>`,
    ...(params.topic ? [`Argomento: <strong>${params.topic}</strong>`] : [])
  ]
  return {
    subject: 'Prenotazione annullata',
    text: params.canceledBy === 'admin'
      ? `La prenotazione di ${studentLabel} del ${dateLabel} è stata annullata. Materia: ${params.subjectName}.${topicText}${adminSuffix}`
      : `La prenotazione di ${studentLabel} del ${dateLabel} è stata annullata ${canceledByLabel}. Materia: ${params.subjectName}.${topicText}${tutorPartialText}`,
    html: buildEmailHtml(
      'Prenotazione annullata',
      params.canceledBy === 'admin'
        ? `La prenotazione di <strong>${studentLabel}</strong> del <strong>${dateLabel}</strong> è stata annullata.
        <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>
        <div style="margin-top:12px;color:#64748b;font-size:13px;">Operazione effettuata da un amministratore.</div>`
        : `La prenotazione di <strong>${studentLabel}</strong> del <strong>${dateLabel}</strong> è stata annullata ${canceledByLabel}.
        <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>
        ${params.tutorPartialNotice ? '<div style="margin-top:12px;font-size:13px;color:#ea580c;">Lo studente ha annullato dopo le 8 del giorno stesso della lezione: la lezione verrà conteggiata parzialmente.</div>' : ''}`
    )
  } satisfies EmailTemplate
}

export function buildLessonCanceledMessage(params: {
  recipientRole: 'student' | 'tutor'
  canceledBy: 'student' | 'tutor' | 'admin'
  lessonStartAt: Date
  subjectName: string
  topic?: string | null
  topics?: string[]
  tutorName: string
  students: Array<{ name: string, classLabel?: string | null }>
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  const canceledByLabel = params.canceledBy === 'admin'
    ? 'da un amministratore'
    : params.canceledBy === 'tutor' ? 'dal tutor' : 'dallo studente'
  const adminSuffix = params.canceledBy === 'admin' ? ' Operazione effettuata da un amministratore.' : ''
  const topicText = params.topic ? ` Argomento: ${params.topic}.` : ''

  if (params.recipientRole === 'student') {
    const cardLines = [
      dateLabel,
      `Tutor: <strong>${params.tutorName}</strong>`,
      ...(params.topic ? [`Argomento: <strong>${params.topic}</strong>`] : [])
    ]
    return {
      subject: 'Lezione annullata',
      text: params.canceledBy === 'admin'
        ? `La lezione del ${dateLabel} è stata annullata. Materia: ${params.subjectName}.${topicText} Tutor: ${params.tutorName}.${adminSuffix}`
        : `La lezione del ${dateLabel} è stata annullata ${canceledByLabel}. Materia: ${params.subjectName}.${topicText} Tutor: ${params.tutorName}.`,
      html: buildEmailHtml(
        'Lezione annullata',
        params.canceledBy === 'admin'
          ? `La lezione del <strong>${dateLabel}</strong> è stata annullata.
          <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>
          <div style="margin-top:12px;color:#64748b;font-size:13px;">Operazione effettuata da un amministratore.</div>`
          : `La lezione del <strong>${dateLabel}</strong> è stata annullata ${canceledByLabel}.
          <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>`
      )
    } satisfies EmailTemplate
  }

  const studentLabelList = params.students.length > 0
    ? params.students.map(student => buildStudentLabel(student.name, student.classLabel)).join(', ')
    : 'nessuno'
  const topics = (params.topics ?? []).map(topic => topic.trim()).filter(Boolean)
  const topicsLine = topics.length > 0 ? `Argomenti: ${topics.join(', ')}` : null
  const cardLines = [
    dateLabel,
    `Studenti: <strong>${studentLabelList}</strong>`,
    ...(topicsLine ? [topicsLine] : [])
  ]

  return {
    subject: 'Lezione annullata',
    text: params.canceledBy === 'admin'
      ? `La lezione del ${dateLabel} è stata annullata. Materia: ${params.subjectName}.${topicsLine ? ` Argomenti: ${topics.join(', ')}.` : ''} Studenti: ${studentLabelList}.${adminSuffix}`
      : `La lezione del ${dateLabel} è stata annullata ${canceledByLabel}. Materia: ${params.subjectName}.${topicsLine ? ` Argomenti: ${topics.join(', ')}.` : ''} Studenti: ${studentLabelList}.`,
    html: buildEmailHtml(
      'Lezione annullata',
      params.canceledBy === 'admin'
        ? `La lezione del <strong>${dateLabel}</strong> è stata annullata.
        <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>
        <div style="margin-top:12px;color:#64748b;font-size:13px;">Operazione effettuata da un amministratore.</div>`
        : `La lezione del <strong>${dateLabel}</strong> è stata annullata ${canceledByLabel}.
        <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>`
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
  topic?: string | null
  today: boolean
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  const whenLabel = params.today ? 'oggi' : 'domani'
  const topicText = params.topic ? ` Argomento: ${params.topic}.` : ''
  const cardLines = [
    dateLabel,
    `Tutor: <strong>${params.tutorName}</strong>`,
    ...(params.topic ? [`Argomento: <strong>${params.topic}</strong>`] : [])
  ]
  return {
    subject: `Promemoria lezioni di ${whenLabel}`,
    text: `Promemoria: lezioni ${whenLabel} (${dateLabel}). Materia: ${params.subjectName}. Tutor: ${params.tutorName}.${topicText}. Dovrai farti trovare in atrio all'ora di inizio della lezione. In caso di grave ritardo, verrai segnato assente e la lezione non verrà rimborsata.`,
    html: buildEmailHtml(
      `Promemoria lezioni di ${whenLabel}`,
      `Promemoria: lezioni ${whenLabel} (<strong>${dateLabel}</strong>).
      <div style="margin-top:12px;">${buildLessonCardHtml(params.subjectName, cardLines)}</div>
      <div style="margin-top:12px;">Dovrai farti trovare in atrio all'ora di inizio della lezione.</div>
      <div style="margin-top:8px;">In caso di grave ritardo, verrai segnato assente e la lezione non verrà rimborsata.</div>`
    )
  } satisfies EmailTemplate
}

export function buildLessonReminderTutorMessage(params: {
  tutorName: string
  lessons: Array<{
    startAt: Date
    subjectName: string
    students: Array<{ name: string, classLabel?: string | null }>
    topics?: string[]
  }>
  today: boolean
}) {
  const whenLabel = params.today ? 'oggi' : 'domani'
  const itemsHtml = params.lessons.map((lesson) => {
    const dateLabel = formatLessonDate(lesson.startAt)
    const topics = lesson.topics?.filter(Boolean) ?? []
    const studentsValue = lesson.students.length > 0
      ? lesson.students
          .map(student => buildStudentLabel(student.name, student.classLabel))
          .join(', ')
      : null
    const studentsLine = studentsValue
      ? `Studenti: <strong>${studentsValue}</strong>`
      : '<span style="color:#64748b;">Nessuno studente prenotato.</span>'
    const lines = [
      dateLabel,
      ...(topics.length > 0 ? [`Argomenti: <strong>${topics.join(', ')}</strong>`] : []),
      studentsLine
    ]
    return buildLessonCardHtml(lesson.subjectName, lines)
  }).join('')

  const itemsText = params.lessons.map((lesson) => {
    const dateLabel = formatLessonDate(lesson.startAt)
    const students = lesson.students.map(student => buildStudentLabel(student.name, student.classLabel)).join(', ') || 'nessuno'
    const topics = lesson.topics?.filter(Boolean) ?? []
    const topicLabel = topics.length > 0 ? `; Argomenti: ${topics.join(', ')}` : ''
    return `- ${dateLabel} — ${lesson.subjectName} (Studenti: ${students}${topicLabel})`
  }).join('\n')

  return {
    subject: `Promemoria lezioni di ${whenLabel}`,
    text: `Ecco le lezioni confermate di ${whenLabel}:\n${itemsText}`,
    html: buildEmailHtml(
      `Promemoria lezioni di ${whenLabel}`,
      `Ecco le lezioni confermate di ${whenLabel}:<div style="margin-top:12px;">${itemsHtml}</div>
      <br />
      Aspetta il tuo studente in atrio. Una volta arrivato, spostatevi nell'atrio del primo piano.
      <br />
      Ricordati di segnare la presenza dello studente appena arriva.`
    )
  } satisfies EmailTemplate
}

export function buildLessonCreatedMessage(params: {
  lessonId: string
  lessonStartAt: Date
  subjectName: string
  tutorName: string
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  const detailsUrl = buildLessonDetailsLink(params.lessonId)
  return {
    subject: 'Nuova lezione assegnata',
    text: `Ti è stata assegnata una nuova lezione il ${dateLabel}. Materia: ${params.subjectName}. Tutor: ${params.tutorName}. Dettagli: ${detailsUrl}`,
    html: buildEmailHtml(
      'Nuova lezione assegnata',
      `Ti è stata assegnata una nuova lezione il <strong>${dateLabel}</strong>.<br />Materia: <strong>${params.subjectName}</strong>.<br />Tutor: <strong>${params.tutorName}</strong>.`,
      { label: 'Vedi dettagli lezione', url: detailsUrl },
      { hideHomeButton: true }
    )
  } satisfies EmailTemplate
}

// The previous tutor of a lesson an admin moved to someone else.
export function buildLessonReassignedMessage(params: {
  lessonStartAt: Date
  subjectName: string
  tutorName: string
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  return {
    subject: 'Lezione riassegnata',
    text: `Ciao ${params.tutorName}, la lezione di ${params.subjectName} del ${dateLabel} è stata affidata a un altro tutor da un amministratore. Non devi più tenerla.`,
    html: buildEmailHtml(
      'Lezione riassegnata',
      `Ciao ${params.tutorName}, la lezione di <strong>${params.subjectName}</strong> del <strong>${dateLabel}</strong> è stata affidata a un altro tutor da un amministratore.<br />Non devi più tenerla.`
    )
  } satisfies EmailTemplate
}

export function buildLessonPresenceUpdatedMessage(params: {
  lessonStartAt: Date
  subjectName: string
  tutorName: string
  present: boolean
}) {
  const dateLabel = formatLessonDate(params.lessonStartAt)
  const statusLabel = params.present ? 'presente' : 'assente'
  const heading = params.present ? 'Presenza confermata' : 'Assenza registrata'
  const disclaimer = params.present ? '' : 'L\'ora di lezione non verrà rimborsata.'
  const disclaimerHtml = params.present ? '' : '<br /><br /><strong>L\'ora di lezione non verrà rimborsata.</strong>'
  return {
    subject: `Lezione di oggi: ${statusLabel}`,
    text: `Sei stato ${params.present ? 'confermato' : 'registrato'} ${statusLabel} alla lezione di ${params.subjectName} del ${dateLabel}. Tutor: ${params.tutorName}.${disclaimer ? ` ${disclaimer}` : ''}`,
    html: buildEmailHtml(
      heading,
      `Sei stato ${params.present ? 'confermato' : 'registrato'} <strong>${statusLabel}</strong> alla lezione di <strong>${params.subjectName}</strong> del <strong>${dateLabel}</strong>.<br />Tutor: <strong>${params.tutorName}</strong>.${disclaimerHtml}`
    )
  } satisfies EmailTemplate
}

export function buildLessonsGeneratedMessage(params: {
  tutorName: string
  count: number
  weekStart: Date
}) {
  const weekLabel = params.weekStart.toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: '2-digit'
  })
  const message = params.count === 1
    ? `ti è stata assegnata 1 lezione per la settimana che inizia il ${weekLabel}.`
    : `ti sono state assegnate ${params.count} lezioni per la settimana che inizia il ${weekLabel}.`

  return {
    subject: 'Nuove lezioni assegnate',
    text: `Ciao ${params.tutorName}, ${message}`,
    html: buildEmailHtml(
      'Nuove lezioni assegnate',
      `Ciao ${params.tutorName}, ${message}`,
      { label: 'Vai alle lezioni', url: new URL('/tutor/lessons', env.SITE_URL ?? 'http://localhost:3000').toString() },
      { hideHomeButton: true }
    )
  } satisfies EmailTemplate
}

// Admin notifications. Every value is escaped: names and subjects come from users.
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)
}

function adminLink(path: string) {
  return new URL(path, env.SITE_URL ?? 'http://localhost:3000').toString()
}

function adminMessage(subject: string, lines: string[], action: { label: string, path: string }) {
  const url = adminLink(action.path)
  return {
    subject,
    text: `${lines.join(' ')} ${action.label}: ${url}`,
    html: buildEmailHtml(subject, lines.map(escapeHtml).join('<br />'), { label: action.label, url }, { hideHomeButton: true })
  } satisfies EmailTemplate
}

function studentLabel(name: string, classLabel: string | null) {
  return classLabel ? `${name} (${classLabel})` : name
}

export function buildLowFeedbackAdminMessage(params: {
  authorRole: 'student' | 'tutor'
  rating: number
  subjectName: string
  lessonStartAt: Date
  tutorName: string
  studentName: string
  studentClass: string | null
}) {
  const lesson = `la lezione di ${params.subjectName} del ${formatLessonDate(params.lessonStartAt)}`
  const student = studentLabel(params.studentName, params.studentClass)
  return params.authorRole === 'student'
    ? adminMessage('Feedback basso da uno studente', [
        `${student} ha dato ${params.rating}/5 al tutor ${params.tutorName} per ${lesson}.`
      ], { label: 'Vedi i feedback', path: '/admin/feedback' })
    : adminMessage('Feedback basso da un tutor', [
        `Il tutor ${params.tutorName} ha dato ${params.rating}/5 a ${student} per ${lesson}.`
      ], { label: 'Vedi i feedback', path: '/admin/feedback' })
}

export function buildLateCancellationAdminMessage(params: {
  lessonId: string
  subjectName: string
  lessonStartAt: Date
  tutorName: string
  studentName: string
  studentClass: string | null
}) {
  return adminMessage('Annullamento all\'ultimo momento', [
    `${studentLabel(params.studentName, params.studentClass)} ha annullato oggi la prenotazione alla lezione di ${params.subjectName} del ${formatLessonDate(params.lessonStartAt)} con il tutor ${params.tutorName}.`
  ], { label: 'Vedi la lezione', path: `/admin/lessons/${params.lessonId}` })
}

export function buildAbsenceAdminMessage(params: {
  lessonId: string
  subjectName: string
  lessonStartAt: Date
  tutorName: string
  studentName: string
  studentClass: string | null
}) {
  return adminMessage('Assenza segnata', [
    `${studentLabel(params.studentName, params.studentClass)} risulta assente alla lezione di ${params.subjectName} del ${formatLessonDate(params.lessonStartAt)} con il tutor ${params.tutorName}.`
  ], { label: 'Vedi la lezione', path: `/admin/lessons/${params.lessonId}` })
}

export function buildEmptyWeekAdminMessage(weekStart: Date) {
  const week = weekStart.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return adminMessage('Nessuna lezione generata', [
    `La generazione automatica non ha creato lezioni per la settimana del ${week}, che ha giorni di scuola aperti.`,
    'Controlla disponibilità, materie e stato dei tutor.'
  ], { label: 'Vedi i tutor', path: '/admin/tutors' })
}

export function buildPendingAdminsMessage(admins: Array<{ name: string, email: string }>) {
  return adminMessage('Admin in attesa di attivazione', [
    admins.length === 1
      ? 'Un admin ha accettato l\'invito e aspetta l\'attivazione:'
      : `${admins.length} admin hanno accettato l'invito e aspettano l'attivazione:`,
    ...admins.map(admin => `${admin.name} <${admin.email}>`)
  ], { label: 'Vedi gli admin', path: '/admin/admins' })
}

export function buildSubjectRequestsAdminMessage(requests: Array<{ subjectName: string, count: number, total: number }>) {
  return adminMessage('Nuove richieste di materie', [
    'Nelle ultime 24 ore gli studenti hanno chiesto:',
    ...requests.map(request => `${request.subjectName}: ${request.count} (${request.total} in totale)`)
  ], { label: 'Vedi le richieste', path: '/admin/stats?tab=subject-requests' })
}
