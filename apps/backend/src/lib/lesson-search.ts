// Purpose: The free-text search of the lesson lists: dates as people type them, people by name,
// email or class, subjects and booking topics.
import type { AnyColumn, SQL } from 'drizzle-orm'

import { sql } from 'drizzle-orm'

import { SCHOOL_TIME_ZONE } from '@/lib/school-time'

// The text as an ILIKE pattern that matches it anywhere, with % and _ taken literally.
export function likePattern(q: string) {
  return `%${q.trim().replace(/[\\%_]/g, match => `\\${match}`)}%`
}

// A day as the school writes it: "13/11", "13/11/26", "13/11/2026" or "3/11/2026".
export function dateMatches(column: AnyColumn | SQL, pattern: string): SQL {
  const local = sql`(${column} at time zone ${SCHOOL_TIME_ZONE})`
  return sql`(
    to_char(${local}, 'DD/MM/YYYY') ilike ${pattern}
    or to_char(${local}, 'DD/MM/YY') ilike ${pattern}
    or to_char(${local}, 'FMDD/FMMM/YYYY') ilike ${pattern}
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
