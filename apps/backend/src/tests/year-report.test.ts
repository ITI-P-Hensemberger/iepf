// Purpose: The year report is a valid workbook (every part declared, tables and charts that
// point at real cells) and only a real admin can download it.
import { Buffer } from 'node:buffer'
import { inflateRawSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ReportData } from '@/lib/year-report-data'

import app from '@/app'
import { closeDb } from '@/db'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer } from '@/lib/mailer'
import { columnName, excelSerial } from '@/lib/xlsx/workbook'
import { zip } from '@/lib/xlsx/zip'
import { buildYearReport, schoolYearLabel } from '@/lib/year-report'
import { hasRecentReportExport } from '@/lib/year-report-export'

// Reads a ZIP back through its central directory.
function unzip(buffer: Buffer) {
  const files = new Map<string, string>()
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4B, 0x05, 0x06]))
  const count = buffer.readUInt16LE(end + 10)
  let pointer = buffer.readUInt32LE(end + 16)
  for (let i = 0; i < count; i += 1) {
    const size = buffer.readUInt32LE(pointer + 20)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const extraLength = buffer.readUInt16LE(pointer + 30)
    const commentLength = buffer.readUInt16LE(pointer + 32)
    const offset = buffer.readUInt32LE(pointer + 42)
    const name = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString('utf8')
    const dataStart = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28)
    files.set(name, inflateRawSync(buffer.subarray(dataStart, dataStart + size)).toString('utf8'))
    pointer += 46 + nameLength + extraLength + commentLength
  }
  return files
}

const day = (iso: string) => new Date(iso)

function sampleData(): ReportData {
  const person = (id: string, role: string, lastName: string, year: number | null) => ({
    id,
    role,
    firstName: 'Nome',
    lastName,
    email: `${id}@example.test`,
    section: 'A',
    year,
    isActive: true,
    emailVerified: true,
    createdAt: day('2025-09-10T08:00:00Z'),
    hasPush: role === 'student'
  })
  return {
    people: [person('s1', 'student', 'Rossi & <Bianchi>', 2), person('s2', 'student', 'Verdi', 1), person('t1', 'tutor', 'Neri', 4), person('a1', 'admin', 'Admin', null)],
    subjects: [{ id: 'm1', name: 'Matematica' }, { id: 'm2', name: 'Fisica' }],
    tutorSubjects: [{ tutorId: 't1', subjectId: 'm1' }],
    tutorCapacity: new Map([['t1', 2]]),
    lessons: [
      { id: 'l1', tutorId: 't1', subjectId: 'm1', startAt: day('2025-10-06T13:00:00Z'), durationMinutes: 60, seats: 2, status: 'confirmed', countsForTutor: true, generatedByJob: true },
      { id: 'l2', tutorId: 't1', subjectId: 'm1', startAt: day('2025-11-03T13:00:00Z'), durationMinutes: 60, seats: 2, status: 'canceled', countsForTutor: false, generatedByJob: true }
    ],
    bookings: [
      { id: 'b1', lessonId: 'l1', studentId: 's1', subjectId: 'm1', topic: 'Equazioni\u0007 di secondo grado', status: 'confirmed', countsForStudent: true, presence: true, createdAt: day('2025-10-01T10:00:00Z'), canceledAt: null },
      { id: 'b2', lessonId: 'l1', studentId: 's2', subjectId: 'm1', topic: 'Disequazioni', status: 'confirmed', countsForStudent: true, presence: false, createdAt: day('2025-10-02T10:00:00Z'), canceledAt: null }
    ],
    feedback: [{ id: 'f1', lessonId: 'l1', authorUserId: 's1', targetUserId: 't1', authorRole: 'student', rating: 5, text: 'Chiaro "e" utile', createdAt: day('2025-10-07T10:00:00Z') }],
    feedbackVersions: [
      { feedbackId: 'f1', lessonId: 'l1', authorUserId: 's1', targetUserId: 't1', authorRole: 'student', deletedAt: null, deletedByUserId: null, rating: 4, text: 'Chiaro', editorUserId: 's1', editorRole: 'student', createdAt: day('2025-10-07T10:00:00Z') },
      { feedbackId: 'f1', lessonId: 'l1', authorUserId: 's1', targetUserId: 't1', authorRole: 'student', deletedAt: null, deletedByUserId: null, rating: 5, text: 'Chiaro "e" utile', editorUserId: 'a1', editorRole: 'admin', createdAt: day('2025-10-08T10:00:00Z') },
      { feedbackId: 'f2', lessonId: 'l1', authorUserId: 't1', targetUserId: 's2', authorRole: 'tutor', deletedAt: day('2025-10-09T10:00:00Z'), deletedByUserId: 'a1', rating: 1, text: 'Testo tolto', editorUserId: 't1', editorRole: 'tutor', createdAt: day('2025-10-07T11:00:00Z') }
    ],
    tokenBalances: new Map([['s1', 9], ['s2', 10]]),
    subjectRequests: [{ studentId: 's2', subjectId: 'm2', createdAt: day('2025-10-05T10:00:00Z') }],
    analytics: [
      { day: '2025-10-06', event: 'active_users', detail: '', role: 'student', year: 2, count: 12 },
      { day: '2025-10-06', event: 'push_sent', detail: 'reminders', role: '', year: 0, count: 10 },
      { day: '2025-10-06', event: 'push_open', detail: 'reminders', role: 'student', year: 2, count: 4 },
      { day: '2025-10-06', event: 'bell_open', detail: '', role: 'student', year: 2, count: 3 }
    ],
    notifications: {
      keepDays: 90,
      inbox: [{ category: 'bookings', total: 3, read: 1 }],
      devices: [{ service: 'google', devices: 2, workingLast30Days: 1 }],
      optOuts: [{ category: 'reminders', users: 1 }]
    }
  }
}

describe('xlsx helpers', () => {
  it('names columns and converts dates to Rome wall-clock serials', () => {
    expect([0, 25, 26, 701].map(columnName)).toEqual(['A', 'Z', 'AA', 'ZZ'])
    // 1 January 2026 00:30 in Rome is still 31 December in UTC.
    expect(excelSerial(new Date('2025-12-31T23:30:00Z'))).toBeCloseTo(46023 + 0.5 / 24, 6)
  })

  it('writes a zip that reads back', () => {
    const files = unzip(zip([{ name: 'a.txt', data: 'ciao' }, { name: 'dir/è.xml', data: '<x/>' }]))
    expect(Object.fromEntries(files)).toEqual({ 'a.txt': 'ciao', 'dir/è.xml': '<x/>' })
  })
})

describe('buildYearReport', () => {
  const files = unzip(buildYearReport(sampleData(), new Date('2026-06-20T10:00:00Z')))
  const workbook = files.get('xl/workbook.xml')!
  const types = files.get('[Content_Types].xml')!

  it('names the school year from the date', () => {
    expect(schoolYearLabel(new Date('2026-06-20T10:00:00Z'))).toBe('2025/26')
    expect(schoolYearLabel(new Date('2026-09-01T10:00:00Z'))).toBe('2026/27')
  })

  it('has every sheet, and declares every part it contains', () => {
    const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1])
    expect(names).toEqual(['Riepilogo', 'Andamento', 'Classi', 'Studenti', 'Tutor', 'Lezioni', 'Prenotazioni', 'Feedback', 'Materie', 'Utilizzo', 'Notifiche'])
    for (const name of files.keys()) {
      if (name.endsWith('.rels') || name === '[Content_Types].xml')
        continue
      expect(types, name).toContain(`PartName="/${name}"`)
    }
  })

  it('escapes text and drops characters XML does not allow', () => {
    const students = files.get('xl/worksheets/sheet4.xml')!
    expect(students).toContain('Rossi &amp; &lt;Bianchi&gt;')
    const bookings = files.get('xl/worksheets/sheet7.xml')!
    expect(bookings).toContain('Equazioni di secondo grado')
    expect(bookings).not.toContain('\u0007')
  })

  it('lists the history of edited and deleted feedback under the feedback list', () => {
    const sheet = files.get('xl/worksheets/sheet8.xml')!
    for (const text of ['Cronologia delle modifiche', 'Modifiche', '1 di 2', '2 di 2', 'Attuale', 'Precedente', 'Eliminato da Admin Nome', 'Testo tolto']) {
      expect(sheet).toContain(text)
    }
  })

  it('has a notifications sheet with coverage, push, panel and devices', () => {
    const sheet = files.get('xl/worksheets/sheet11.xml')!
    for (const text of ['Chi riceve le notifiche push', 'Promemoria', 'Prenotazioni', 'Google (Chrome, Android)', 'Pannello aperto']) {
      expect(sheet).toContain(text)
    }
  })

  it('gives each table headers that match its first row', () => {
    const tables = [...files.keys()].filter(name => name.startsWith('xl/tables/'))
    expect(tables.length).toBeGreaterThanOrEqual(9)
    for (const name of tables) {
      const xml = files.get(name)!
      const headerRowNumber = /ref="[A-Z]+(\d+):/.exec(xml)![1]
      const columns = [...xml.matchAll(/<tableColumn id="\d+" name="([^"]+)"/g)].map(match => match[1])
      expect(columns.length, name).toBe(new Set(columns).size)
      // The sheet holding the table has those headers in the table's first row.
      const sheetRels = [...files.entries()].find(([file, content]) => file.includes('worksheets/_rels') && content.includes(name.replace('xl/', '../')))!
      const sheet = files.get(sheetRels[0].replace('_rels/', '').replace('.rels', ''))!
      const headerRow = new RegExp(`<row r="${headerRowNumber}"[^>]*>(.*?)</row>`).exec(sheet)![1]
      for (const column of columns) expect(headerRow, name).toContain(`<t xml:space="preserve">${column}</t>`)
    }
  })

  it('draws native charts that point at existing sheets', () => {
    const charts = [...files.keys()].filter(name => name.startsWith('xl/charts/'))
    // Twelve in a full report; the sample has no booking outcomes, so that chart is left out.
    expect(charts).toHaveLength(11)
    for (const name of charts) {
      const refs = [...files.get(name)!.matchAll(/<c:f>'([^']+)'!/g)].map(match => match[1])
      expect(refs.length, name).toBeGreaterThan(0)
      for (const sheet of refs) expect(workbook, name).toContain(`name="${sheet}"`)
    }
  })
})

describe('downloading the year report', () => {
  const tokens: Record<string, string> = {}
  let ids: Record<string, string>

  beforeAll(async () => {
    assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
    await cleanDatabase()
    ids = await seedDevelopmentData()
    for (const role of ['admin', 'student']) {
      const response = await app.request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${role}@example.test`, password: DEV_PASSWORD }) })
      tokens[role] = (await response.json()).accessToken
    }
  })

  afterAll(async () => {
    closeMailer()
    await closeDb()
  })

  const get = (token: string) => app.request('/admin/stats/report', { headers: { Authorization: `Bearer ${token}` } })

  it('is refused to non-admins and to an impersonated session', async () => {
    expect((await get(tokens.student)).status).toBe(403)
    const impersonation = await app.request('/admin/impersonate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.admin}` }, body: JSON.stringify({ userId: ids.student }) })
    const { token } = await impersonation.json()
    expect((await get(token)).status).toBe(403)
    expect(await hasRecentReportExport(ids.admin)).toBe(false)
  })

  it('gives the overview counts behind the stats page', async () => {
    expect((await app.request('/admin/stats/overview', { headers: { Authorization: `Bearer ${tokens.student}` } })).status).toBe(403)
    const response = await app.request('/admin/stats/overview', { headers: { Authorization: `Bearer ${tokens.admin}` } })
    expect(response.status).toBe(200)
    const body = await response.json()
    // The demo seed has one lesson with a booking and one without, tomorrow and the day after:
    // only the booked one counts, the empty slot is availability.
    expect(body.lessonsByState).toEqual({ done: 0, upcoming: 1, canceled: 0 })
    expect(body.attendance).toEqual({ present: 0, absent: 0, unrecorded: 1 })
    expect(body.months.reduce((sum: number, row: { lessons: number }) => sum + row.lessons, 0)).toBe(1)
    expect(body.months.reduce((sum: number, row: { bookings: number }) => sum + row.bookings, 0)).toBe(1)
  })

  it('sends the workbook and records the download', async () => {
    const response = await get(tokens.admin)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(response.headers.get('content-disposition')).toMatch(/attachment; filename="iepf-report-\d{4}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx"/)
    const files = unzip(Buffer.from(await response.arrayBuffer()))
    expect(files.get('xl/worksheets/sheet4.xml')).toContain('student@example.test')
    expect(await hasRecentReportExport(ids.admin)).toBe(true)
  })
})
