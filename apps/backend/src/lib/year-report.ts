import type { CellValue, Column, Sheet } from '@/lib/xlsx/workbook'
// Purpose: The year report: one .xlsx with a summary, monthly trends, every student, tutor,
// lesson, booking and feedback, and the usage statistics. Native Excel charts and tables, so
// it reads well on its own and can still be filtered and reworked.
import type { ReportData, ReportPerson } from '@/lib/year-report-data'

import { romeDay } from '@/lib/analytics'
import { Workbook } from '@/lib/xlsx/workbook'

const LESSON_STATUS: Record<string, string> = {
  scheduled: 'Programmata',
  confirmed: 'Confermata',
  completed: 'Completata',
  canceled: 'Annullata'
}

const BOOKING_STATUS: Record<string, string> = { confirmed: 'Confermata', canceled: 'Annullata' }

const ROLE_LABEL: Record<string, string> = { student: 'Studente', tutor: 'Tutor', admin: 'Admin', activator: 'Attivatore' }

const CATEGORY_LABEL: Record<string, string> = {
  bookings: 'Prenotazioni',
  reminders: 'Promemoria',
  feedback: 'Feedback',
  account: 'Account',
  lessons: 'Lezioni',
  adminLowFeedback: 'Feedback bassi',
  adminLateCancellations: 'Annullamenti tardivi',
  adminAbsences: 'Assenze',
  adminEmptyWeek: 'Settimana vuota',
  adminPendingAdmins: 'Admin in attesa',
  adminSubjectRequests: 'Richieste materie',
  other: 'Altro'
}

const BOOKING_OUTCOME: Record<string, string> = {
  ok: 'Riuscita',
  not_found: 'Lezione non trovata',
  profanity: 'Argomento non ammesso',
  closed: 'Lezione chiusa',
  too_late: 'Fuori tempo',
  student_inactive: 'Studente non attivo',
  tutor_year: 'Anno del tutor',
  no_tokens: 'Ore finite',
  already_booked: 'Già prenotata',
  daily_limit: 'Limite giornaliero',
  tutor_full: 'Tutor al completo',
  lesson_full: 'Posti esauriti'
}

export function schoolYearLabel(now: Date) {
  const [year, month] = romeDay(now).split('-').map(Number)
  const start = month >= 9 ? year : year - 1
  return `${start}/${String(start + 1).slice(2)}`
}

export function reportFilename(now: Date) {
  return `iepf-report-${schoolYearLabel(now).replace('/', '-')}-${romeDay(now)}.xlsx`
}

const monthFormat = new Intl.DateTimeFormat('it-IT', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const dateTimeFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' })
const dateFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeZone: 'Europe/Rome' })

function monthKey(date: Date | string) {
  return (typeof date === 'string' ? date : romeDay(date)).slice(0, 7)
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return monthFormat.format(new Date(Date.UTC(year, month - 1, 1)))
}

// Every month from the first to the last key, at most the last 24.
function monthRange(keys: string[], now: Date) {
  const sorted = keys.length > 0 ? [...keys].sort() : [monthKey(now)]
  const [firstYear, firstMonth] = sorted[0].split('-').map(Number)
  const [lastYear, lastMonth] = sorted.at(-1)!.split('-').map(Number)
  const months: string[] = []
  for (let y = firstYear, m = firstMonth; y < lastYear || (y === lastYear && m <= lastMonth); m === 12 ? (y += 1, m = 1) : (m += 1)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return months.slice(-24)
}

function ratio(part: number, whole: number) {
  return whole > 0 ? part / whole : null
}

function average(values: number[]) {
  return values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null
}

function fullName(person: ReportPerson | undefined) {
  return person ? `${person.lastName} ${person.firstName}` : ''
}

function yesNo(value: boolean) {
  return value ? 'Sì' : 'No'
}

function personStatus(person: ReportPerson) {
  if (!person.emailVerified)
    return 'Email da verificare'
  return person.isActive ? 'Attivo' : 'In attesa di attivazione'
}

function presenceLabel(presence: boolean | null) {
  return presence === true ? 'Presente' : presence === false ? 'Assente' : 'Non registrata'
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return counts
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const list = groups.get(key(item)) ?? []
    list.push(item)
    groups.set(key(item), list)
  }
  return groups
}

const PERCENT = { style: 'percent' } as const
const DECIMAL = { style: 'decimal' } as const

export function buildYearReport(data: ReportData, now = new Date()) {
  const schoolYear = schoolYearLabel(now)
  const workbook = new Workbook({ title: `IEPF - Report ${schoolYear}`, creator: 'IEPF', created: now })

  const people = new Map(data.people.map(person => [person.id, person]))
  const students = data.people.filter(person => person.role === 'student').sort((a, b) => fullName(a).localeCompare(fullName(b), 'it'))
  const tutors = data.people.filter(person => person.role === 'tutor').sort((a, b) => fullName(a).localeCompare(fullName(b), 'it'))
  const subjectName = new Map(data.subjects.map(subject => [subject.id, subject.name]))
  const lessonById = new Map(data.lessons.map(lesson => [lesson.id, lesson]))
  const confirmed = data.bookings.filter(booking => booking.status === 'confirmed')
  const bookingsByLesson = groupBy(confirmed, booking => booking.lessonId)
  const bookingsByStudent = groupBy(data.bookings, booking => booking.studentId)
  const lessonsByTutor = groupBy(data.lessons, lesson => lesson.tutorId)
  const feedbackBy = groupBy(data.feedback, item => item.authorUserId)
  const feedbackFor = groupBy(data.feedback, item => item.targetUserId)
  const requestsByStudent = countBy(data.subjectRequests, request => request.studentId)
  const present = confirmed.filter(booking => booking.presence === true).length
  const absent = confirmed.filter(booking => booking.presence === false).length
  const completed = data.lessons.filter(lesson => lesson.status === 'completed')
  const ratingsOf = (role: string) => data.feedback.filter(item => item.authorRole === role).map(item => item.rating)

  const months = monthRange([...data.lessons.map(lesson => monthKey(lesson.startAt)), ...data.bookings.map(booking => monthKey(booking.createdAt))], now)
  const firstLesson = data.lessons[0]?.startAt
  const lastLesson = data.lessons.at(-1)?.startAt

  // ---- Riepilogo -------------------------------------------------------------------------
  const summary = workbook.addSheet('Riepilogo')
  summary.gridlines = false
  summary.widths = [44, 14, 3]
  summary.addHeading(
    `IEPF · Report dell'anno scolastico ${schoolYear}`,
    `Generato il ${dateTimeFormat.format(now)}${firstLesson && lastLesson ? ` · lezioni dal ${dateFormat.format(firstLesson)} al ${dateFormat.format(lastLesson)}` : ''}`
  )
  const kpi = (label: string, value: CellValue, format?: 'percent' | 'decimal') => summary.addRow([
    { value: label, style: 'label' },
    value === null
      ? { value: '—', style: 'value' }
      : { value, style: format === 'percent' ? 'valuePercent' : format === 'decimal' ? 'valueDecimal' : 'value' }
  ])
  const section = (title: string) => {
    summary.addRow([{ value: title, style: 'section' }, { value: '', style: 'section' }], 22)
  }

  const studentsWithBooking = students.filter(student => (bookingsByStudent.get(student.id) ?? []).some(booking => booking.status === 'confirmed')).length
  const verified = data.people.filter(person => person.emailVerified && person.role !== 'activator')

  section('Persone')
  kpi('Studenti iscritti', students.length)
  kpi('Studenti attivi', students.filter(student => student.isActive).length)
  kpi('Studenti che hanno prenotato almeno una lezione', ratio(studentsWithBooking, students.length), 'percent')
  kpi('Tutor iscritti', tutors.length)
  kpi('Tutor attivi', tutors.filter(tutor => tutor.isActive).length)
  kpi('Utenti con le notifiche push attive', ratio(verified.filter(person => person.hasPush).length, verified.length), 'percent')
  summary.skip()

  section('Lezioni')
  const statusRow = summary.nextRow
  const plural: Record<string, string> = { completed: 'Completate', confirmed: 'Confermate (con prenotazioni)', scheduled: 'Programmate (senza prenotazioni)', canceled: 'Annullate' }
  for (const status of ['completed', 'confirmed', 'scheduled', 'canceled']) {
    kpi(plural[status], data.lessons.filter(lesson => lesson.status === status).length)
  }
  const statusLastRow = summary.nextRow - 1
  kpi('Lezioni in totale', data.lessons.length)
  kpi('Ore di tutoraggio svolte', Math.round(completed.reduce((sum, lesson) => sum + lesson.durationMinutes, 0) / 6) / 10, 'decimal')
  summary.skip()

  section('Prenotazioni')
  kpi('Prenotazioni confermate', confirmed.length)
  kpi('Prenotazioni annullate', data.bookings.length - confirmed.length)
  kpi('Presenze', present)
  kpi('Assenze', absent)
  kpi('Presenza media (sulle presenze registrate)', ratio(present, present + absent), 'percent')
  summary.skip()

  section('Feedback')
  kpi('Feedback lasciati', data.feedback.length)
  kpi('Voto medio dato dagli studenti ai tutor', average(ratingsOf('student')), 'decimal')
  kpi('Voto medio dato dai tutor agli studenti', average(ratingsOf('tutor')), 'decimal')
  summary.skip()

  section('Come leggere questo file')
  for (const line of [
    'Andamento: lezioni, prenotazioni, presenze e feedback mese per mese.',
    'Classi: iscritti, prenotazioni e presenze per anno e sezione.',
    'Studenti, Tutor: una riga per persona, con i loro numeri dell\'anno.',
    'Lezioni, Prenotazioni, Feedback: l\'elenco completo, una riga per voce.',
    'Materie: tutor, lezioni e richieste per materia.',
    'Utilizzo: statistiche d\'uso del sito, anonime (senza nomi né identificativi).',
    'Ogni elenco è una tabella di Excel: le frecce nell\'intestazione filtrano e ordinano.'
  ]) {
    summary.addRow([{ value: line, style: 'note' }])
  }

  // ---- Andamento -------------------------------------------------------------------------
  const trend = workbook.addSheet('Andamento')
  trend.addHeading('Andamento mese per mese', 'Le lezioni contano nel mese in cui si svolgono, i nuovi iscritti nel mese di registrazione.')
  const lessonsByMonth = groupBy(data.lessons, lesson => monthKey(lesson.startAt))
  const feedbackByMonth = groupBy(data.feedback, item => monthKey(item.createdAt))
  const signupsByMonth = countBy(data.people.filter(person => person.role === 'student' || person.role === 'tutor'), person => monthKey(person.createdAt))
  const trendColumns: Column[] = [
    { header: 'Mese' },
    { header: 'Lezioni' },
    { header: 'Completate' },
    { header: 'Annullate' },
    { header: 'Prenotazioni' },
    { header: 'Presenze' },
    { header: 'Assenze' },
    { header: 'Presenza (%)', ...PERCENT },
    { header: 'Feedback' },
    { header: 'Voto medio', ...DECIMAL },
    { header: 'Nuovi iscritti' }
  ]
  const trendTable = trend.addTable('Andamento', trendColumns, months.map((month) => {
    const monthLessons = lessonsByMonth.get(month) ?? []
    const monthBookings = monthLessons.flatMap(lesson => bookingsByLesson.get(lesson.id) ?? [])
    const monthPresent = monthBookings.filter(booking => booking.presence === true).length
    const monthAbsent = monthBookings.filter(booking => booking.presence === false).length
    const monthFeedback = feedbackByMonth.get(month) ?? []
    return [
      monthLabel(month),
      monthLessons.length,
      monthLessons.filter(lesson => lesson.status === 'completed').length,
      monthLessons.filter(lesson => lesson.status === 'canceled').length,
      monthBookings.length,
      monthPresent,
      monthAbsent,
      ratio(monthPresent, monthPresent + monthAbsent),
      monthFeedback.length,
      average(monthFeedback.map(item => item.rating)),
      signupsByMonth.get(month) ?? 0
    ]
  }))
  trend.freezeAbove(trendTable.firstRow)
  const chartRow = trendTable.lastRow + 3
  trend.addChart({
    type: 'column',
    title: 'Lezioni e prenotazioni per mese',
    categories: trendTable.column(0),
    series: [{ name: 'Lezioni', values: trendTable.column(1) }, { name: 'Prenotazioni', values: trendTable.column(4) }],
    at: { col: 0, row: chartRow },
    size: { cols: 6, rows: 18 }
  })
  trend.addChart({
    type: 'line',
    title: 'Presenza per mese',
    categories: trendTable.column(0),
    series: [{ name: 'Presenza', values: trendTable.column(7) }],
    at: { col: 6, row: chartRow },
    size: { cols: 5, rows: 18 },
    percent: true
  })

  summary.addChart({
    type: 'column',
    title: 'Lezioni e prenotazioni per mese',
    categories: trendTable.column(0),
    series: [{ name: 'Lezioni', values: trendTable.column(1) }, { name: 'Prenotazioni', values: trendTable.column(4) }],
    at: { col: 3, row: 4 },
    size: { cols: 9, rows: 17 }
  })
  summary.addChart({
    type: 'bar',
    title: 'Lezioni per stato',
    categories: { sheet: summary.name, col: 0, firstRow: statusRow, lastRow: statusLastRow },
    series: [{ name: 'Lezioni', values: { sheet: summary.name, col: 1, firstRow: statusRow, lastRow: statusLastRow } }],
    at: { col: 3, row: 22 },
    size: { cols: 9, rows: 14 }
  })

  // ---- Classi ----------------------------------------------------------------------------
  const classes = workbook.addSheet('Classi')
  classes.addHeading('Studenti per classe', 'Prenotazioni confermate e presenze degli studenti di ogni classe.')
  const byClass = groupBy(students, student => `${student.year ?? ''}|${student.section ?? ''}`)
  const classRows = [...byClass.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'it', { numeric: true }))
    .map(([key, members]) => {
      const [year, sectionName] = key.split('|')
      const classBookings = members.flatMap(member => (bookingsByStudent.get(member.id) ?? []).filter(booking => booking.status === 'confirmed'))
      const classPresent = classBookings.filter(booking => booking.presence === true).length
      const classAbsent = classBookings.filter(booking => booking.presence === false).length
      return [
        `${year ? `${year}ª` : '-'} ${sectionName || ''}`.trim(),
        year ? Number(year) : null,
        sectionName || null,
        members.length,
        members.filter(member => member.isActive).length,
        classBookings.length,
        classPresent,
        classAbsent,
        ratio(classPresent, classPresent + classAbsent)
      ] as CellValue[]
    })
  const classTable = classes.addTable('Classi', [
    { header: 'Classe' },
    { header: 'Anno' },
    { header: 'Sezione' },
    { header: 'Studenti' },
    { header: 'Attivi' },
    { header: 'Prenotazioni' },
    { header: 'Presenze' },
    { header: 'Assenze' },
    { header: 'Presenza (%)', ...PERCENT }
  ], classRows)
  classes.freezeAbove(classTable.firstRow)
  if (classRows.length > 0) {
    classes.addChart({
      type: 'bar',
      title: 'Prenotazioni per classe',
      categories: classTable.column(0),
      series: [{ name: 'Prenotazioni', values: classTable.column(5) }],
      at: { col: 10, row: classTable.headerRow },
      size: { cols: 7, rows: Math.max(12, Math.min(40, classRows.length * 2 + 4)) }
    })
  }

  // ---- Studenti --------------------------------------------------------------------------
  const studentSheet = workbook.addSheet('Studenti')
  studentSheet.addHeading('Studenti', 'Una riga per studente. "Ore residue" sono le ore ancora prenotabili al momento del report.')
  const studentTable = studentSheet.addTable('Studenti', [
    { header: 'Cognome' },
    { header: 'Nome' },
    { header: 'Email' },
    { header: 'Anno' },
    { header: 'Sezione' },
    { header: 'Stato' },
    { header: 'Iscritto il', style: 'date' },
    { header: 'Notifiche push' },
    { header: 'Prenotazioni' },
    { header: 'Annullate' },
    { header: 'Presenze' },
    { header: 'Assenze' },
    { header: 'Presenza (%)', ...PERCENT },
    { header: 'Ore residue' },
    { header: 'Feedback lasciati' },
    { header: 'Voto medio dato', ...DECIMAL },
    { header: 'Voto medio ricevuto', ...DECIMAL },
    { header: 'Richieste di materie' }
  ], students.map((student) => {
    const own = bookingsByStudent.get(student.id) ?? []
    const ownConfirmed = own.filter(booking => booking.status === 'confirmed')
    const ownPresent = ownConfirmed.filter(booking => booking.presence === true).length
    const ownAbsent = ownConfirmed.filter(booking => booking.presence === false).length
    return [
      student.lastName,
      student.firstName,
      student.email,
      student.year,
      student.section,
      personStatus(student),
      student.createdAt,
      yesNo(student.hasPush),
      ownConfirmed.length,
      own.length - ownConfirmed.length,
      ownPresent,
      ownAbsent,
      ratio(ownPresent, ownPresent + ownAbsent),
      data.tokenBalances.get(student.id) ?? 0,
      (feedbackBy.get(student.id) ?? []).length,
      average((feedbackBy.get(student.id) ?? []).map(item => item.rating)),
      average((feedbackFor.get(student.id) ?? []).map(item => item.rating)),
      requestsByStudent.get(student.id) ?? 0
    ]
  }))
  studentSheet.freezeAbove(studentTable.firstRow)

  // ---- Tutor -----------------------------------------------------------------------------
  const subjectsByTutor = groupBy(data.tutorSubjects, row => row.tutorId)
  const tutorSheet = workbook.addSheet('Tutor')
  tutorSheet.addHeading('Tutor', 'Una riga per tutor. "Conteggiate" sono le lezioni valide per le ore del tutor.')
  const tutorTable = tutorSheet.addTable('Tutor', [
    { header: 'Cognome' },
    { header: 'Nome' },
    { header: 'Email' },
    { header: 'Anno' },
    { header: 'Sezione' },
    { header: 'Stato' },
    { header: 'Materie', width: 36 },
    { header: 'Lezioni al giorno' },
    { header: 'Lezioni' },
    { header: 'Completate' },
    { header: 'In programma' },
    { header: 'Annullate' },
    { header: 'Conteggiate' },
    { header: 'Ore svolte', ...DECIMAL },
    { header: 'Prenotazioni ricevute' },
    { header: 'Studenti diversi' },
    { header: 'Presenza (%)', ...PERCENT },
    { header: 'Feedback ricevuti' },
    { header: 'Voto medio ricevuto', ...DECIMAL }
  ], tutors.map((tutor) => {
    const own = lessonsByTutor.get(tutor.id) ?? []
    const ownBookings = own.flatMap(lesson => bookingsByLesson.get(lesson.id) ?? [])
    const ownPresent = ownBookings.filter(booking => booking.presence === true).length
    const ownAbsent = ownBookings.filter(booking => booking.presence === false).length
    const received = feedbackFor.get(tutor.id) ?? []
    return [
      tutor.lastName,
      tutor.firstName,
      tutor.email,
      tutor.year,
      tutor.section,
      personStatus(tutor),
      (subjectsByTutor.get(tutor.id) ?? []).map(row => subjectName.get(row.subjectId) ?? '').filter(Boolean).sort().join(', '),
      data.tutorCapacity.get(tutor.id) ?? null,
      own.length,
      own.filter(lesson => lesson.status === 'completed').length,
      own.filter(lesson => lesson.status === 'scheduled' || lesson.status === 'confirmed').length,
      own.filter(lesson => lesson.status === 'canceled').length,
      own.filter(lesson => lesson.countsForTutor).length,
      Math.round(own.filter(lesson => lesson.status === 'completed').reduce((sum, lesson) => sum + lesson.durationMinutes, 0) / 6) / 10,
      ownBookings.length,
      new Set(ownBookings.map(booking => booking.studentId)).size,
      ratio(ownPresent, ownPresent + ownAbsent),
      received.length,
      average(received.map(item => item.rating))
    ]
  }))
  tutorSheet.freezeAbove(tutorTable.firstRow)

  // ---- Lezioni ---------------------------------------------------------------------------
  const lessonSheet = workbook.addSheet('Lezioni')
  lessonSheet.addHeading('Lezioni', 'Tutte le lezioni, in ordine di data. Prenotati, presenti e assenti contano solo le prenotazioni confermate.')
  const lessonTable = lessonSheet.addTable('Lezioni', [
    { header: 'Data e ora', style: 'datetime', width: 17 },
    { header: 'Materia' },
    { header: 'Tutor' },
    { header: 'Durata (min)' },
    { header: 'Stato' },
    { header: 'Posti' },
    { header: 'Prenotati' },
    { header: 'Presenti' },
    { header: 'Assenti' },
    { header: 'Conteggiata per il tutor' },
    { header: 'Creata in automatico' }
  ], data.lessons.map((lesson) => {
    const lessonBookings = bookingsByLesson.get(lesson.id) ?? []
    return [
      lesson.startAt,
      subjectName.get(lesson.subjectId) ?? '',
      fullName(people.get(lesson.tutorId)),
      lesson.durationMinutes,
      LESSON_STATUS[lesson.status] ?? lesson.status,
      lesson.seats,
      lessonBookings.length,
      lessonBookings.filter(booking => booking.presence === true).length,
      lessonBookings.filter(booking => booking.presence === false).length,
      yesNo(lesson.countsForTutor),
      yesNo(lesson.generatedByJob)
    ]
  }))
  lessonSheet.freezeAbove(lessonTable.firstRow)

  // ---- Prenotazioni ----------------------------------------------------------------------
  const bookingSheet = workbook.addSheet('Prenotazioni')
  bookingSheet.addHeading('Prenotazioni', 'Tutte le prenotazioni, comprese quelle annullate, con l\'argomento scritto dallo studente.')
  const sortedBookings = [...data.bookings].sort((a, b) =>
    (lessonById.get(a.lessonId)?.startAt.getTime() ?? 0) - (lessonById.get(b.lessonId)?.startAt.getTime() ?? 0))
  const bookingTable = bookingSheet.addTable('Prenotazioni', [
    { header: 'Data lezione', style: 'datetime', width: 17 },
    { header: 'Materia' },
    { header: 'Tutor' },
    { header: 'Studente' },
    { header: 'Anno' },
    { header: 'Sezione' },
    { header: 'Argomento', width: 40 },
    { header: 'Stato' },
    { header: 'Presenza' },
    { header: 'Conteggiata per lo studente' },
    { header: 'Prenotata il', style: 'datetime', width: 17 },
    { header: 'Annullata il', style: 'datetime', width: 17 }
  ], sortedBookings.map((booking) => {
    const lesson = lessonById.get(booking.lessonId)
    const student = people.get(booking.studentId)
    return [
      lesson?.startAt ?? null,
      lesson ? subjectName.get(lesson.subjectId) ?? '' : '',
      lesson ? fullName(people.get(lesson.tutorId)) : '',
      fullName(student),
      student?.year ?? null,
      student?.section ?? null,
      booking.topic,
      BOOKING_STATUS[booking.status] ?? booking.status,
      booking.status === 'confirmed' ? presenceLabel(booking.presence) : '',
      yesNo(booking.countsForStudent),
      booking.createdAt,
      booking.canceledAt
    ]
  }))
  bookingSheet.freezeAbove(bookingTable.firstRow)

  // ---- Feedback --------------------------------------------------------------------------
  const feedbackSheet = workbook.addSheet('Feedback')
  feedbackSheet.addHeading('Feedback', 'Voti da 1 a 5 lasciati dopo le lezioni, nei due sensi, con il commento quando c\'è.')
  const feedbackTable = feedbackSheet.addTable('Feedback', [
    { header: 'Data', style: 'date' },
    { header: 'Lezione del', style: 'date' },
    { header: 'Materia' },
    { header: 'Da' },
    { header: 'Ruolo' },
    { header: 'A' },
    { header: 'Voto' },
    { header: 'Commento', width: 60, style: 'wrap' }
  ], data.feedback.map((item) => {
    const lesson = lessonById.get(item.lessonId)
    return [
      item.createdAt,
      lesson?.startAt ?? null,
      lesson ? subjectName.get(lesson.subjectId) ?? '' : '',
      fullName(people.get(item.authorUserId)),
      ROLE_LABEL[item.authorRole] ?? item.authorRole,
      fullName(people.get(item.targetUserId)),
      item.rating,
      item.text
    ]
  }))
  feedbackSheet.freezeAbove(feedbackTable.firstRow)

  // ---- Materie ---------------------------------------------------------------------------
  const tutorsPerSubject = countBy(data.tutorSubjects, row => row.subjectId)
  const requestsPerSubject = countBy(data.subjectRequests, row => row.subjectId)
  const lessonsBySubject = groupBy(data.lessons, lesson => lesson.subjectId)
  const subjectRows = data.subjects.map((subject) => {
    const subjectLessons = lessonsBySubject.get(subject.id) ?? []
    const subjectBookings = subjectLessons.flatMap(lesson => bookingsByLesson.get(lesson.id) ?? [])
    const lessonIds = new Set(subjectLessons.map(lesson => lesson.id))
    return [
      subject.name,
      tutorsPerSubject.get(subject.id) ?? 0,
      subjectLessons.length,
      subjectLessons.filter(lesson => lesson.status === 'completed').length,
      subjectBookings.length,
      subjectBookings.filter(booking => booking.presence === true).length,
      average(data.feedback.filter(item => lessonIds.has(item.lessonId) && item.authorRole === 'student').map(item => item.rating)),
      requestsPerSubject.get(subject.id) ?? 0
    ] as CellValue[]
  }).sort((a, b) => (b[4] as number) - (a[4] as number) || String(a[0]).localeCompare(String(b[0]), 'it'))
  const subjectSheet = workbook.addSheet('Materie')
  subjectSheet.addHeading('Materie', 'In ordine di prenotazioni. "Richieste" sono gli studenti che hanno chiesto una materia senza tutor.')
  const subjectTable = subjectSheet.addTable('Materie', [
    { header: 'Materia' },
    { header: 'Tutor' },
    { header: 'Lezioni' },
    { header: 'Completate' },
    { header: 'Prenotazioni' },
    { header: 'Presenze' },
    { header: 'Voto medio dagli studenti', ...DECIMAL },
    { header: 'Richieste' }
  ], subjectRows)
  subjectSheet.freezeAbove(subjectTable.firstRow)
  if (subjectRows.length > 0) {
    const top = Math.min(10, subjectRows.length)
    subjectSheet.addChart({
      type: 'bar',
      title: 'Le materie più prenotate',
      categories: { ...subjectTable.column(0), lastRow: subjectTable.firstRow + top - 1 },
      series: [{ name: 'Prenotazioni', values: { ...subjectTable.column(4), lastRow: subjectTable.firstRow + top - 1 } }],
      at: { col: 9, row: subjectTable.headerRow },
      size: { cols: 7, rows: 18 }
    })
  }

  addUsageSheet(workbook.addSheet('Utilizzo'), data, now)

  return workbook.toBuffer()
}

function addUsageSheet(sheet: Sheet, data: ReportData, now: Date) {
  sheet.addHeading('Utilizzo del sito', 'Conteggi giornalieri anonimi: nessun nome, email, IP o identificativo. Conservati 13 mesi.')
  if (data.analytics.length === 0) {
    sheet.addRow([{ value: 'Nessuna statistica d\'uso registrata.', style: 'note' }])
    return
  }
  const rows = data.analytics
  const total = (event: string) => groupBy(rows.filter(row => row.event === event), row => row.detail)

  // Average daily active users in each month, per role.
  const roles = ['student', 'tutor', 'admin', 'activator']
  const activeRows = rows.filter(row => row.event === 'active_users')
  const activeMonths = monthRange(activeRows.map(row => monthKey(row.day)), now)
  sheet.addRow([{ value: 'Utenti attivi al giorno, media del mese', style: 'section' }])
  const activeTable = sheet.addTable('Attivi', [
    { header: 'Mese' },
    { header: 'Studenti', ...DECIMAL },
    { header: 'Tutor', ...DECIMAL },
    { header: 'Admin', ...DECIMAL },
    { header: 'Attivatori', ...DECIMAL }
  ], activeMonths.map((month) => {
    const monthRows = activeRows.filter(row => monthKey(row.day) === month)
    const days = new Set(monthRows.map(row => row.day)).size
    return [monthLabel(month), ...roles.map(role => days > 0 ? Math.round(monthRows.filter(row => row.role === role).reduce((sum, row) => sum + row.count, 0) / days * 10) / 10 : null)]
  }))
  sheet.addChart({
    type: 'line',
    title: 'Utenti attivi al giorno (media del mese)',
    categories: activeTable.column(0),
    series: [{ name: 'Studenti', values: activeTable.column(1) }, { name: 'Tutor', values: activeTable.column(2) }],
    at: { col: 6, row: activeTable.headerRow },
    size: { cols: 8, rows: 16 }
  })
  sheet.skip(Math.max(1, 17 - (activeTable.lastRow - activeTable.headerRow)))

  sheet.addRow([{ value: 'Esito dei tentativi di prenotazione', style: 'section' }])
  const outcomes = [...total('booking').entries()].map(([detail, list]) => [BOOKING_OUTCOME[detail] ?? detail, list.reduce((sum, row) => sum + row.count, 0)] as [string, number]).sort((a, b) => b[1] - a[1])
  const outcomeTable = sheet.addTable('Esiti', [{ header: 'Esito' }, { header: 'Tentativi' }], outcomes)
  if (outcomes.length > 0) {
    sheet.addChart({
      type: 'bar',
      title: 'Esito delle prenotazioni',
      categories: outcomeTable.column(0),
      series: [{ name: 'Tentativi', values: outcomeTable.column(1) }],
      at: { col: 6, row: outcomeTable.headerRow },
      size: { cols: 8, rows: 14 }
    })
  }
  sheet.skip(Math.max(1, 15 - (outcomeTable.lastRow - outcomeTable.headerRow)))

  sheet.addRow([{ value: 'Notifiche push per tipo', style: 'section' }])
  const sent = total('push_sent')
  const opened = total('push_open')
  const categories = [...new Set([...sent.keys(), ...opened.keys()])]
  const sum = (list: typeof rows | undefined) => (list ?? []).reduce((acc, row) => acc + row.count, 0)
  const pushRows = categories.map(category => [CATEGORY_LABEL[category] ?? category, sum(sent.get(category)), sum(opened.get(category)), ratio(sum(opened.get(category)), sum(sent.get(category)))] as CellValue[])
    .sort((a, b) => (b[1] as number) - (a[1] as number))
  const pushTable = sheet.addTable('Push', [{ header: 'Tipo' }, { header: 'Inviate' }, { header: 'Aperte' }, { header: 'Apertura (%)', ...PERCENT }], pushRows)
  if (pushRows.length > 0) {
    sheet.addChart({
      type: 'column',
      title: 'Notifiche inviate e aperte',
      categories: pushTable.column(0),
      series: [{ name: 'Inviate', values: pushTable.column(1) }, { name: 'Aperte', values: pushTable.column(2) }],
      at: { col: 6, row: pushTable.headerRow },
      size: { cols: 8, rows: 16 }
    })
  }
  sheet.skip(Math.max(1, 17 - (pushTable.lastRow - pushTable.headerRow)))

  sheet.addRow([{ value: 'Pagine più viste', style: 'section' }])
  const pages = [...total('page_view').entries()].map(([detail, list]) => [detail === 'other' ? 'Altre pagine' : detail, sum(list)] as [string, number]).sort((a, b) => b[1] - a[1])
  sheet.addTable('Pagine', [{ header: 'Pagina' }, { header: 'Visite' }], pages)
  sheet.skip()

  sheet.addRow([{ value: 'Campanella e errori', style: 'section' }])
  sheet.addTable('Altro', [{ header: 'Cosa' }, { header: 'Quante volte' }], [
    ['Pannello delle notifiche aperto', sum(rows.filter(row => row.event === 'bell_open'))],
    ['Notifiche toccate nel pannello', sum(rows.filter(row => row.event === 'inbox_click'))],
    ['Errori nel browser', sum(rows.filter(row => row.event === 'client_error'))]
  ])
}
