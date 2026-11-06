// CSV exports of the stats page and the paged-list helper they share with the tables.

type CsvValue = string | number | boolean | null | undefined

type PagedPayloadObject<T> = {
  items?: T[]
  total?: number
  data?: PagedPayloadObject<T> | T[]
  rows?: T[]
  results?: T[]
}

// The backend lists come in a few shapes: an array, or { data | items | rows | results, total }.
export function normalizePaged<T>(payload: unknown): { items: T[], total: number } {
  if (Array.isArray(payload)) {
    return { items: payload as T[], total: payload.length }
  }
  if (!payload || typeof payload !== 'object') {
    return { items: [], total: 0 }
  }
  const candidate = payload as PagedPayloadObject<T>
  const nested = candidate.data && !Array.isArray(candidate.data) ? candidate.data : undefined
  const items = [candidate.items, candidate.rows, candidate.results, candidate.data, nested?.items, nested?.rows, nested?.results]
    .find((value): value is T[] => Array.isArray(value)) ?? []
  const total = typeof candidate.total === 'number'
    ? candidate.total
    : typeof nested?.total === 'number' ? nested.total : items.length
  return { items, total }
}

function escapeCsvValue(value: CsvValue) {
  return `"${(value == null ? '' : String(value)).replaceAll('"', '""')}"`
}

// One quoted header line with the keys, then one line per row in the same order.
export function toCsv<K extends string>(headers: readonly K[], rows: ReadonlyArray<Partial<Record<K, CsvValue>>>) {
  return [
    headers.map(escapeCsvValue).join(','),
    ...rows.map(row => headers.map(key => escapeCsvValue(row[key])).join(','))
  ].join('\n')
}

export const STUDENT_CSV_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'sectionName',
  'year',
  'isActive',
  'lessonTokens',
  'lessonsPresentCounted',
  'lessonsPresentNotCounted',
  'lessonsAbsentCounted',
  'lessonsAbsentNotCounted',
  'lessonsWithoutPresenceCounted',
  'lessonsWithoutPresenceNotCounted'
] as const

export const TUTOR_CSV_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'sectionName',
  'year',
  'isActive',
  'lessonsScheduledCounted',
  'lessonsScheduledNotCounted',
  'lessonsConfirmedCounted',
  'lessonsConfirmedNotCounted',
  'lessonsCancelledCounted',
  'lessonsCancelledNotCounted',
  'lessonsCompletedCounted',
  'lessonsCompletedNotCounted'
] as const

export const FEEDBACK_CSV_HEADERS = [
  'id',
  'lessonId',
  'bookingId',
  'authorRole',
  'authorName',
  'authorEmail',
  'targetName',
  'targetEmail',
  'rating',
  'text',
  'createdAt',
  'updatedAt'
] as const

export function csvFilename(kind: string, now = new Date()) {
  const timestamp = now.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, '')
  return `iepf-${kind}-${timestamp}.csv`
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const EXPORT_PAGE_SIZE = 200

// Reads every page of a list endpoint, for the exports.
export async function fetchAllPages<T>(buildUrl: (offset: number, limit: number) => string, errorMessage: string) {
  const all: T[] = []
  for (;;) {
    const response = await fetch(buildUrl(all.length, EXPORT_PAGE_SIZE))
    if (!response.ok) {
      throw new Error(errorMessage)
    }
    const { items, total } = normalizePaged<T>(await response.json())
    all.push(...items)
    if (items.length === 0 || all.length >= total) {
      return all
    }
  }
}
