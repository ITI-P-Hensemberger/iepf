'use client'

import { Skeleton } from '@/components/ui/skeleton'
import * as React from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { AnalyticsPayload } from '@/components/admin-stats/analytics-data'

import { CATEGORY_LABELS, detailCounts, eventTotal, percent } from '@/components/admin-stats/analytics-data'
import { HorizontalBars, PushChart, RangeSelect } from '@/components/admin-stats/analytics-tab'
import { axisProps, ChartCard, ChartTooltip, DataView, EmptyChart, formatNumber, gridProps, Legend, StatTile } from '@/components/admin-stats/charts'
import { useJson } from '@/components/admin-stats/use-json'
import { PushCoverageCard } from '@/components/push-coverage-card'

type NotificationStats = {
  keepDays: number
  inbox: Array<{ category: string, total: number, read: number }>
  devices: Array<{ service: string, devices: number, workingLast30Days: number }>
  optOuts: Array<{ category: string, users: number }>
}

const SERVICE_LABELS: Record<string, string> = {
  google: 'Google (Chrome, Android)',
  apple: 'Apple (Safari, iPhone, iPad)',
  mozilla: 'Mozilla (Firefox)',
  microsoft: 'Microsoft (Edge)',
  other: 'Altro'
}

const categoryLabel = (category: string) => CATEGORY_LABELS[category] ?? category

function InboxChart({ stats }: { stats: NotificationStats }) {
  const rows = stats.inbox.map(row => ({ category: categoryLabel(row.category), read: row.read, unread: row.total - row.read }))
  if (rows.length === 0) return <EmptyChart>Nessuna notifica nel periodo conservato.</EmptyChart>
  const series = [
    { key: 'read', label: 'Lette', color: 'var(--viz-1)' },
    { key: 'unread', label: 'Non lette', color: 'var(--viz-4)' }
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
        rows={rows}
        columns={[
          { key: 'category', label: 'Tipo' },
          { key: 'read', label: 'Lette', numeric: true },
          { key: 'unread', label: 'Non lette', numeric: true }
        ]}
      />
    </>
  )
}

export function NotificationsTab() {
  const [days, setDays] = React.useState(30)
  const { data: stats } = useJson<NotificationStats>('/api/admin/stats/notifications', 'Impossibile caricare le statistiche delle notifiche.')
  const { data: usage, loading } = useJson<AnalyticsPayload>(`/api/admin/stats/analytics?days=${days}`, 'Impossibile caricare le statistiche d\'uso.')

  const sent = usage ? eventTotal(usage, 'push_sent') : 0
  const opened = usage ? eventTotal(usage, 'push_open') : 0
  const openRate = percent(opened, sent)
  const inboxTotal = stats?.inbox.reduce((sum, row) => sum + row.total, 0) ?? 0
  const inboxRead = stats?.inbox.reduce((sum, row) => sum + row.read, 0) ?? 0
  const devices = stats?.devices.reduce((sum, row) => sum + row.devices, 0)
  const working = stats?.devices.reduce((sum, row) => sum + row.workingLast30Days, 0) ?? 0
  const clicks = usage ? detailCounts(usage, 'inbox_click').map(row => ({ name: categoryLabel(row.detail), count: row.count })) : []

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatTile label='Push aperte' value={openRate == null ? '-' : `${openRate}%`} hint={`${formatNumber(opened)} su ${formatNumber(sent)} inviate nel periodo`} />
        <StatTile label='Notifiche lette nel pannello' value={inboxTotal > 0 ? `${percent(inboxRead, inboxTotal)}%` : '-'} hint={stats ? `${formatNumber(inboxRead)} su ${formatNumber(inboxTotal)}, ultimi ${stats.keepDays} giorni` : undefined} />
        <StatTile label='Dispositivi iscritti' value={devices === undefined ? '-' : formatNumber(devices)} hint={devices ? `${formatNumber(working)} raggiunti negli ultimi 30 giorni` : undefined} />
        <StatTile label='Campanella aperta' value={usage ? formatNumber(eventTotal(usage, 'bell_open')) : '-'} hint={usage ? `${formatNumber(eventTotal(usage, 'inbox_click'))} notifiche toccate nel periodo` : undefined} />
      </div>

      <PushCoverageCard />

      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <h2 className='text-lg font-medium'>Push e campanella nel periodo</h2>
        <RangeSelect days={days} onChange={setDays} />
      </div>

      <div className={loading ? 'space-y-6 opacity-60 transition-opacity' : 'space-y-6 transition-opacity'}>
        <ChartCard title='Notifiche push per tipo' description='Inviate ai dispositivi e aperte toccando la notifica.'>
          {usage ? <PushChart payload={usage} /> : <Skeleton className='h-64' />}
        </ChartCard>
        <ChartCard title='Notifiche toccate nel pannello' description='Dalla campanella, per tipo di notifica.'>
          <HorizontalBars rows={clicks} label='Tocchi' />
        </ChartCard>
      </div>

      <h2 className='text-lg font-medium'>Pannello, dispositivi e preferenze</h2>

      <ChartCard title='Notifiche nel pannello per tipo' description={`Tutte le notifiche degli ultimi ${stats?.keepDays ?? 90} giorni, lette o no.`}>
        {stats ? <InboxChart stats={stats} /> : <Skeleton className='h-64' />}
      </ChartCard>

      <div className='grid gap-6 lg:grid-cols-2'>
        <ChartCard title='Dispositivi per servizio push' description='Dice quali browser e telefoni ricevono le notifiche.'>
          <HorizontalBars rows={(stats?.devices ?? []).map(row => ({ name: SERVICE_LABELS[row.service] ?? row.service, count: row.devices }))} label='Dispositivi' empty='Nessun dispositivo iscritto alle notifiche push.' />
        </ChartCard>
        <ChartCard title='Tipi di notifica disattivati' description='Quante persone hanno spento ogni tipo nelle preferenze.'>
          {stats && stats.optOuts.length === 0
            ? <EmptyChart>Nessuno ha disattivato un tipo di notifica.</EmptyChart>
            : <HorizontalBars rows={(stats?.optOuts ?? []).map(row => ({ name: categoryLabel(row.category), count: row.users }))} label='Persone' color='var(--viz-2)' />}
        </ChartCard>
      </div>
    </div>
  )
}
