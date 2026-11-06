'use client'

import * as React from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'

import { axisProps, ChartCard, ChartTooltip, DataView, gridProps, Legend, StatTile } from '@/components/admin-stats/charts'
import { csvFilename, downloadCsv, FEEDBACK_CSV_HEADERS, fetchAllPages, toCsv } from '@/components/admin-stats/csv'
import { fetchAllUsers } from '@/components/admin-stats/overview-tab'
import { useJson } from '@/components/admin-stats/use-json'
import { Button } from '@/components/ui/button'

type Direction = 'studentToTutor' | 'tutorToStudent'
type FeedbackSummary = Record<string, number | undefined>

type FeedbackRow = {
  id: string
  lessonId: string
  bookingId: string
  authorUserId: string
  targetUserId: string
  authorRole: 'student' | 'tutor'
  rating: number
  text: string | null
  createdAt: string
  updatedAt: string
}

const SERIES: Array<{ key: Direction, label: string, color: string }> = [
  { key: 'studentToTutor', label: 'Studenti verso tutor', color: 'var(--viz-1)' },
  { key: 'tutorToStudent', label: 'Tutor verso studenti', color: 'var(--viz-2)' }
]

async function exportFeedbackCsv(role: 'student' | 'tutor') {
  const [students, tutors, feedback] = await Promise.all([
    fetchAllUsers('student'),
    fetchAllUsers('tutor'),
    fetchAllPages<FeedbackRow>(
      (offset, limit) => `/api/feedback?${new URLSearchParams({ sortBy: 'createdAt', sortDir: 'desc', limit: String(limit), offset: String(offset) })}`,
      'Impossibile scaricare i feedback.'
    )
  ])
  const users = new Map([...students, ...tutors].filter(user => user.id).map(user => [user.id!, user]))
  const name = (id: string) => {
    const user = users.get(id)
    return `${user?.lastName ?? ''} ${user?.firstName ?? ''}`.trim() || id
  }
  const rows = feedback.filter(item => item.authorRole === role).map(item => ({
    ...item,
    authorName: name(item.authorUserId),
    authorEmail: users.get(item.authorUserId)?.email ?? '',
    targetName: name(item.targetUserId),
    targetEmail: users.get(item.targetUserId)?.email ?? ''
  }))
  downloadCsv(csvFilename(`feedback-${role}`), toCsv(FEEDBACK_CSV_HEADERS, rows))
}

function format(value: number | undefined, digits = 0) {
  return value == null ? '-' : value.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function FeedbackTab() {
  const { data } = useJson<FeedbackSummary>('/api/admin/stats/feedback/summary', 'Impossibile caricare le statistiche feedback.')
  const [busy, setBusy] = React.useState(false)

  const ratings = [1, 2, 3, 4, 5].map(stars => ({
    stars: stars === 1 ? '1 stella' : `${stars} stelle`,
    studentToTutor: data?.[`studentToTutorRating${stars}`] ?? 0,
    tutorToStudent: data?.[`tutorToStudentRating${stars}`] ?? 0
  }))

  const download = (role: 'student' | 'tutor') => {
    setBusy(true)
    exportFeedbackCsv(role)
      .catch(error => toast.error(error instanceof Error ? error.message : 'Impossibile scaricare i feedback.'))
      .finally(() => setBusy(false))
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-2 sm:flex-row sm:justify-end'>
        <Button type='button' variant='outline' size='sm' disabled={busy} onClick={() => download('student')}>
          {busy ? 'Download...' : 'CSV feedback degli studenti'}
        </Button>
        <Button type='button' variant='outline' size='sm' disabled={busy} onClick={() => download('tutor')}>
          {busy ? 'Download...' : 'CSV feedback dei tutor'}
        </Button>
      </div>

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatTile label='Feedback totali' value={format(data?.total)} />
        <StatTile label='Media valutazioni' value={format(data?.averageRating, 2)} />
        <StatTile label='Studenti verso tutor' value={format(data?.studentToTutorTotal)} hint={`Media ${format(data?.studentToTutorAverageRating, 2)}`} />
        <StatTile label='Tutor verso studenti' value={format(data?.tutorToStudentTotal)} hint={`Media ${format(data?.tutorToStudentAverageRating, 2)}`} />
      </div>

      <ChartCard title='Distribuzione delle valutazioni' description='Quanti feedback per numero di stelle, nei due sensi.'>
        <Legend items={SERIES.map(series => ({ label: series.label, color: series.color }))} />
        <div className='h-72'>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={ratings} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey='stars' {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip />} />
              {SERIES.map(series => (
                <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <DataView
          rows={ratings}
          columns={[
            { key: 'stars', label: 'Stelle' },
            { key: 'studentToTutor', label: 'Studenti verso tutor', numeric: true },
            { key: 'tutorToStudent', label: 'Tutor verso studenti', numeric: true }
          ]}
        />
      </ChartCard>
    </div>
  )
}
