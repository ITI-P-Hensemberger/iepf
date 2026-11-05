// Purpose: Which school years may register in each role, and who may teach whom.

export const STUDENT_YEARS = { min: 1, max: 4 } as const
export const TUTOR_YEARS = { min: 3, max: 5 } as const

interface YearRange {
  min: number
  max: number
}

export function isYearInRange(year: number, range: YearRange) {
  return year >= range.min && year <= range.max
}

export function yearRangeMessage(range: YearRange) {
  return `L'anno deve essere compreso tra ${range.min} e ${range.max}`
}

// A student with no recorded year predates mandatory years: they keep seeing every lesson.
export function tutorCanTeachStudent(tutorYear: number, studentYear: number | null) {
  return studentYear === null || tutorYear > studentYear
}
