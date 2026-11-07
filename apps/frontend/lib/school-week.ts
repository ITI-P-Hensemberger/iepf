// School weeks seen from the browser: Monday to Friday, days named by their 'YYYY-MM-DD' key.

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function dayKeyOf(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function dateOfKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDaysToKey(key: string, days: number) {
  const date = dateOfKey(key)
  date.setDate(date.getDate() + days)
  return dayKeyOf(date)
}

// The Monday of the week a day belongs to.
export function mondayOf(key: string) {
  const weekday = dateOfKey(key).getDay()
  return addDaysToKey(key, -((weekday + 6) % 7))
}

export function schoolDays(mondayKey: string) {
  return [0, 1, 2, 3, 4].map((offset) => addDaysToKey(mondayKey, offset))
}

// Bookings close at 20:00 the day before, so after Thursday 20:00 nothing is left to book
// in this week: only next week's lessons remain.
export function thisWeekBookable(now: Date) {
  const weekday = now.getDay()
  if (weekday === 0 || weekday >= 5) return false
  return weekday < 4 || now.getHours() < 20
}

// The whole day, as the instants an API range filter expects.
export function dayRange(key: string) {
  const from = dateOfKey(key)
  const to = dateOfKey(key)
  to.setHours(23, 59, 59, 999)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function weekRange(mondayKey: string) {
  return { from: dayRange(mondayKey).from, to: dayRange(addDaysToKey(mondayKey, 4)).to }
}

// The week a tutor is working on: this one until Saturday noon, when the next week's lessons are
// assigned; from then on, and on Sunday, the next one.
export function currentLessonMonday(now: Date) {
  const monday = mondayOf(dayKeyOf(now))
  const weekday = now.getDay()
  const nextWeekOut = weekday === 0 || (weekday === 6 && now.getHours() >= 12)
  return nextWeekOut ? addDaysToKey(monday, 7) : monday
}
