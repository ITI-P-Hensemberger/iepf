'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { axisProps, ChartCard, ChartTooltip, DataView, gridProps, Legend, StatTile } from '@/components/admin-stats/charts'
import { useJson } from '@/components/admin-stats/use-json'

type Direction = 'studentToTutor' | 'tutorToStudent'
type FeedbackSummary = Record<string, number | undefined>

const SERIES: Array<{ key: Direction, label: string, color: string }> = [
  { key: 'studentToTutor', label: 'Studenti verso tutor', color: 'var(--viz-1)' },
  { key: 'tutorToStudent', label: 'Tutor verso studenti', color: 'var(--viz-2)' }
]

function format(value: number | undefined, digits = 0) {
  return value == null ? '-' : value.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function FeedbackTab() {
  const { data } = useJson<FeedbackSummary>('/api/admin/stats/feedback/summary', 'Impossibile caricare le statistiche feedback.')
  const ratings = [1, 2, 3, 4, 5].map(stars => ({
    stars: stars === 1 ? '1 stella' : `${stars} stelle`,
    studentToTutor: data?.[`studentToTutorRating${stars}`] ?? 0,
    tutorToStudent: data?.[`tutorToStudentRating${stars}`] ?? 0
  }))

  return (
    <div className='space-y-6'>
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
