'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { axisProps, ChartCard, ChartTooltip, DataView, EmptyChart, formatNumber, gridProps, Legend, StatTile } from '@/components/admin-stats/charts'
import { useJson } from '@/components/admin-stats/use-json'

type Total = { total?: number }
type StudentStatus = { active?: number, inactive?: number, pendingEmailVerification?: number }
type TutorStatus = { active?: number, inactive?: number, invites?: number }
type Overview = {
  lessonsByStatus: { scheduled: number, confirmed: number, completed: number, canceled: number }
  attendance: { present: number, absent: number, unrecorded: number }
  months: Array<{ month: string, lessons: number, completed: number, bookings: number, present: number, absent: number }>
}

const monthFormat = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const monthLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`))

const value = (n: number | undefined) => (n === undefined ? '-' : formatNumber(Number(n)))

function Breakdown({ rows }: { rows: Array<{ label: string, count: number | undefined, color: string }> }) {
  const total = rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0)
  return (
    <div className='space-y-3'>
      {/* One bar split by share: each part keeps its colour, labels carry the numbers. */}
      <div className='flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted' aria-hidden>
        {total > 0 && rows.map(row => (
          <div key={row.label} style={{ width: `${(Number(row.count ?? 0) / total) * 100}%`, background: row.color }} />
        ))}
      </div>
      <dl className='grid gap-2'>
        {rows.map(row => (
          <div key={row.label} className='flex items-center justify-between gap-3 text-sm'>
            <dt className='flex items-center gap-2 text-muted-foreground'>
              <span className='size-2.5 rounded-sm' style={{ background: row.color }} aria-hidden />
              {row.label}
            </dt>
            <dd className='font-semibold tabular-nums'>{value(row.count)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function OverviewTab() {
  const lessons = useJson<Total>('/api/admin/stats/lessons-confirmed/count', 'Impossibile caricare i conteggi delle lezioni.')
  const bookings = useJson<Total>('/api/admin/stats/bookings-confirmed/count', 'Impossibile caricare i conteggi delle lezioni.')
  const students = useJson<StudentStatus>('/api/admin/stats/students/status-counts', 'Impossibile caricare i conteggi utenti.')
  const tutors = useJson<TutorStatus>('/api/admin/stats/tutors/status-counts', 'Impossibile caricare i conteggi utenti.')
  const overview = useJson<Overview>('/api/admin/stats/overview', 'Impossibile caricare l\'andamento.')

  const attendance = overview.data?.attendance
  const recorded = attendance ? attendance.present + attendance.absent : 0
  const months = (overview.data?.months ?? []).map(row => ({ ...row, label: monthLabel(row.month) }))

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatTile label='Studenti attivi' value={value(students.data?.active)} />
        <StatTile label='Tutor attivi' value={value(tutors.data?.active)} />
        <StatTile label='Lezioni confermate' value={value(lessons.data?.total)} hint='Con almeno una prenotazione' />
        <StatTile
          label='Presenza'
          value={attendance && recorded > 0 ? `${Math.round((attendance.present / recorded) * 100)}%` : '-'}
          hint={attendance ? `${formatNumber(attendance.present)} presenze su ${formatNumber(recorded)} registrate` : undefined}
        />
      </div>

      <ChartCard title='Lezioni e prenotazioni per mese' description='Negli ultimi 12 mesi, nel mese in cui si svolge la lezione.'>
        {months.length === 0
          ? <EmptyChart>{overview.loading ? 'Caricamento...' : 'Nessuna lezione negli ultimi 12 mesi.'}</EmptyChart>
          : (
              <>
                <Legend items={[{ label: 'Lezioni', color: 'var(--viz-1)' }, { label: 'Prenotazioni', color: 'var(--viz-2)' }]} />
                <div className='h-72'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={months} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey='label' {...axisProps} />
                      <YAxis allowDecimals={false} {...axisProps} />
                      <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip />} />
                      <Bar dataKey='lessons' name='Lezioni' fill='var(--viz-1)' radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey='bookings' name='Prenotazioni' fill='var(--viz-2)' radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <DataView
                  rows={months}
                  columns={[
                    { key: 'label', label: 'Mese' },
                    { key: 'lessons', label: 'Lezioni', numeric: true },
                    { key: 'completed', label: 'Completate', numeric: true },
                    { key: 'bookings', label: 'Prenotazioni', numeric: true },
                    { key: 'present', label: 'Presenze', numeric: true },
                    { key: 'absent', label: 'Assenze', numeric: true }
                  ]}
                />
              </>
            )}
      </ChartCard>

      <div className='grid gap-6 lg:grid-cols-3'>
        <ChartCard title='Studenti'>
          <Breakdown rows={[
            { label: 'Attivi', count: students.data?.active, color: 'var(--viz-1)' },
            { label: 'In attesa di attivazione', count: students.data?.inactive, color: 'var(--viz-2)' },
            { label: 'Email da verificare', count: students.data?.pendingEmailVerification, color: 'var(--viz-4)' }
          ]}
          />
        </ChartCard>
        <ChartCard title='Tutor'>
          <Breakdown rows={[
            { label: 'Attivi', count: tutors.data?.active, color: 'var(--viz-1)' },
            { label: 'In attesa di attivazione', count: tutors.data?.inactive, color: 'var(--viz-2)' },
            { label: 'Inviti aperti', count: tutors.data?.invites, color: 'var(--viz-4)' }
          ]}
          />
        </ChartCard>
        <ChartCard title='Lezioni per stato'>
          <Breakdown rows={[
            { label: 'Completate', count: overview.data?.lessonsByStatus.completed, color: 'var(--viz-3)' },
            { label: 'Confermate', count: overview.data?.lessonsByStatus.confirmed, color: 'var(--viz-1)' },
            { label: 'Senza prenotazioni', count: overview.data?.lessonsByStatus.scheduled, color: 'var(--viz-4)' },
            { label: 'Annullate', count: overview.data?.lessonsByStatus.canceled, color: 'var(--viz-2)' }
          ]}
          />
          <p className='text-xs text-muted-foreground'>Prenotazioni confermate in tutto: {value(bookings.data?.total)}.</p>
        </ChartCard>
      </div>
    </div>
  )
}
