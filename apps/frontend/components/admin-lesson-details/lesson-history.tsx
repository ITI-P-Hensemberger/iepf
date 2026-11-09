'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-fetch'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

type LessonVersion = {
  startAt: string
  durationMinutes: number
  tutorId: string
  tutorName: string
  subjectId: string | null
  subjectName: string | null
}

type LessonChange = {
  id: string
  before: LessonVersion
  after: LessonVersion
  actorName: string
  actorRole: string
  createdAt: string
}

const dateTime = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome'
})

const subjectLabel = (version: LessonVersion) => version.subjectId === null ? 'Aperta' : (version.subjectName ?? 'Materia eliminata')

// Only what changed, as "before → after".
function changedLines({ before, after }: LessonChange) {
  const lines: string[] = []
  if (before.startAt !== after.startAt) {
    lines.push(`Data: ${dateTime.format(new Date(before.startAt))} → ${dateTime.format(new Date(after.startAt))}`)
  }
  if (before.tutorId !== after.tutorId) {
    lines.push(`Tutor: ${before.tutorName} → ${after.tutorName}`)
  }
  if (before.subjectId !== after.subjectId) {
    lines.push(`Materia: ${subjectLabel(before)} → ${subjectLabel(after)}`)
  }
  if (before.durationMinutes !== after.durationMinutes) {
    lines.push(`Durata: ${before.durationMinutes} → ${after.durationMinutes} min`)
  }
  return lines
}

// Every reschedule of the lesson, newest first; loaded when opened, again after a change.
export function LessonHistory({ lessonId }: { lessonId: string }) {
  const [open, setOpen] = React.useState(false)
  const { data, isError: error } = useQuery({
    queryKey: ['lessons', lessonId, 'history'],
    queryFn: async () => [...await apiFetch<LessonChange[]>(`/api/lessons/${lessonId}/history`, 'Impossibile caricare lo storico.')].reverse(),
    enabled: open,
    meta: { inline: true }
  })
  const changes = data ?? null

  return (
    <section className='rounded-lg border bg-card'>
      <Accordion type='single' collapsible onValueChange={value => setOpen(value === 'history')} className='px-4 sm:px-6'>
        <AccordionItem value='history' className='border-b-0'>
          <AccordionTrigger>Storico modifiche</AccordionTrigger>
          <AccordionContent>
            {error
              ? <p className='text-sm text-muted-foreground'>Impossibile caricare lo storico.</p>
              : changes === null
                ? <p className='text-sm text-muted-foreground'>Caricamento...</p>
                : changes.length === 0
                  ? <p className='text-sm text-muted-foreground'>Nessuna modifica registrata.</p>
                  : (
                      <ol className='space-y-3'>
                        {changes.map(change => (
                          <li key={change.id} className='rounded-lg border bg-muted/40 p-3 text-sm'>
                            <div className='flex flex-wrap items-baseline justify-between gap-x-3'>
                              <span className='font-medium'>Riprogrammata</span>
                              <span className='text-xs text-muted-foreground tabular-nums'>{dateTime.format(new Date(change.createdAt))}</span>
                            </div>
                            <p className='mt-1 text-muted-foreground'>
                              Da {change.actorName}{change.actorRole === 'admin' ? ' (admin)' : ''}
                            </p>
                            {changedLines(change).map(line => <p key={line} className='mt-1'>{line}</p>)}
                          </li>
                        ))}
                      </ol>
                    )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  )
}
