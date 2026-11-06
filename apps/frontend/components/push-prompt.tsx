'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BellRing, X } from 'lucide-react'

import { popupFrameClassName } from '@/components/announcement-popup'
import { type PushRole, PushSetupGuide, setupTitle } from '@/components/push-setup-guide'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fetchDeviceCount, isImpersonating, isPushConfigured, readPushEnvironment } from '@/lib/push-client'
import { type PushSetupState, pushSetupState } from '@/lib/push-platform'
import { readPromptState, shouldPrompt, snooze } from '@/lib/push-prompt'

const OPEN_EVENT = 'iepf:open-push-setup'
const CHANGED_EVENT = 'iepf:push-setup-changed'
export const SETUP_PARAM = 'attiva-notifiche'
// Set by the tutor onboarding right before the redirect to the tutor home.
export const TUTOR_ONBOARDED_FLAG = 'iepf:push-invite:onboarded'

const PUSH_ROLES = new Set<string>(['student', 'tutor', 'admin'])

export function isPushRole(role: string | null | undefined): role is PushRole {
  return PUSH_ROLES.has(role ?? '')
}

// Opens the setup popup from anywhere: the menu entry, the profile warning.
export function openPushSetup() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

// What, if anything, this device still needs. null: nothing to offer here.
export function usePushSetup(role: string | null | undefined) {
  const [state, setState] = React.useState<PushSetupState | null>(null)

  const evaluate = React.useCallback(async () => {
    if (!isPushRole(role) || isImpersonating() || !(await isPushConfigured())) {
      setState(null)
      return
    }
    const next = pushSetupState(await readPushEnvironment())
    if (next === 'enabled' || next === 'unsupported') {
      setState(null)
      return
    }
    // A computer only asks when no device receives push yet: the phone is what matters.
    if (next === 'desktop' && (await fetchDeviceCount()) !== 0) {
      setState(null)
      return
    }
    setState(next)
  }, [role])

  React.useEffect(() => {
    void evaluate()
    const handleChange = () => void evaluate()
    window.addEventListener(CHANGED_EVENT, handleChange)
    return () => window.removeEventListener(CHANGED_EVENT, handleChange)
  }, [evaluate])

  return state
}

export function notifyPushSetupChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

// The system popup: always on, not editable, after the admin popups.
export function PushPrompt({ userId, role }: { userId: string, role: PushRole }) {
  const router = useRouter()
  const available = usePushSetup(role)
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<PushSetupState | 'done' | null>(null)
  // The link from the QR code or the email: asked for, so it skips the "later" schedule.
  const [forced] = React.useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get(SETUP_PARAM) === '1'
  )

  React.useEffect(() => {
    if (!available) return
    if (forced || shouldPrompt(readPromptState(window.localStorage, userId))) {
      setState(available)
      setOpen(true)
    }
  }, [available, forced, userId])

  React.useEffect(() => {
    const handleOpen = () => {
      if (available) {
        setState(available)
        setOpen(true)
      }
    }
    window.addEventListener(OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(OPEN_EVENT, handleOpen)
  }, [available])

  // Once done, close by itself after a moment.
  React.useEffect(() => {
    if (state !== 'done') return
    const timer = window.setTimeout(() => setOpen(false), 3_000)
    return () => window.clearTimeout(timer)
  }, [state])

  const close = React.useCallback(() => {
    if (state !== 'done') {
      snooze(window.localStorage, userId)
    }
    setOpen(false)
    notifyPushSetupChanged()
    if (forced) {
      const url = new URL(window.location.href)
      url.searchParams.delete(SETUP_PARAM)
      router.replace(`${url.pathname}${url.search}`)
    }
  }, [forced, router, state, userId])

  if (!open || !state) {
    return null
  }

  return (
    <AlertDialog open onOpenChange={next => !next && close()}>
      <AlertDialogContent className={popupFrameClassName}>
        <AlertDialogHeader className='shrink-0 border-b px-5 pt-5 pb-3 text-left sm:px-6'>
          <AlertDialogTitle className='flex items-center gap-2 text-lg leading-snug'>
            <BellRing className='size-5 shrink-0 text-primary' />
            {setupTitle(state)}
          </AlertDialogTitle>
          <AlertDialogDescription className='sr-only'>
            Come attivare le notifiche di IEPF su questo dispositivo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6' tabIndex={0}>
          <PushSetupGuide state={state} userId={userId} role={role} onStateChange={setState} />
        </div>
        <AlertDialogFooter className='shrink-0 border-t px-5 py-3 sm:px-6'>
          <AlertDialogCancel onClick={close}>{state === 'done' ? 'Chiudi' : 'Più tardi'}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// The same request inside a page, at the moment it makes sense. It follows the popup's
// "later" schedule, so the two never insist together.
export function PushInviteCard({
  userId,
  role,
  title,
  description
}: {
  userId: string | null | undefined
  role: string | null | undefined
  title: string
  description: string
}) {
  const available = usePushSetup(role)
  const [state, setState] = React.useState<PushSetupState | 'done' | null>(null)
  const [hidden, setHidden] = React.useState(false)

  React.useEffect(() => {
    if (available && userId && shouldPrompt(readPromptState(window.localStorage, userId))) {
      setState(available)
    }
  }, [available, userId])

  if (!userId || !isPushRole(role) || !state || hidden) {
    return null
  }

  const dismiss = () => {
    if (state !== 'done') {
      snooze(window.localStorage, userId)
    }
    setHidden(true)
    notifyPushSetupChanged()
  }

  return (
    <Card className='border-primary/40 py-4'>
      <CardContent className='space-y-3 px-4 sm:px-6'>
        <div className='flex items-start gap-3'>
          <BellRing className='mt-0.5 size-5 shrink-0 text-primary' />
          <div className='min-w-0 flex-1'>
            <p className='font-semibold'>{state === 'done' ? setupTitle('done') : state === 'desktop' ? setupTitle('desktop') : title}</p>
            {state !== 'done' && state !== 'desktop' && (
              <p className='text-sm text-muted-foreground'>{description}</p>
            )}
          </div>
          <Button type='button' variant='ghost' size='icon' className='-mt-1 -mr-2 size-8' aria-label={state === 'done' ? 'Chiudi' : 'Più tardi'} onClick={dismiss}>
            <X className='size-4' />
          </Button>
        </div>
        <div className='mx-auto max-w-md'>
          <PushSetupGuide state={state} userId={userId} role={role} onStateChange={setState} showReason={false} />
        </div>
        {state !== 'done' && (
          <button type='button' className='w-full text-center text-xs text-muted-foreground underline underline-offset-4' onClick={dismiss}>
            Più tardi
          </button>
        )}
      </CardContent>
    </Card>
  )
}
