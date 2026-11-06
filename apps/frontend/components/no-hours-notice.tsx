'use client'

import * as React from 'react'
import { AlertTriangle, Mail } from 'lucide-react'

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
import { Card, CardContent } from '@/components/ui/card'
import { isDismissedHere, rememberDismissal } from '@/lib/announcement-dismissals'
import { CONTACT_EMAIL, NEW_PACKAGE_MAILTO } from '@/lib/lesson-hours'

function NoHoursText() {
  return (
    <>
      Hai esaurito le ore di lezione del tuo pacchetto, quindi non puoi prenotare altre lezioni.
      Per acquistare un nuovo pacchetto scrivici a{' '}
      <a href={NEW_PACKAGE_MAILTO} className='font-medium underline underline-offset-4'>{CONTACT_EMAIL}</a>.
    </>
  )
}

// In a page, where booking would be: the reason there is nothing to book.
export function NoHoursCard() {
  return (
    <Card className='mt-4 border-amber-500/60'>
      <CardContent className='flex flex-col gap-4 sm:flex-row sm:items-center'>
        <AlertTriangle className='h-6 w-6 shrink-0 text-amber-500' />
        <p className='flex-1 text-sm'><NoHoursText /></p>
        <Button asChild>
          <a href={NEW_PACKAGE_MAILTO}><Mail className='h-4 w-4' /> Scrivici</a>
        </Button>
      </CardContent>
    </Card>
  )
}

// Treated like an every-session popup: it comes back at each login until hours are added.
const NO_HOURS_POPUP = { id: 'no-lesson-hours', dismissMode: 'every_session' as const, title: '', body: '', linkUrl: null, linkLabel: null }

export function NoHoursPopup({ userId, onDone }: { userId: string, onDone: () => void }) {
  const [open, setOpen] = React.useState(() => !isDismissedHere(window.localStorage, userId, NO_HOURS_POPUP))

  React.useEffect(() => {
    if (!open) onDone()
  }, [open, onDone])

  const close = () => {
    rememberDismissal(window.localStorage, userId, NO_HOURS_POPUP)
    setOpen(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && close()}>
      <AlertDialogContent>
        <AlertDialogHeader className='text-left sm:text-left'>
          <AlertDialogTitle className='flex items-center gap-2'>
            <AlertTriangle className='h-5 w-5 text-amber-500' /> Hai finito le ore di lezione
          </AlertDialogTitle>
          <AlertDialogDescription className='text-left'>
            <NoHoursText />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>Chiudi</AlertDialogCancel>
          <AlertDialogAction asChild onClick={close}>
            <a href={NEW_PACKAGE_MAILTO}><Mail className='h-4 w-4' /> Scrivici</a>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
