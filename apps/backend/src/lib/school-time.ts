// Purpose: Calendar days and wall-clock times in the school's time zone, whatever TZ the process runs in.
// Day keys are 'YYYY-MM-DD' strings for a day in Europe/Rome.

export const SCHOOL_TIME_ZONE = 'Europe/Rome'

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHOOL_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})

function wallClock(date: Date) {
  const parts: Record<string, number> = {}
  for (const part of partsFormat.formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value)
    }
  }
  return parts as { year: number, month: number, day: number, hour: number, minute: number, second: number }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function parseKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return { year, month, day }
}

// How far the school's wall clock is ahead of UTC at this instant, in milliseconds.
function offsetAt(instant: number) {
  const clock = wallClock(new Date(instant))
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

export function schoolDayKey(date: Date): string {
  const clock = wallClock(date)
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`
}

export function addDays(key: string, days: number): string {
  const { year, month, day } = parseKey(key)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// 1 = Monday … 7 = Sunday.
export function weekdayOf(key: string): number {
  const { year, month, day } = parseKey(key)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0
    ? 7
    : weekday
}

// The instant the school's clock reads hour:minute on that day.
export function schoolTime(key: string, hour = 0, minute = 0): Date {
  const { year, month, day } = parseKey(key)
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  // Correct twice so a guess on the far side of a DST change still lands on the right offset.
  let instant = naive - offsetAt(naive)
  instant = naive - offsetAt(instant)
  return new Date(instant)
}

// [start, end) of the school day the instant falls on.
export function schoolDayRange(date: Date): { start: Date, end: Date } {
  const key = schoolDayKey(date)
  return {
    start: schoolTime(key),
    end: schoolTime(addDays(key, 1))
  }
}

export function isSameSchoolDay(a: Date, b: Date) {
  return schoolDayKey(a) === schoolDayKey(b)
}

// Students book until 20:00 of the day before the lesson.
export function bookingCutoff(lessonStartAt: Date): Date {
  return schoolTime(addDays(schoolDayKey(lessonStartAt), -1), 20)
}
