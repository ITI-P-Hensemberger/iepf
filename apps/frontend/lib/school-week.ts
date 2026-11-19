// School weeks: Monday to Friday, days named by their 'YYYY-MM-DD' key on Rome's calendar.
import { calendarDateOf, calendarKeyOf, schoolDayKey, schoolHour, schoolTime, schoolWeekday } from '@/lib/school-time'

// The Rome day an instant falls on.
export const dayKeyOf = schoolDayKey

// A key as a local midnight date: for calendars, and for its weekday.
export const dateOfKey = calendarDateOf

export function addDaysToKey(key: string, days: number) {
  const date = dateOfKey(key)
  date.setDate(date.getDate() + days)
  return calendarKeyOf(date)
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
  const weekday = schoolWeekday(now)
  if (weekday === 0 || weekday >= 5) return false
  return weekday < 4 || schoolHour(now) < 20
}

// The whole day, as the instants an API range filter expects.
export function dayRange(key: string) {
  const to = new Date(schoolTime(addDaysToKey(key, 1)).getTime() - 1)
  return { from: schoolTime(key).toISOString(), to: to.toISOString() }
}

export function weekRange(mondayKey: string) {
  return { from: dayRange(mondayKey).from, to: dayRange(addDaysToKey(mondayKey, 4)).to }
}

// The week a tutor is working on: this one until Saturday noon, when the next week's lessons are
// assigned; from then on, and on Sunday, the next one.
export function currentLessonMonday(now: Date) {
  const monday = mondayOf(dayKeyOf(now))
  const weekday = schoolWeekday(now)
  const nextWeekOut = weekday === 0 || (weekday === 6 && schoolHour(now) >= 12)
  return nextWeekOut ? addDaysToKey(monday, 7) : monday
}
