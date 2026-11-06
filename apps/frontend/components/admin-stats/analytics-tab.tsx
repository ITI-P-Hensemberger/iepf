'use client'

import * as React from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { AnalyticsPayload } from '@/components/admin-stats/analytics-data'

import {
  activeByYear,
  averageDailyActive,
  bookingFunnel,
  dailyByRole,
  detailCounts,
  eventTotal,
  pageLabel,
  percent,
  pushByCategory,
  ROLE_COLORS,
  ROLE_LABELS
} from '@/components/admin-stats/analytics-data'
import { axisProps, ChartCard, ChartTooltip, DataView, EmptyChart, formatNumber, gridProps, Legend, StatTile } from '@/components/admin-stats/charts'
import { useJson } from '@/components/admin-stats/use-json'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const RANGES = [
  { days: 7, label: 'Ultimi 7 giorni' },
  { days: 30, label: 'Ultimi 30 giorni' },
  { days: 90, label: 'Ultimi 90 giorni' },
  { days: 365, label: 'Ultimo anno' }
]

const dayFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`))

export function HorizontalBars({ rows, label, color = 'var(--viz-1)', empty }: { rows: Array<{ name: string, count: number }>, label: string, color?: string, empty?: string }) {
  if (rows.length === 0) return <EmptyChart>{empty}</EmptyChart>
  return (
    <div style={{ height: Math.max(120, rows.length * 32 + 24) }}>
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={rows} layout='vertical' margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis type='number' allowDecimals={false} {...axisProps} />
          <YAxis type='category' dataKey='name' width={170} {...axisProps} />
          <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip />} />
          <Bar dataKey='count' name={label} fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ActiveUsersChart({ payload }: { payload: AnalyticsPayload }) {
  const { points, roles } = dailyByRole(payload, 'active_users', { onlyCountedDays: true })
  if (roles.length === 0) return <EmptyChart>I conteggi degli utenti attivi arrivano ogni notte, per il giorno prima.</EmptyChart>
  return (
    <>
      <Legend items={roles.map(role => ({ label: ROLE_LABELS[role], color: ROLE_COLORS[role] }))} />
      <div className='h-72'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey='day' tickFormatter={formatDay} minTickGap={24} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip labelFormatter={day => formatDay(String(day))} content={<ChartTooltip />} />
            {roles.map(role => (
              <Line
                key={role}
                type='monotone'
                dataKey={role}
                name={ROLE_LABELS[role]}
                stroke={ROLE_COLORS[role]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataView
        rows={points.map(point => ({ ...point, day: formatDay(point.day) }))}
        columns={[{ key: 'day', label: 'Giorno' }, ...roles.map(role => ({ key: role, label: ROLE_LABELS[role], numeric: true }))]}
      />
    </>
  )
}

function YearChart({ payload, role }: { payload: AnalyticsPayload, role: 'student' | 'tutor' }) {
  const rows = activeByYear(payload, role)
  if (rows.length === 0) return <EmptyChart />
  return (
    <div className='h-48'>
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey='year' {...axisProps} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip />} />
          <Bar dataKey='average' name='Media al giorno' fill={ROLE_COLORS[role]} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Funnel({ payload }: { payload: AnalyticsPayload }) {
  const funnel = bookingFunnel(payload)
  const first = funnel.steps[0].count
  return (
    <div className='space-y-4'>
      <ol className='space-y-3'>
        {funnel.steps.map(step => {
          const share = percent(step.count, first)
          return (
            <li key={step.step} className='space-y-1'>
              <div className='flex items-baseline justify-between gap-2 text-sm'>
                <span>{step.step}</span>
                <span className='tabular-nums'>
                  <span className='font-semibold'>{formatNumber(step.count)}</span>
                  {share != null && <span className='ml-2 text-muted-foreground'>{share}%</span>}
                </span>
              </div>
              <div className='h-2 overflow-hidden rounded-full bg-muted' aria-hidden>
                <div className='h-full rounded-full' style={{ width: `${share ?? 0}%`, background: 'var(--viz-1)' }} />
              </div>
            </li>
          )
        })}
      </ol>
      <p className='text-xs text-muted-foreground'>
        I passaggi contano eventi, non persone: uno studente può aprire la pagina più volte.
        {funnel.attempts > 0 && ` Tentativi di prenotazione: ${formatNumber(funnel.attempts)}, riusciti il ${percent(funnel.booked, funnel.attempts)}%.`}
      </p>
      {funnel.failures.length > 0 && (
        <div className='space-y-2'>
          <h4 className='text-sm font-medium'>Perché non è andata</h4>
          <HorizontalBars rows={funnel.failures.map(row => ({ name: row.reason, count: row.count }))} label='Tentativi' color='var(--viz-2)' />
        </div>
      )}
    </div>
  )
}

export function PushChart({ payload }: { payload: AnalyticsPayload }) {
  const rows = pushByCategory(payload)
  if (rows.length === 0) return <EmptyChart />
  const series = [
    { key: 'sent', label: 'Inviate', color: 'var(--viz-1)' },
    { key: 'opened', label: 'Aperte', color: 'var(--viz-2)' }
  ] as const
  return (
    <>
      <Legend items={series.map(item => ({ label: item.label, color: item.color }))} />
      <div className='h-72'>
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={rows} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey='category' interval={0} angle={-20} textAnchor='end' height={56} {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip />} />
            {series.map(item => (
              <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataView
        rows={rows.map(row => ({ ...row, rate: percent(row.opened, row.sent) == null ? '-' : `${percent(row.opened, row.sent)}%` }))}
        columns={[
          { key: 'category', label: 'Tipo' },
          { key: 'sent', label: 'Inviate', numeric: true },
          { key: 'opened', label: 'Aperte', numeric: true },
          { key: 'rate', label: 'Tasso di apertura', numeric: true }
        ]}
      />
    </>
  )
}

export function RangeSelect({ days, onChange }: { days: number, onChange: (days: number) => void }) {
  return (
    <Select value={String(days)} onValueChange={value => onChange(Number(value))}>
      <SelectTrigger className='w-full sm:w-48' aria-label='Periodo'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGES.map(range => <SelectItem key={range.days} value={String(range.days)}>{range.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function AnalyticsTab() {
  const [days, setDays] = React.useState(30)
  const { data: payload, loading } = useJson<AnalyticsPayload>(`/api/admin/stats/analytics?days=${days}`, 'Impossibile caricare le statistiche d\'uso.')

  const pages = payload ? detailCounts(payload, 'page_view').slice(0, 12).map(row => ({ name: pageLabel(row.detail), count: row.count })) : []
  const errors = payload ? detailCounts(payload, 'client_error').slice(0, 10) : []
  const funnel = payload ? bookingFunnel(payload) : null
  const bookedRate = funnel ? percent(funnel.booked, funnel.attempts) : null

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <p className='max-w-2xl text-sm text-muted-foreground'>
          Conteggi giornalieri per ruolo e anno, senza nomi, email, IP o identificativi. Niente durante l&apos;impersonazione
          e niente da chi ha attivato &quot;Do Not Track&quot; o Global Privacy Control. Conservati 13 mesi.
        </p>
        <RangeSelect days={days} onChange={setDays} />
      </div>

      {!payload
        ? <EmptyChart>{loading ? 'Caricamento...' : 'Statistiche d\'uso non disponibili.'}</EmptyChart>
        : (
            <div className={loading ? 'space-y-6 opacity-60 transition-opacity' : 'space-y-6 transition-opacity'}>
              <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                <StatTile label='Utenti attivi al giorno' value={formatNumber(averageDailyActive(payload))} hint='Media dei giorni conteggiati' />
                <StatTile label='Pagine viste' value={formatNumber(eventTotal(payload, 'page_view'))} />
                <StatTile label='Prenotazioni riuscite' value={bookedRate == null ? '-' : `${bookedRate}%`} hint={funnel ? `${formatNumber(funnel.booked)} su ${formatNumber(funnel.attempts)} tentativi` : undefined} />
                <StatTile label='Errori nel browser' value={formatNumber(eventTotal(payload, 'client_error'))} />
              </div>

              <ChartCard title='Utenti attivi' description='Persone diverse che hanno usato il sito, ogni giorno, per ruolo.'>
                <ActiveUsersChart payload={payload} />
              </ChartCard>

              <div className='grid gap-6 lg:grid-cols-2'>
                <ChartCard title='Studenti attivi per anno' description='Media al giorno nel periodo.'>
                  <YearChart payload={payload} role='student' />
                </ChartCard>
                <ChartCard title='Tutor attivi per anno' description='Media al giorno nel periodo.'>
                  <YearChart payload={payload} role='tutor' />
                </ChartCard>
              </div>

              <div className='grid gap-6 lg:grid-cols-2'>
                <ChartCard title='Prenotazione' description='Dalla pagina delle lezioni alla prenotazione riuscita.'>
                  <Funnel payload={payload} />
                </ChartCard>
                <ChartCard title='Pagine più viste'>
                  <HorizontalBars rows={pages} label='Visite' />
                </ChartCard>
              </div>

              <ChartCard title='Errori nel browser' description='Tipo di errore e pagina; il messaggio non viene salvato.'>
                {errors.length === 0
                  ? <EmptyChart>Nessun errore nel periodo.</EmptyChart>
                  : (
                      <ul className='divide-y text-sm'>
                        {errors.map(row => {
                          const [name, page] = row.detail.split('@')
                          return (
                            <li key={row.detail} className='flex items-center justify-between gap-3 py-2'>
                              <span><span className='font-medium'>{name}</span> <span className='text-muted-foreground'>su {pageLabel(page ?? 'other')}</span></span>
                              <span className='tabular-nums'>{formatNumber(row.count)}</span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
              </ChartCard>
            </div>
          )}
    </div>
  )
}
