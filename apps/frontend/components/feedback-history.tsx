'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { History } from 'lucide-react'

import { StarRating } from '@/components/star-rating'
import { diffWords } from '@/lib/text-diff'
import { cn } from '@/lib/utils'

export type FeedbackVersion = {
  id: string
  rating: number
  text: string | null
  createdAt: string
  editorRole: string
  editorIsAuthor: boolean
  editorName: string | null
}

type FeedbackHistoryPayload = {
  deletedAt: string | null
  deletedByName: string | null
  versions: FeedbackVersion[]
}

// Shown to an author whose feedback can no longer change.
export const FEEDBACK_LOCKED_NOTICE = 'Non è più modificabile: sono passati 7 giorni dalla lezione.'

function when(iso: string) {
  return format(new Date(iso), "d MMM yyyy', 'HH:mm", { locale: it })
}

// "Modificato 2 volte · ultima modifica di un amministratore": shown under a feedback that changed.
export function feedbackEditSummary(versionCount: number, lastEditorRole: string | null, audience: 'author' | 'admin') {
  const edits = versionCount - 1
  if (edits <= 0) return null
  const times = edits === 1 ? '1 volta' : `${edits} volte`
  const last = lastEditorRole === 'admin'
    ? (audience === 'author' ? 'ultima modifica di un amministratore' : 'ultima modifica di un admin')
    : (audience === 'author' ? 'ultima modifica tua' : 'ultima modifica dell\'autore')
  return `Modificato ${times} · ${last}`
}

function editorLabel(version: FeedbackVersion, audience: 'author' | 'admin') {
  if (audience === 'author') {
    return version.editorIsAuthor ? 'Tu' : 'Amministratore'
  }
  const who = version.editorName ?? 'utente eliminato'
  return version.editorRole === 'admin' ? `Admin · ${who}` : `Autore · ${who}`
}

function ChangedText({ before, after }: { before: string, after: string }) {
  return (
    <>
      {diffWords(before, after).map((part, index) => (
        part.kind === 'same'
          ? <span key={index}>{part.text}</span>
          : part.kind === 'added'
            ? <ins key={index} className='rounded-sm bg-emerald-100 text-emerald-900 no-underline dark:bg-emerald-950 dark:text-emerald-200'>{part.text}</ins>
            : <del key={index} className='rounded-sm bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'>{part.text}</del>
      ))}
    </>
  )
}

// Every version, newest first, each in full: who wrote it, when, its stars and its text, with
// what changed from the version before highlighted. The author reads "Tu" and "Amministratore";
// the admins read the names.
export function FeedbackHistory({ feedbackId, audience }: { feedbackId: string, audience: 'author' | 'admin' }) {
  const [data, setData] = React.useState<FeedbackHistoryPayload | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch(`/api/feedback/${feedbackId}/history`, { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Impossibile caricare la cronologia.')
        if (active) setData(payload as FeedbackHistoryPayload)
      }
      catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Impossibile caricare la cronologia.')
      }
    })()
    return () => {
      active = false
    }
  }, [feedbackId])

  if (error) return <p className='text-sm text-destructive'>{error}</p>
  if (!data) return <p className='text-sm text-muted-foreground'>Caricamento cronologia...</p>

  const { versions } = data
  return (
    <div className='space-y-3'>
      {data.deletedAt && (
        <p className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'>
          Eliminato {data.deletedByName ? `da ${data.deletedByName} ` : ''}il {when(data.deletedAt)}. Non è più visibile all&apos;autore né conteggiato.
        </p>
      )}
      <ol className='ml-1.5 border-l pl-4'>
        {versions.map((version, index) => {
          const previous = versions[index + 1]
          const isCurrent = index === 0
          const ratingChanged = previous && previous.rating !== version.rating
          const textChanged = previous && (previous.text ?? '') !== (version.text ?? '')
          return (
            <li key={version.id} className='relative pb-4 last:pb-0'>
              <span
                aria-hidden
                className={cn(
                  'absolute top-1.5 -left-[22px] size-2.5 rounded-full border-2',
                  isCurrent && !data.deletedAt ? 'border-foreground bg-foreground' : 'border-muted-foreground bg-background'
                )}
              />
              <div className='flex flex-wrap items-center gap-2'>
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 text-xs',
                    version.editorRole === 'admin'
                      ? 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200'
                      : 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200'
                  )}
                >
                  {editorLabel(version, audience)}
                </span>
                <span className='text-xs text-muted-foreground'>
                  {when(version.createdAt)}
                  {isCurrent && !data.deletedAt && ' · versione attuale'}
                  {!previous && ' · prima versione'}
                </span>
              </div>
              <div className='mt-1.5 flex flex-wrap items-center gap-2'>
                <StarRating value={version.rating} size='sm' />
                {previous && (
                  <span className='text-xs text-muted-foreground'>
                    {ratingChanged ? `voto ${previous.rating} → ${version.rating}` : 'voto invariato'}
                    {' · '}
                    {textChanged ? 'testo modificato' : 'testo invariato'}
                  </span>
                )}
              </div>
              <p className='mt-1.5 rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap'>
                {previous && textChanged
                  ? <ChangedText before={previous.text ?? ''} after={version.text ?? ''} />
                  : (version.text || <span className='text-muted-foreground'>Nessun testo</span>)}
              </p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// The line under a feedback, with the history opening below it.
export function FeedbackHistoryToggle({
  feedbackId,
  versionCount,
  lastEditorRole,
  audience,
  className
}: {
  feedbackId: string
  versionCount: number
  lastEditorRole: string | null
  audience: 'author' | 'admin'
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const summary = feedbackEditSummary(versionCount, lastEditorRole, audience)
  if (!summary) return null
  return (
    <div className={cn('space-y-3', className)}>
      <p className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
        <History className='size-3.5' aria-hidden />
        {summary}
        {' · '}
        <button type='button' className='underline underline-offset-4' onClick={() => setOpen(value => !value)}>
          {open ? 'Nascondi cronologia' : 'Vedi cronologia'}
        </button>
      </p>
      {open && <FeedbackHistory feedbackId={feedbackId} audience={audience} />}
    </div>
  )
}
