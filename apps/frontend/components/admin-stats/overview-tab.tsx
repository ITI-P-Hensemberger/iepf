'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { csvFilename, downloadCsv, fetchAllPages, STUDENT_CSV_HEADERS, toCsv, TUTOR_CSV_HEADERS } from '@/components/admin-stats/csv'
import { useJson } from '@/components/admin-stats/use-json'
import { PushCoverageCard } from '@/components/push-coverage-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Total = { total?: number }
type StudentStatus = { active?: number, inactive?: number, pendingEmailVerification?: number }
type TutorStatus = { active?: number, inactive?: number, invites?: number }

export type UserRow = {
  id?: string
  firstName: string
  lastName: string
  email: string
  sectionName?: string | null
  year?: number | null
  isActive?: boolean | null
  lessonTokens?: number | null
}

type LessonStats = Record<string, number | string | null> & { studentId?: string, tutorId?: string }

export function fetchAllUsers(role: 'student' | 'tutor') {
  return fetchAllPages<UserRow>(
    (offset, limit) => `/api/users?${new URLSearchParams({ role, sortBy: 'lastName', sortDir: 'asc', limit: String(limit), offset: String(offset) })}`,
    'Impossibile scaricare gli utenti.'
  )
}

// Every user of the role with their lesson counts, as one CSV.
async function exportUsersCsv(role: 'student' | 'tutor') {
  const [users, stats] = await Promise.all([
    fetchAllUsers(role),
    fetchAllPages<LessonStats>(
      (offset, limit) => `/api/admin/stats/lessons-counts/${role}s?${new URLSearchParams({ sortBy: 'lastName', sortDir: 'asc', limit: String(limit), offset: String(offset) })}`,
      'Impossibile scaricare gli utenti.'
    )
  ])
  const statsById = new Map(stats.map(row => [row.studentId ?? row.tutorId, row]))
  const headers = role === 'student' ? STUDENT_CSV_HEADERS : TUTOR_CSV_HEADERS
  const rows = users.map((user) => {
    const userStats = statsById.get(user.id) ?? {}
    // Lesson counts default to 0 for users who never had a lesson.
    const counts = Object.fromEntries(headers.filter(header => header.startsWith('lessons')).map(header => [header, userStats[header] ?? 0]))
    return { ...user, ...counts }
  })
  downloadCsv(csvFilename(`${role}s`), toCsv<string>(headers, rows))
}

function Stat({ label, value }: { label: string, value: number | undefined }) {
  return (
    <div className='flex items-center justify-between'>
      <span className='text-sm text-muted-foreground'>{label}</span>
      <span className='font-semibold tabular-nums'>{value ?? '-'}</span>
    </div>
  )
}

function ExportButton({ role }: { role: 'student' | 'tutor' }) {
  const [busy, setBusy] = React.useState(false)
  return (
    <Button
      type='button'
      variant='outline'
      size='sm'
      disabled={busy}
      onClick={() => {
        setBusy(true)
        exportUsersCsv(role)
          .catch(error => toast.error(error instanceof Error ? error.message : 'Impossibile scaricare gli utenti.'))
          .finally(() => setBusy(false))
      }}
    >
      {busy ? 'Download...' : 'Download CSV'}
    </Button>
  )
}

export function OverviewTab() {
  const lessons = useJson<Total>('/api/admin/stats/lessons-confirmed/count', 'Impossibile caricare i conteggi delle lezioni.')
  const bookings = useJson<Total>('/api/admin/stats/bookings-confirmed/count', 'Impossibile caricare i conteggi delle lezioni.')
  const students = useJson<StudentStatus>('/api/admin/stats/students/status-counts', 'Impossibile caricare i conteggi utenti.')
  const tutors = useJson<TutorStatus>('/api/admin/stats/tutors/status-counts', 'Impossibile caricare i conteggi utenti.')

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader><CardTitle>Lezioni confermate</CardTitle></CardHeader>
          <CardContent><div className='text-3xl font-semibold tabular-nums'>{lessons.data?.total ?? '-'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Prenotazioni confermate</CardTitle></CardHeader>
          <CardContent><div className='text-3xl font-semibold tabular-nums'>{bookings.data?.total ?? '-'}</div></CardContent>
        </Card>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between gap-3'>
              <CardTitle>Studenti</CardTitle>
              <ExportButton role='student' />
            </div>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Stat label='Attivi' value={students.data?.active} />
            <Stat label='Inattivi' value={students.data?.inactive} />
            <Stat label='Email da verificare' value={students.data?.pendingEmailVerification} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between gap-3'>
              <CardTitle>Tutor</CardTitle>
              <ExportButton role='tutor' />
            </div>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Stat label='Attivi' value={tutors.data?.active} />
            <Stat label='Inattivi' value={tutors.data?.inactive} />
            <Stat label='Inviti' value={tutors.data?.invites} />
          </CardContent>
        </Card>
      </div>

      <PushCoverageCard />
    </div>
  )
}
