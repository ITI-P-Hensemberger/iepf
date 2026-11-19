// School time: lessons happen in Rome, so every instant is shown and every day is counted on
// Rome's clock, whatever time zone the browser (or the server rendering the page) runs in.
//
// Two kinds of dates meet in the pages:
// - instants (a lesson's start, a timestamp): format them with schoolFormat, take their day
//   with schoolDayKey;
// - calendar days (what a date picker hands back, a local midnight): turn them into a
//   'YYYY-MM-DD' key with calendarKeyOf, and the key into an instant with schoolTime.

export const SCHOOL_TIME_ZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Rome'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHOOL_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric'
})

function wallClock(date: Date) {
  const parts: Record<string, number> = {}
  for (const part of partsFormat.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second }
}

// How far Rome's clock is ahead of UTC at that instant, in milliseconds.
function offsetAt(instant: number) {
  const clock = wallClock(new Date(instant))
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

// An Intl formatter on Rome's clock.
export function schoolFormat(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('it-IT', { ...options, timeZone: SCHOOL_TIME_ZONE })
}

// The Rome day an instant falls on.
export function schoolDayKey(date: Date) {
  const clock = wallClock(date)
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`
}

export function schoolHour(date: Date) {
  return wallClock(date).hour
}

// 0 = Sunday … 6 = Saturday, like Date.getDay, on Rome's clock.
export function schoolWeekday(date: Date) {
  const { year, month, day } = wallClock(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// The instant Rome's clock reads hour:minute on that day.
export function schoolTime(key: string, hour = 0, minute = 0) {
  const [year, month, day] = key.split('-').map(Number)
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  // Correct twice so a guess on the far side of a DST change still lands on the right offset.
  let instant = naive - offsetAt(naive)
  instant = naive - offsetAt(instant)
  return new Date(instant)
}

// The day a date picker shows, read on the browser's own calendar.
export function calendarKeyOf(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// A key as the local midnight date pickers and calendars work with.
export function calendarDateOf(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Today in Rome, as a date picker's day.
export function schoolToday(now = new Date()) {
  return calendarDateOf(schoolDayKey(now))
}

// A picked day as the instants an API range filter expects: from its first to its last moment
// in Rome.
export function startOfSchoolDayIso(date: Date) {
  return schoolTime(calendarKeyOf(date)).toISOString()
}

export function endOfSchoolDayIso(date: Date) {
  const [year, month, day] = calendarKeyOf(date).split('-').map(Number)
  const next = calendarKeyOf(new Date(year, month - 1, day + 1))
  return new Date(schoolTime(next).getTime() - 1).toISOString()
}

// A filter instant from the URL back as the picker's day.
export function parseDayParam(value: string | null) {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : calendarDateOf(schoolDayKey(parsed))
}

// A picked day and a 'HH:MM' time as the instant of a lesson.
export function combineDayAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return schoolTime(calendarKeyOf(date), hours || 0, minutes || 0)
}
