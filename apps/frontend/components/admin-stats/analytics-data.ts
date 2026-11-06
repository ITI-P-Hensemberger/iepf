// Shapes the backend's daily usage counts for the charts of the stats page.

export type AnalyticsPayload = {
  from: string
  to: string
  days: number
  daily: Array<{ day: string, event: string, role: string, count: number }>
  byDetail: Array<{ event: string, detail: string, count: number }>
  byGroup: Array<{ event: string, role: string, year: number, count: number }>
}

export const ROLES = ['student', 'tutor', 'admin', 'activator'] as const
export type Role = typeof ROLES[number]

export const ROLE_LABELS: Record<Role, string> = {
  student: 'Studenti',
  tutor: 'Tutor',
  admin: 'Admin',
  activator: 'Attivatori'
}

// Fixed per role, so a role keeps its colour whichever roles have data.
export const ROLE_COLORS: Record<Role, string> = {
  student: 'var(--viz-1)',
  tutor: 'var(--viz-2)',
  admin: 'var(--viz-3)',
  activator: 'var(--viz-4)'
}

export const CATEGORY_LABELS: Record<string, string> = {
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

export const BOOKING_LABELS: Record<string, string> = {
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
  lesson_full: 'Posti esauriti',
  subject_invalid: 'Materia non valida',
  subject_taken: 'Materia già scelta'
}

export function pageLabel(template: string) {
  return template === 'other' ? 'Altre pagine' : template
}

// Every day from `from` to `to`, both included (YYYY-MM-DD).
export function daysBetween(from: string, to: string) {
  const days: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= end; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10))
  }
  return days
}

export type DailyPoint = { day: string } & Partial<Record<Role, number>>

// One point per day with a value per role; days without rows count as 0.
export function dailyByRole(payload: AnalyticsPayload, event: string, options: { onlyCountedDays?: boolean } = {}) {
  const byDay = new Map<string, DailyPoint>(daysBetween(payload.from, payload.to).map(day => [day, { day }]))
  const roles = new Set<Role>()
  for (const row of payload.daily) {
    if (row.event !== event || !(ROLES as readonly string[]).includes(row.role)) continue
    const point = byDay.get(row.day)
    if (!point) continue
    const role = row.role as Role
    point[role] = (point[role] ?? 0) + row.count
    roles.add(role)
  }
  const present = ROLES.filter(role => roles.has(role))
  let points = [...byDay.values()]
  if (options.onlyCountedDays) {
    // Days before counting began, and today (counted tonight), are unknown, not zero.
    const counted = points.map(point => present.some(role => point[role] !== undefined))
    const first = counted.indexOf(true)
    const last = counted.lastIndexOf(true)
    points = first === -1 ? [] : points.slice(first, last + 1)
  }
  return {
    points: points.map((point) => {
      const filled: DailyPoint = { day: point.day }
      for (const role of present) filled[role] = point[role] ?? 0
      return filled
    }),
    roles: present
  }
}

export function detailCounts(payload: AnalyticsPayload, event: string) {
  return payload.byDetail
    .filter(row => row.event === event)
    .sort((a, b) => b.count - a.count)
    .map(row => ({ detail: row.detail, count: row.count }))
}

export function eventTotal(payload: AnalyticsPayload, event: string) {
  return payload.byDetail.filter(row => row.event === event).reduce((sum, row) => sum + row.count, 0)
}

function count(payload: AnalyticsPayload, event: string, detail: string) {
  return payload.byDetail.find(row => row.event === event && row.detail === detail)?.count ?? 0
}

export function bookingFunnel(payload: AnalyticsPayload) {
  const views = count(payload, 'page_view', '/student/book')
  const opened = eventTotal(payload, 'book_dialog_open')
  const booked = count(payload, 'booking', 'ok')
  const attempts = eventTotal(payload, 'booking')
  return {
    steps: [
      { step: 'Pagina prenotazione', count: views },
      { step: 'Finestra aperta', count: opened },
      { step: 'Prenotazione riuscita', count: booked }
    ],
    attempts,
    booked,
    failures: detailCounts(payload, 'booking')
      .filter(row => row.detail !== 'ok')
      .map(row => ({ reason: BOOKING_LABELS[row.detail] ?? row.detail, count: row.count }))
  }
}

// Sent and opened per category, for the categories that have either.
export function pushByCategory(payload: AnalyticsPayload) {
  const sent = new Map(detailCounts(payload, 'push_sent').map(row => [row.detail, row.count]))
  const opened = new Map(detailCounts(payload, 'push_open').map(row => [row.detail, row.count]))
  const categories = [...new Set([...sent.keys(), ...opened.keys()])]
  return categories
    .map(category => ({
      category: CATEGORY_LABELS[category] ?? category,
      sent: sent.get(category) ?? 0,
      opened: opened.get(category) ?? 0
    }))
    .sort((a, b) => b.sent - a.sent || b.opened - a.opened)
}

// Active users are counted each night for the day before: today never has them yet.
function activeDays(payload: AnalyticsPayload) {
  return new Set(payload.daily.filter(row => row.event === 'active_users').map(row => row.day)).size
}

// Average daily active users per school year, for one role.
export function activeByYear(payload: AnalyticsPayload, role: 'student' | 'tutor') {
  const days = Math.max(1, activeDays(payload))
  return payload.byGroup
    .filter(row => row.event === 'active_users' && row.role === role && row.year > 0)
    .sort((a, b) => a.year - b.year)
    .map(row => ({ year: `${row.year}º anno`, average: Math.round((row.count / days) * 10) / 10 }))
}

export function averageDailyActive(payload: AnalyticsPayload) {
  const total = payload.daily.filter(row => row.event === 'active_users').reduce((sum, row) => sum + row.count, 0)
  const days = activeDays(payload)
  return days > 0 ? Math.round((total / days) * 10) / 10 : 0
}

export function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}
