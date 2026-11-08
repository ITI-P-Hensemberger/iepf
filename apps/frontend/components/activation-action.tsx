'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { DangerAction } from '@/components/danger-zone'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { capitalizeFirst } from '@/lib/capitalize'

const REASON_MAX = 500

type ActivationEvent = {
  id: string
  kind: 'activated' | 'deactivated' | 'reactivated'
  reason: string | null
  actorName: string
  actorRole: string
  createdAt: string
}

const KIND_LABELS: Record<ActivationEvent['kind'], string> = {
  activated: 'Prima attivazione',
  deactivated: 'Disattivazione',
  reactivated: 'Riattivazione'
}

const ROLE_LABELS: Record<string, string> = { admin: 'admin', activator: 'attivatore' }

const dateTime = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome'
})

// Every activation and deactivation, newest first; loaded when opened, again after a change.
function ActivationHistory({ userId, version }: { userId: string, version: number }) {
  const [open, setOpen] = React.useState(false)
  const [events, setEvents] = React.useState<ActivationEvent[] | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let current = true
    fetch(`/api/users/${userId}/activation-history`, { cache: 'no-store' })
      .then(response => (response.ok ? response.json() as Promise<ActivationEvent[]> : Promise.reject(new Error('history'))))
      .then((data) => {
        if (current) {
          setEvents([...data].reverse())
          setError(false)
        }
      })
      .catch(() => current && setError(true))
    return () => {
      current = false
    }
  }, [open, userId, version])

  return (
    <Accordion type='single' collapsible onValueChange={value => setOpen(value === 'history')} className='px-4 sm:px-6'>
      <AccordionItem value='history' className='border-b-0'>
        <AccordionTrigger>Storico attivazioni</AccordionTrigger>
        <AccordionContent>
          {error
            ? <p className='text-sm text-muted-foreground'>Impossibile caricare lo storico.</p>
            : events === null
              ? <p className='text-sm text-muted-foreground'>Caricamento...</p>
              : events.length === 0
                ? <p className='text-sm text-muted-foreground'>Nessuna operazione registrata. Le operazioni precedenti all’introduzione dello storico non compaiono.</p>
                : (
                    <ol className='space-y-3'>
                      {events.map(event => (
                        <li key={event.id} className='rounded-lg border bg-muted/40 p-3 text-sm'>
                          <div className='flex flex-wrap items-baseline justify-between gap-x-3'>
                            <span className={event.kind === 'deactivated' ? 'font-medium text-destructive' : 'font-medium'}>
                              {KIND_LABELS[event.kind]}
                            </span>
                            <span className='text-xs text-muted-foreground tabular-nums'>{dateTime.format(new Date(event.createdAt))}</span>
                          </div>
                          <p className='mt-1 text-muted-foreground'>
                            Da {event.actorName}{ROLE_LABELS[event.actorRole] ? ` (${ROLE_LABELS[event.actorRole]})` : ''}
                          </p>
                          {event.reason && <p className='mt-1 whitespace-pre-line'>Motivo: {event.reason}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

// Turning an account on or off, in the danger zone of a user's page. Deactivating takes an
// optional reason, sent to the user by mail and notification.
export function ActivationAction({
  userId,
  isActive,
  who,
  onChange
}: {
  userId: string
  isActive: boolean
  who: string
  onChange: (isActive: boolean) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [version, setVersion] = React.useState(0)
  const next = !isActive

  async function confirm(event: React.MouseEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next ? { isActive: true } : { isActive: false, deactivationReason: reason.trim() })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(payload?.message ?? 'Impossibile aggiornare l’account.')
      }
      toast.success(next ? 'Account attivato.' : 'Account disattivato.')
      onChange(next)
      setVersion(value => value + 1)
      setOpen(false)
      setReason('')
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossibile aggiornare l’account.')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DangerAction
        title={isActive ? 'Disattiva account' : 'Attiva account'}
        description={isActive
          ? `${who} non potrà più usare la piattaforma finché non viene riattivato.`
          : `${who} potrà accedere e usare la piattaforma.`}
        action={(
          <Button variant={isActive ? 'destructive' : 'default'} onClick={() => setOpen(true)}>
            {isActive ? 'Disattiva account' : 'Attiva account'}
          </Button>
        )}
      />
      <ActivationHistory userId={userId} version={version} />
      <AlertDialog open={open} onOpenChange={value => !busy && setOpen(value)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isActive ? 'Disattivare l’account?' : 'Attivare l’account?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? 'Riceverà una mail e una notifica. Se scrivi il motivo, lo leggerà lì e nella pagina che vede all’accesso.'
                : 'Riceverà una mail e una notifica.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isActive && (
            <div className='space-y-2'>
              <Label htmlFor='deactivation-reason'>Motivo (facoltativo)</Label>
              <Textarea
                id='deactivation-reason'
                value={reason}
                maxLength={REASON_MAX}
                onChange={event => setReason(capitalizeFirst(event.target.value))}
                placeholder='Es. Pagamento non ricevuto.'
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirm}
              disabled={busy}
              className={isActive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
            >
              {busy ? 'Salvataggio...' : isActive ? 'Disattiva' : 'Attiva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
