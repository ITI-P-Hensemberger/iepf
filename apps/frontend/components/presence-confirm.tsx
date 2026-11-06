'use client'

// Presence decides whether the hour counts and, for an absence, warns the admins: every
// change is confirmed first, wherever tutors and admins mark it.
import * as React from 'react'

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

export type PresenceRequest = {
  studentName: string
  // true: present, false: absent, null: take the mark back.
  present: boolean | null
  run: () => Promise<void> | void
}

export function usePresenceConfirm() {
  const [request, setRequest] = React.useState<PresenceRequest | null>(null)
  const [busy, setBusy] = React.useState(false)

  const confirm = async () => {
    if (!request) return
    setBusy(true)
    try {
      await request.run()
    } finally {
      setBusy(false)
      setRequest(null)
    }
  }

  const title = !request
    ? ''
    : request.present === null
      ? `Togliere la presenza di ${request.studentName}?`
      : `Segnare ${request.studentName} ${request.present ? 'presente' : 'assente'}?`
  const description = !request
    ? ''
    : request.present === true
      ? 'Lo studente potrà lasciare un feedback sulla lezione.'
      : request.present === false
        ? 'Gli organizzatori ricevono un avviso dell\'assenza.'
        : 'La lezione tornerà senza presenza segnata per questo studente.'

  const dialog = (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && !busy && setRequest(null)}>
      <AlertDialogContent className='sm:max-w-md'>
        <AlertDialogHeader className='text-left sm:text-left'>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className='text-left'>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Indietro</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {busy ? 'Salvataggio...' : 'Conferma'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { ask: setRequest, dialog }
}
