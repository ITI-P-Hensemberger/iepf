// Purpose: Every email's subject, plain text and HTML, built from the same few blocks so they all
// read alike: a short opening line, a card with the facts, then what to do, then any warning.
import fs from 'node:fs'
import path from 'node:path'

import env from '@/env'

const SUPPORT_EMAIL = 'iepf@hensemberger.it'

function siteUrl(pathname: string, params: Record<string, string> = {}) {
  const url = new URL(pathname, env.SITE_URL ?? 'http://localhost:3000')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

// Names, topics, classes, subjects and reasons are written by users: escape them before
// they go into the HTML body. Plain-text bodies, subjects and URLs stay as they are.
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  })[char]!)
}

interface EmailTemplate {
  subject: string
  text: string
  html: string
}

// One piece of an email, in both forms.
interface Block {
  text: string
  html: string
}

const TEXT_STYLE = 'font-size:15px;line-height:1.6;color:#475569;'
const NOTE_COLORS = { muted: '#64748b', warning: '#c2410c', danger: '#dc2626' } as const

// A paragraph of fixed copy; `html` only when it carries markup of its own.
function para(text: string, html = escapeHtml(text)): Block {
  return { text, html: `<div style="margin-top:12px;${TEXT_STYLE}">${html}</div>` }
}

// A smaller line under the rest: who did it, or what it costs.
function note(text: string, tone: keyof typeof NOTE_COLORS = 'muted'): Block {
  return { text, html: `<div style="margin-top:12px;font-size:13px;line-height:1.5;color:${NOTE_COLORS[tone]};${tone === 'muted'
    ? ''
    : 'font-weight:600;'}">${escapeHtml(text)}</div>` }
}

// "Tutor: Mario Rossi", the value in bold.
function field(label: string, value: string): Block {
  return { text: `${label}: ${value}`, html: `${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong>` }
}

function line(text: string): Block {
  return {
    text,
    html: escapeHtml(text).replace(/\n/g, '<br>')
  }
}

// The facts of the email in a box: a lesson, a reason, a list.
function card(title: string, lines: Block[]): Block {
  return {
    text: [
      title,
      ...lines.map(item => item.text)
    ].join('\n'),
    html: `
      <div style="margin-top:16px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;text-align:left;">
        <div style="font-weight:700;color:#0f172a;font-size:15px;">${escapeHtml(title)}</div>
        ${lines.map(item => `<div style="margin-top:6px;color:#475569;font-size:14px;line-height:1.5;">${item.html}</div>`).join('')}
      </div>
    `.trim()
  }
}

function contact(lead: string): Block {
  return para(
    `${lead} scrivi a ${SUPPORT_EMAIL}.`,
    `${escapeHtml(lead)} scrivi a <a href="mailto:${SUPPORT_EMAIL}" style="color:#0f172a;font-weight:600;">${SUPPORT_EMAIL}</a>.`
  )
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

// The page around the blocks: logo, title, blocks, one button (the email's action, or the
// home page), and the "ignore it" line only on emails someone could have asked for by mistake.
function buildEmailHtml(title: string, blocks: Block[], button: { label: string, url: string }, requested: boolean) {
  const logoDataUri = loadLogoDataUri()
  const logoHtml = logoDataUri
    ? `<img src="${logoDataUri}" alt="InsiemeÈ+Facile" style="display:block;width:96px;height:96px;margin:0 auto 12px;object-fit:contain;" />`
    : ''

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
      <h1 style="margin:0;font-size:22px;color:#0f172a;">${escapeHtml(title)}</h1>
      ${blocks.map(block => block.html).join('\n')}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0;">
        <tr>
          <td class="cta-cell" style="border-radius:8px;">
            <a href="${button.url}" class="cta-button" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;text-align:center;">${escapeHtml(button.label)}</a>
          </td>
        </tr>
      </table>
    </div>
    ${requested ? '<p style="margin:20px 0 0;text-align:center;font-size:12px;color:#94a3b8;">Se non hai richiesto questa email, puoi ignorarla.</p>' : ''}
  </div>
  `.trim()
}

function compose(params: {
  subject: string
  // The heading in the email; the subject when left out.
  title?: string
  blocks: Block[]
  action?: { label: string, url: string }
  // Sent because someone asked for it (a link to verify, reset, sign up): may reach the wrong inbox.
  requested?: boolean
}): EmailTemplate {
  const button = params.action ?? {
    label: 'Vai a IEPF',
    url: siteUrl('/')
  }
  const text = [
    ...params.blocks.map(block => block.text),
    params.action
      ? `${params.action.label}: ${params.action.url}`
      : null
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    subject: params.subject,
    text,
    html: buildEmailHtml(params.title ?? params.subject, params.blocks, button, params.requested ?? false)
  }
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
    return compact
      ? `${name} (${compact})`
      : name
  }

  const compact = normalized.replace(/\s+/g, '')
  return `${name} (${compact})`
}

function studentList(students: Array<{ name: string, classLabel?: string | null }>) {
  return students.map(student => buildStudentLabel(student.name, student.classLabel)).join(', ')
}

// A lesson's card: the subject on top (or just "Lezione" while it has none), then its facts.
function lessonCard(subjectName: string | null, startAt: Date, facts: Array<Block | null | false | undefined>) {
  return card(subjectName ?? 'Lezione', [
    line(formatLessonDate(startAt)),
    ...facts.filter((fact): fact is Block => Boolean(fact))
  ])
}

function topicField(topic?: string | null) {
  return topic
    ? field('Argomento', topic)
    : null
}

function topicsField(topics?: string[]) {
  const list = (topics ?? []).map(topic => topic.trim()).filter(Boolean)
  return list.length > 0
    ? field('Argomenti', list.join(', '))
    : null
}

const BY: Record<'student' | 'tutor' | 'admin', string> = {
  student: 'dallo studente',
  tutor: 'dal tutor',
  admin: 'da un amministratore'
}

const MEET_STUDENT = 'Fatti trovare in atrio all\'ora di inizio della lezione.'
const LATE_STUDENT = 'In caso di grave ritardo verrai segnato assente e la lezione non verrà rimborsata.'
const MEET_TUTOR = 'Aspetta lo studente in atrio: quando arriva, spostatevi nell\'atrio del primo piano.'

// Account and sign-in.

export function buildStudentRegistrationMessage(token: string) {
  return compose({
    subject: 'Verifica la tua email',
    blocks: [
      para('Benvenuto in IEPF! Verifica la tua email per completare la registrazione.')
    ],
    action: {
      label: 'Verifica email',
      url: siteUrl('/auth/verify-email', { token })
    },
    requested: true
  })
}

export function buildEmailVerificationMessage(token: string) {
  return compose({
    subject: 'Verifica la tua email',
    blocks: [
      para('Per continuare, verifica la tua email.')
    ],
    action: {
      label: 'Verifica email',
      url: siteUrl('/auth/verify-email', { token })
    },
    requested: true
  })
}

export function buildPasswordResetMessage(token: string) {
  return compose({
    subject: 'Reimposta la tua password',
    blocks: [
      para('Usa il pulsante qui sotto per scegliere una nuova password. Il link scade dopo poco tempo.')
    ],
    action: {
      label: 'Reimposta password',
      url: siteUrl('/auth/reset-password', { token })
    },
    requested: true
  })
}

export function buildTutorInviteMessage(token: string) {
  return compose({
    subject: 'Invito a registrarti come tutor',
    blocks: [
      para('Sei stato invitato a registrarti come tutor su IEPF. Completa la registrazione con il pulsante qui sotto.')
    ],
    action: {
      label: 'Registrati come tutor',
      url: siteUrl('/auth/sign-up-tutor', { token })
    },
    requested: true
  })
}

export function buildAdminInviteMessage(token: string) {
  return compose({
    subject: 'Invito a registrarti come admin',
    blocks: [
      para('Sei stato invitato a registrarti come admin su IEPF. Completa la registrazione con il pulsante qui sotto.')
    ],
    action: {
      label: 'Registrati come admin',
      url: siteUrl('/auth/sign-up-admin', { token })
    },
    requested: true
  })
}

export function buildRegistrationConfirmedMessage() {
  return compose({
    subject: 'Registrazione completata',
    blocks: [
      para('La tua email è stata verificata. Ora puoi accedere.')
    ]
  })
}

export function buildProfileUpdatedMessage() {
  return compose({
    subject: 'Il tuo profilo è stato aggiornato',
    title: 'Profilo aggiornato',
    blocks: [
      para('I dati del tuo profilo sono stati aggiornati.'),
      contact('Se non ti aspettavi questa modifica,')
    ]
  })
}

// Sent to the old address: whoever still reads it learns where the account went.
export function buildEmailChangedMessage(newEmail: string) {
  return compose({
    subject: 'Il tuo indirizzo email è stato cambiato',
    title: 'Email cambiata',
    blocks: [
      para('Gli organizzatori hanno cambiato l\'indirizzo email del tuo account IEPF. Da ora le email arrivano al nuovo indirizzo.'),
      card('Nuovo indirizzo', [
        line(newEmail)
      ]),
      contact('Se non ti aspettavi questa modifica,')
    ]
  })
}

export function buildLessonHoursChangedMessage(params: { delta: number, balance: number }) {
  const amount = Math.abs(params.delta) === 1
    ? '1 ora'
    : `${Math.abs(params.delta)} ore`
  return compose({
    subject: params.delta > 0
      ? 'Ore di lezione aggiunte'
      : 'Ore di lezione tolte',
    blocks: [
      para(params.delta > 0
        ? `Gli organizzatori ti hanno aggiunto ${amount} di lezione.`
        : `Gli organizzatori ti hanno tolto ${amount} di lezione.`),
      card('Ore rimanenti', [
        line(String(params.balance))
      ]),
      contact('Per chiarimenti')
    ],
    action: {
      label: 'Prenota una lezione',
      url: siteUrl('/student/book')
    }
  })
}

export function buildPasswordChangedMessage() {
  return compose({
    subject: 'Password aggiornata',
    blocks: [
      para('La tua password è stata aggiornata.'),
      contact('Se non sei stato tu,')
    ]
  })
}

export function buildActivationChangedMessage(isActive: boolean, reason: string | null = null) {
  if (isActive) {
    return compose({
      subject: 'Il tuo account è ora attivo',
      title: 'Account attivo',
      blocks: [
        para('Il tuo account è stato attivato. Ora puoi usare la piattaforma.')
      ]
    })
  }
  return compose({
    subject: 'Il tuo account è stato disattivato',
    title: 'Account disattivato',
    blocks: [
      para('Il tuo account è stato disattivato: non puoi usare la piattaforma finché non viene riattivato.'),
      ...(reason
        ? [
            card('Motivo', [
              line(reason)
            ])
          ]
        : []),
      contact('Per chiarimenti')
    ]
  })
}

// Sent from a computer: the user opens it on the phone, where push is worth turning on.
export function buildPushSetupLinkMessage() {
  return compose({
    subject: 'Attiva le notifiche di IEPF sul telefono',
    title: 'Attiva le notifiche sul telefono',
    blocks: [
      para('Apri questa email dal telefono e tocca il pulsante: IEPF ti guiderà ad attivare le notifiche.')
    ],
    // The profile is behind login: a phone that is not signed in goes through login and back here.
    action: {
      label: 'Apri IEPF sul telefono',
      url: siteUrl('/profile', { 'attiva-notifiche': '1' })
    },
    requested: true
  })
}

// Lessons.

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
  const byAdmin = params.bookedByAdmin
    ? note('Prenotazione fatta da un amministratore.')
    : null
  if (params.recipientRole === 'student') {
    return compose({
      subject: 'Prenotazione confermata',
      blocks: [
        para('La tua prenotazione è confermata.'),
        lessonCard(params.subjectName, params.lessonStartAt, [
          field('Tutor', params.tutorName),
          topicField(params.topic)
        ]),
        para(MEET_STUDENT),
        note(LATE_STUDENT, 'warning'),
        ...(byAdmin
          ? [byAdmin]
          : [])
      ]
    })
  }
  return compose({
    subject: 'Nuova prenotazione',
    blocks: [
      para('Uno studente ha prenotato una tua lezione.'),
      lessonCard(params.subjectName, params.lessonStartAt, [
        field('Studente', buildStudentLabel(params.studentName, params.studentClass)),
        topicField(params.topic)
      ]),
      para(MEET_TUTOR),
      ...(byAdmin
        ? [byAdmin]
        : [])
    ]
  })
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
  if (params.recipientRole === 'student') {
    return compose({
      subject: 'Prenotazione annullata',
      blocks: [
        para(params.canceledBy === 'student'
          ? 'Hai annullato la tua prenotazione.'
          : `La tua prenotazione è stata annullata ${BY[params.canceledBy]}.`),
        lessonCard(params.subjectName, params.lessonStartAt, [
          field('Tutor', params.tutorName),
          topicField(params.topic)
        ]),
        ...(params.noRefundNotice && params.canceledBy !== 'admin'
          ? [
              note('La lezione non verrà rimborsata: l\'annullamento è avvenuto dopo le 20 del giorno prima.', 'danger')
            ]
          : [])
      ]
    })
  }
  const student = buildStudentLabel(params.studentName, params.studentClass)
  return compose({
    subject: 'Prenotazione annullata',
    blocks: [
      para(params.canceledBy === 'tutor'
        ? `Hai annullato la prenotazione di ${student}.`
        : `La prenotazione di ${student} è stata annullata ${BY[params.canceledBy]}.`),
      lessonCard(params.subjectName, params.lessonStartAt, [
        field('Studente', student),
        topicField(params.topic)
      ]),
      ...(params.tutorPartialNotice && params.canceledBy !== 'admin'
        ? [
            note('Lo studente ha annullato dopo le 8 del giorno della lezione: la lezione verrà conteggiata parzialmente.', 'warning')
          ]
        : [])
    ]
  })
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
  const facts = params.recipientRole === 'student'
    ? [
        field('Tutor', params.tutorName),
        topicField(params.topic)
      ]
    : [
        field('Studenti', studentList(params.students) || 'nessuno'),
        topicsField(params.topics)
      ]
  return compose({
    subject: 'Lezione annullata',
    blocks: [
      para(params.canceledBy === params.recipientRole
        ? 'Hai annullato la lezione.'
        : `La lezione è stata annullata ${BY[params.canceledBy]}.`),
      lessonCard(params.subjectName, params.lessonStartAt, facts)
    ]
  })
}

export function buildLessonRescheduledMessage(params: {
  recipientRole: 'student' | 'tutor'
  oldStartAt: Date
  newStartAt: Date
  // null while the lesson waits for its first booking to choose the subject.
  oldSubjectName: string | null
  newSubjectName: string | null
  oldTutorName: string
  newTutorName: string
  students: Array<{ name: string, classLabel?: string | null }>
  rescheduledByAdmin?: boolean
}) {
  return compose({
    subject: 'Lezione riprogrammata',
    blocks: [
      para(params.rescheduledByAdmin ? 'Un amministratore ha riprogrammato la lezione.' : 'La lezione è stata riprogrammata.'),
      card(params.newSubjectName ?? 'Lezione', [
        field('Prima', formatLessonDate(params.oldStartAt)),
        field('Ora', formatLessonDate(params.newStartAt)),
        params.recipientRole === 'student'
          ? field('Tutor', params.newTutorName)
          : field('Studenti', studentList(params.students) || 'nessuno')
      ])
    ]
  })
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
  const when = params.today ? 'oggi' : 'domani'
  return compose({
    subject: `Promemoria: lezione di ${when}`,
    blocks: [
      para(`Ti ricordiamo la lezione di ${when}.`),
      lessonCard(params.subjectName, params.lessonStartAt, [
        field('Tutor', params.tutorName),
        topicField(params.topic)
      ]),
      para(MEET_STUDENT),
      note(LATE_STUDENT, 'warning')
    ]
  })
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
  const when = params.today ? 'oggi' : 'domani'
  return compose({
    subject: `Promemoria: lezioni di ${when}`,
    blocks: [
      para(`Ecco le lezioni confermate di ${when}.`),
      ...params.lessons.map(lesson => lessonCard(lesson.subjectName, lesson.startAt, [
        topicsField(lesson.topics),
        lesson.students.length > 0
          ? field('Studenti', studentList(lesson.students))
          : line('Nessuno studente prenotato.')
      ])),
      para(MEET_TUTOR),
      para('Segna la presenza dello studente appena arriva.')
    ],
    action: {
      label: 'Vai alle lezioni',
      url: siteUrl('/tutor/lessons')
    }
  })
}

export function buildLessonCreatedMessage(params: {
  lessonId: string
  lessonStartAt: Date
  subjectName: string | null
  tutorName: string
}) {
  return compose({
    subject: 'Nuova lezione assegnata',
    blocks: [
      para('Ti è stata assegnata una nuova lezione.'),
      lessonCard(params.subjectName, params.lessonStartAt, [
        field('Tutor', params.tutorName)
      ])
    ],
    action: {
      label: 'Vedi dettagli lezione',
      url: siteUrl(`/tutor/lessons/${params.lessonId}`)
    }
  })
}

// The previous tutor of a lesson an admin moved to someone else.
export function buildLessonReassignedMessage(params: {
  lessonStartAt: Date
  subjectName: string | null
  tutorName: string
}) {
  return compose({
    subject: 'Lezione riassegnata',
    blocks: [
      para('Un amministratore ha affidato questa lezione a un altro tutor: non devi più tenerla.'),
      lessonCard(params.subjectName, params.lessonStartAt, [])
    ]
  })
}

export function buildLessonPresenceUpdatedMessage(params: {
  lessonStartAt: Date
  subjectName: string
  tutorName: string
  present: boolean
}) {
  return compose({
    subject: params.present ? 'Presenza confermata' : 'Assenza registrata',
    blocks: [
      para(params.present ? 'Il tutor ha confermato la tua presenza alla lezione.' : 'Il tutor ti ha segnato assente alla lezione.'),
      lessonCard(params.subjectName, params.lessonStartAt, [
        field('Tutor', params.tutorName)
      ]),
      ...(params.present
        ? []
        : [
            note('L\'ora di lezione non verrà rimborsata.', 'danger')
          ])
    ]
  })
}

export function buildLessonFeedbackReminderMessage(role: 'student' | 'tutor', count: number) {
  return compose({
    subject: 'Ricorda di lasciare il feedback',
    blocks: [
      para(count === 1
        ? 'Una lezione di oggi aspetta il tuo feedback.'
        : `${count} lezioni di oggi aspettano il tuo feedback.`)
    ],
    action: {
      label: 'Vai alle lezioni',
      url: siteUrl(role === 'student'
        ? '/student/lessons'
        : '/tutor/lessons')
    }
  })
}

export function buildLessonsGeneratedMessage(params: {
  tutorName: string
  count: number
  weekStart: Date
}) {
  const week = params.weekStart.toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: '2-digit' })
  return compose({
    subject: 'Lezioni della settimana assegnate',
    blocks: [
      para(params.count === 1
        ? `Ti è stata assegnata 1 lezione per la settimana che inizia il ${week}.`
        : `Ti sono state assegnate ${params.count} lezioni per la settimana che inizia il ${week}.`)
    ],
    action: {
      label: 'Vai alle lezioni',
      url: siteUrl('/tutor/lessons')
    }
  })
}

// Admin notifications.

export function buildLowFeedbackAdminMessage(params: {
  authorRole: 'student' | 'tutor'
  rating: number
  subjectName: string
  lessonStartAt: Date
  tutorName: string
  studentName: string
  studentClass: string | null
}) {
  const fromStudent = params.authorRole === 'student'
  return compose({
    subject: fromStudent ? 'Feedback basso da uno studente' : 'Feedback basso da un tutor',
    blocks: [
      para(fromStudent ? 'Uno studente ha dato un voto basso al tutor.' : 'Un tutor ha dato un voto basso a uno studente.'),
      lessonCard(params.subjectName, params.lessonStartAt, [
        field('Voto', `${params.rating}/5`),
        field('Tutor', params.tutorName),
        field('Studente', buildStudentLabel(params.studentName, params.studentClass))
      ])
    ],
    action: {
      label: 'Vedi i feedback',
      url: siteUrl('/admin/feedback')
    }
  })
}

export function buildLateCancellationAdminMessage(params: {
  lessonId: string
  subjectName: string
  lessonStartAt: Date
  tutorName: string
  studentName: string
  studentClass: string | null
}) {
  return compose({
    subject: 'Annullamento all\'ultimo momento',
    blocks: [
      para('Uno studente ha annullato oggi la prenotazione.'),
      lessonCard(params.subjectName, params.lessonStartAt, [
        field('Studente', buildStudentLabel(params.studentName, params.studentClass)),
        field('Tutor', params.tutorName)
      ])
    ],
    action: {
      label: 'Vedi la lezione',
      url: siteUrl(`/admin/lessons/${params.lessonId}`)
    }
  })
}

export function buildAbsenceAdminMessage(params: {
  lessonId: string
  subjectName: string
  lessonStartAt: Date
  tutorName: string
  studentName: string
  studentClass: string | null
}) {
  return compose({
    subject: 'Assenza segnata',
    blocks: [
      para('Il tutor ha segnato assente uno studente.'),
      lessonCard(params.subjectName, params.lessonStartAt, [
        field('Studente', buildStudentLabel(params.studentName, params.studentClass)),
        field('Tutor', params.tutorName)
      ])
    ],
    action: {
      label: 'Vedi la lezione',
      url: siteUrl(`/admin/lessons/${params.lessonId}`)
    }
  })
}

export function buildMissingPresenceTutorMessage(params: {
  lessonId: string
  subjectName: string
  lessonStartAt: Date
}) {
  return compose({
    subject: 'Segna le presenze',
    blocks: [
      para('La lezione è iniziata da 20 minuti e le presenze non sono ancora segnate.'),
      lessonCard(params.subjectName, params.lessonStartAt, [])
    ],
    action: {
      label: 'Segna le presenze',
      url: siteUrl(`/tutor/lessons/${params.lessonId}`)
    }
  })
}

export function buildMissingPresenceAdminMessage(params: {
  lessonId: string
  subjectName: string
  lessonStartAt: Date
  tutorName: string
}) {
  return compose({
    subject: 'Presenze non segnate',
    blocks: [
      para('La lezione è iniziata da 20 minuti e il tutor non ha ancora segnato le presenze.'),
      lessonCard(params.subjectName, params.lessonStartAt, [
        field('Tutor', params.tutorName)
      ])
    ],
    action: {
      label: 'Vedi la lezione',
      url: siteUrl(`/admin/lessons/${params.lessonId}`)
    }
  })
}

export function buildEmptyWeekAdminMessage(weekStart: Date) {
  const week = weekStart.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return compose({
    subject: 'Nessuna lezione generata',
    blocks: [
      para(`La generazione automatica non ha creato lezioni per la settimana del ${week}, che ha giorni di scuola aperti.`),
      para('Controlla disponibilità, materie e stato dei tutor.')
    ],
    action: {
      label: 'Vedi i tutor',
      url: siteUrl('/admin/tutors')
    }
  })
}

export function buildPendingAdminsMessage(admins: Array<{ name: string, email: string }>) {
  return compose({
    subject: 'Admin in attesa di attivazione',
    blocks: [
      para(admins.length === 1
        ? 'Un admin ha accettato l\'invito e aspetta l\'attivazione.'
        : `${admins.length} admin hanno accettato l'invito e aspettano l'attivazione.`),
      card('In attesa', admins.map(admin => line(`${admin.name} <${admin.email}>`)))
    ],
    action: {
      label: 'Vedi gli admin',
      url: siteUrl('/admin/admins')
    }
  })
}

export function buildSubjectRequestsAdminMessage(requests: Array<{ subjectName: string, count: number, total: number }>) {
  return compose({
    subject: 'Nuove richieste di materie',
    blocks: [
      para('Nelle ultime 24 ore gli studenti hanno chiesto queste materie.'),
      card('Richieste', requests.map(request => field(request.subjectName, `${request.count} (${request.total} in totale)`)))
    ],
    action: {
      label: 'Vedi le richieste',
      url: siteUrl('/admin/stats', { tab: 'subject-requests' })
    }
  })
}
