'use client'

import * as React from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Coverage = { role: 'student' | 'tutor' | 'admin', users: number, withPush: number }

const ROLE_LABELS: Record<Coverage['role'], string> = {
  student: 'Studenti',
  tutor: 'Tutor',
  admin: 'Admin'
}

// How many verified users get push on at least one device: whether the request to turn it on works.
export function PushCoverageCard() {
  const [rows, setRows] = React.useState<Coverage[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/api/admin/stats/push/coverage', { cache: 'no-store' })
        if (!response.ok) return
        const payload = (await response.json()) as Coverage[]
        if (!cancelled && Array.isArray(payload)) setRows(payload)
      } catch {
        // The overview works without this card.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifiche attive</CardTitle>
        <CardDescription>Utenti con le notifiche attive su almeno un dispositivo.</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4 sm:grid-cols-3'>
        {(rows ?? (['student', 'tutor', 'admin'] as const).map(role => ({ role, users: 0, withPush: 0 }))).map((row) => {
          const percent = row.users > 0 ? Math.round((row.withPush / row.users) * 100) : 0
          return (
            <div key={row.role} className='space-y-2'>
              <div className='flex items-baseline justify-between gap-2'>
                <span className='text-sm text-muted-foreground'>{ROLE_LABELS[row.role]}</span>
                <span className='text-2xl font-semibold tabular-nums'>{rows ? `${percent}%` : '-'}</span>
              </div>
              <div
                className='h-2 overflow-hidden rounded-full bg-muted'
                role='progressbar'
                aria-label={`${ROLE_LABELS[row.role]} con notifiche attive`}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className='h-full rounded-full bg-primary' style={{ width: `${percent}%` }} />
              </div>
              <p className='text-xs text-muted-foreground tabular-nums'>
                {rows ? `${row.withPush} su ${row.users}` : ' '}
              </p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
