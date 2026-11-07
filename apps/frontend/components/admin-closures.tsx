'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarOff, Info, X } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { useHere, withFrom } from '@/lib/back-link'
import { extractPayloadArray } from '@/lib/backend-response'
import { addDaysToKey, dateOfKey, dayKeyOf } from '@/lib/school-week'

type ScheduleLesson = { id: string, startAt: string, status: string, bookings: unknown[] }
type Impact = { lessons: number, students: number }

const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// Lessons are created on Saturday for the week after: only this week and the next can hold any.
const LOOKAHEAD_DAYS = 14

// The "Chiusure" section of the global settings: the days the school is closed, what that
// does, and for the closures coming soon the lessons that already exist and need cancelling.
// dates are 'YYYY-MM-DD'; the page saves them.
export function AdminClosures({
  dates,
  onChange,
  dirty
}: {
  dates: string[]
  onChange: (dates: string[]) => void
  dirty: boolean
}) {
  const here = useHere()
  const todayKey = dayKeyOf(new Date())
  const [impact, setImpact] = React.useState<Map<string, Impact>>(new Map())

  // What already exists on the closed days of this week and the next.
  React.useEffect(() => {
    const soon = dates.filter(date => date >= todayKey && date <= addDaysToKey(todayKey, LOOKAHEAD_DAYS))
    if (soon.length === 0) return
    let cancelled = false
    const from = dateOfKey(todayKey)
    const to = dateOfKey(addDaysToKey(todayKey, LOOKAHEAD_DAYS))
    to.setHours(23, 59, 59, 999)
    void fetch(`/api/lessons/schedule?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`)
      .then(response => (response.ok ? response.json() : []))
      .then((payload) => {
        if (cancelled) return
        const next = new Map<string, Impact>()
        for (const lesson of extractPayloadArray<ScheduleLesson>(payload)) {
          if (lesson.status === 'canceled' || lesson.status === 'cancelled') continue
          const key = dayKeyOf(new Date(lesson.startAt))
          const current = next.get(key) ?? { lessons: 0, students: 0 }
          next.set(key, { lessons: current.lessons + 1, students: current.students + lesson.bookings.length })
        }
        setImpact(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [dates, todayKey])

  const sorted = [...dates].sort()
  const upcoming = sorted.filter(date => date >= todayKey)
  const past = sorted.filter(date => date < todayKey).reverse()
  const selected = sorted.map(dateOfKey)
  const remove = (date: string) => onChange(dates.filter(item => item !== date))

  return (
    <div className='space-y-6'>
      <div className='rounded-lg border bg-muted/40 p-4 text-sm'>
        <p className='flex items-center gap-2 font-medium'>
          <Info className='size-4 shrink-0' aria-hidden /> Cosa succede in un giorno di chiusura
        </p>
        <ul className='mt-2 list-disc space-y-1 pl-6 text-muted-foreground'>
          <li>
            Il sabato vengono create le lezioni della settimana dopo: per i giorni chiusi non ne viene creata
            nessuna, quindi nessuno studente può prenotare.
          </li>
          <li>
            Le lezioni <span className='font-medium text-foreground'>già create non vengono annullate da sole</span>.
            Se chiudi un giorno di questa settimana o della prossima, annullale dalla giornata: gli studenti
            prenotati vengono avvisati e riavranno l&apos;ora.
          </li>
          <li>Il giorno non conta per l&apos;avviso &quot;settimana senza lezioni&quot;.</li>
        </ul>
      </div>

      <div className='grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]'>
        <div className='flex flex-col items-center gap-2 rounded-lg border bg-card p-3 lg:items-start'>
          <Calendar
            mode='multiple'
            selected={selected}
            onSelect={(next) => onChange(Array.from(new Set((next ?? []).map(dayKeyOf))))}
            // Lessons run Monday to Friday: weekends are closed anyway.
            disabled={(date) => date.getDay() === 0 || date.getDay() === 6}
            numberOfMonths={1}
          />
          <p className='px-2 text-xs text-muted-foreground'>Tocca un giorno per chiuderlo o riaprirlo.</p>
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='font-semibold'>Prossime chiusure</h3>
            {dirty && <Badge variant='warning'>Modifiche non salvate</Badge>}
          </div>
          {upcoming.length === 0 ? (
            <EmptyState>Nessuna chiusura in programma: tutti i giorni di scuola sono aperti.</EmptyState>
          ) : (
            <ul className='divide-y rounded-lg border bg-card'>
              {upcoming.map((date) => {
                const found = impact.get(date)
                return (
                  <li key={date} className='flex items-start gap-3 px-4 py-3'>
                    <CalendarOff className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-hidden />
                    <div className='min-w-0 flex-1'>
                      <p className='font-medium'>{capitalize(dayFormat.format(dateOfKey(date)))}</p>
                      {found && found.lessons > 0 && (
                        <p className='mt-1 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400'>
                          <AlertTriangle className='mt-0.5 size-4 shrink-0' aria-hidden />
                          <span>
                            {found.lessons} {found.lessons === 1 ? 'lezione già creata' : 'lezioni già create'}
                            {found.students > 0 && `, ${found.students} ${found.students === 1 ? 'studente prenotato' : 'studenti prenotati'}`}.{' '}
                            <Link href={withFrom(`/admin/lessons?day=${date}`, here)} className='font-medium underline underline-offset-4'>
                              Apri la giornata
                            </Link>
                          </span>
                        </p>
                      )}
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label={`Riapri ${dayFormat.format(dateOfKey(date))}`}
                      title='Riapri'
                      onClick={() => remove(date)}
                    >
                      <X className='size-4' />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {past.length > 0 && (
            <details className='rounded-lg border bg-card px-4 py-3 text-sm'>
              <summary className='cursor-pointer text-muted-foreground'>
                Chiusure passate ({past.length})
              </summary>
              <ul className='mt-3 flex flex-wrap gap-2'>
                {past.map(date => (
                  <li key={date} className='flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3'>
                    {dateOfKey(date).toLocaleDateString('it-IT')}
                    <Button variant='ghost' size='icon' className='size-6' aria-label='Togli' onClick={() => remove(date)}>
                      <X className='size-3.5' />
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
