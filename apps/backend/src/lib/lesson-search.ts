// Purpose: The free-text search of the lesson lists: dates as people type them, people by name,
// email or class, subjects and booking topics.
import type { AnyColumn, SQL } from 'drizzle-orm'

import { sql } from 'drizzle-orm'

import { SCHOOL_TIME_ZONE } from '@/lib/school-time'

// The text as an ILIKE pattern that matches it anywhere, with % and _ taken literally.
export function likePattern(q: string) {
  return `%${q.trim().replace(/[\\%_]/g, match => `\\${match}`)}%`
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

function monthOf(word: string) {
  const name = word.toLowerCase().replace(/\.$/, '')
  if (name.length < 3)
    return null
  const index = MONTHS.findIndex(month => month.startsWith(name))
  return index < 0 ? null : index + 1
}

function fullYear(value: string) {
  return value.length === 2 ? `20${value}` : value
}

const pad = (value: number | string) => String(value).padStart(2, '0')

// A date typed in any of the usual ways, as the pattern of a 'DD/MM/YYYY' text: "13/11",
// "13-11-26", "13.11.2026", "13 novembre", "13 nov 2026", "novembre", "nov 2026". Null when the
// text is not a date.
export function normalizeDateQuery(q: string): string | null {
  const text = q.trim().toLowerCase().replace(/\s+/g, ' ')
  const numeric = text.match(/^(\d{1,2})[/\-. ](\d{1,2})(?:[/\-. ](\d{2}|\d{4}))?$/)
  if (numeric) {
    const [, day, month, year] = numeric
    if (Number(day) < 1 || Number(day) > 31 || Number(month) < 1 || Number(month) > 12)
      return null
    return `${pad(day)}/${pad(month)}${year ? `/${fullYear(year)}` : '/'}`
  }
  const named = text.match(/^(\d{1,2}) ([a-zàèéìòù.]+)(?: (\d{2}|\d{4}))?$/)
  if (named) {
    const month = monthOf(named[2])
    if (!month || Number(named[1]) < 1 || Number(named[1]) > 31)
      return null
    return `${pad(named[1])}/${pad(month)}${named[3] ? `/${fullYear(named[3])}` : '/'}`
  }
  const monthOnly = text.match(/^([a-zàèéìòù.]+)(?: (\d{4}))?$/)
  if (monthOnly) {
    const month = monthOf(monthOnly[1])
    if (!month)
      return null
    return `/${pad(month)}/${monthOnly[2] ?? ''}`
  }
  return null
}

// A day as people write it: "13/11", "13/11/26", "3/11/2026", "13-11", "13 novembre", "13 nov".
// q is the text as typed, pattern the same text as an ILIKE pattern.
export function dateMatches(column: AnyColumn | SQL, q: string, pattern = likePattern(q)): SQL {
  const local = sql`(${column} at time zone ${SCHOOL_TIME_ZONE})`
  const normalized = normalizeDateQuery(q)
  return sql`(
    to_char(${local}, 'DD/MM/YYYY') ilike ${pattern}
    or to_char(${local}, 'DD/MM/YY') ilike ${pattern}
    or to_char(${local}, 'FMDD/FMMM/YYYY') ilike ${pattern}
    ${normalized ? sql`or (to_char(${local}, 'DD/MM/YYYY') || '/') like ${`%${normalized}%`}` : sql``}
  )`
}

// A user by first and last name (in either order), email or, for a student, class ("4DEV").
export function personMatches(userId: AnyColumn | SQL, pattern: string): SQL {
  return sql`exists (
    select 1 from users u
    left join student_profiles sp on sp.user_id = u.id
    left join class_sections cs on cs.id = sp.section_id
    where u.id = ${userId} and (
      u.first_name ilike ${pattern}
      or u.last_name ilike ${pattern}
      or (u.first_name || ' ' || u.last_name) ilike ${pattern}
      or (u.last_name || ' ' || u.first_name) ilike ${pattern}
      or u.email ilike ${pattern}
      or (coalesce(sp.year::text, '') || coalesce(replace(cs.name, ' ', ''), '')) ilike ${pattern}
    )
  )`
}

// A subject by name.
export function subjectMatches(subjectId: AnyColumn | SQL, pattern: string): SQL {
  return sql`exists (select 1 from subjects s where s.id = ${subjectId} and (s.name ilike ${pattern} or s.canonical_name ilike ${pattern}))`
}

// A lesson with a booking whose student, topic or subject matches.
export function bookingMatches(lessonId: AnyColumn | SQL, pattern: string): SQL {
  return sql`exists (
    select 1 from lesson_bookings b
    where b.lesson_id = ${lessonId} and (
      b.topic ilike ${pattern}
      or ${personMatches(sql`b.student_id`, pattern)}
      or ${subjectMatches(sql`b.subject_id`, pattern)}
    )
  )`
}
