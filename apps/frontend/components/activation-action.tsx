'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { DangerAction } from '@/components/danger-zone'
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
