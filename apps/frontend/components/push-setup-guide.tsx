'use client'

import * as React from 'react'
import qrcode from 'qrcode-generator'
import { CheckCircle2, Copy, Mail, Share, Smartphone, SquarePlus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  emailSetupLink,
  enablePush,
  fetchDeviceCount,
  readPushEnvironment,
  showTestNotification
} from '@/lib/push-client'
import { detectPlatform, type PushSetupState, pushSetupState } from '@/lib/push-platform'
import { notifyPushSetupChanged, readPromptState, rememberIosStep, setOptedOut } from '@/lib/push-prompt'
import { cn } from '@/lib/utils'

export type PushRole = 'student' | 'tutor' | 'admin'

export const SETUP_PATH = '/profile?attiva-notifiche=1'

export const ROLE_REASON: Record<PushRole, string> = {
  student: 'Ricevi promemoria e aggiornamenti su nuove lezioni disponibili.',
  tutor: 'Ricevi avvisi quando uno studente prenota, annulla o quando una lezione subisce cambiamenti.',
  admin: 'Ricevi gli avvisi su feedback bassi, assenze, annullamenti tardivi e richieste in attesa.'
}

export function setupTitle(state: PushSetupState | 'done') {
  switch (state) {
    case 'done': return 'Notifiche attive'
    case 'desktop': return 'Ricevi le notifiche sul telefono'
    case 'denied': return 'Le notifiche sono bloccate'
    case 'resubscribe': return 'Riattiva le notifiche'
    default: return 'Attiva le notifiche'
  }
}

function setupUrl() {
  return new URL(SETUP_PATH, window.location.origin).toString()
}

async function copySetupLink() {
  try {
    await navigator.clipboard.writeText(setupUrl())
    toast.success('Link copiato.')
  } catch {
    toast.error('Copia non riuscita: copia l\'indirizzo dalla barra del browser.')
  }
}

function Step({ index, active, done, icon: Icon, children }: {
  index: number
  active: boolean
  done: boolean
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
        active ? 'border-primary bg-primary/5' : 'border-border',
        done && 'opacity-60'
      )}
      aria-current={active ? 'step' : undefined}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {done ? <CheckCircle2 className='size-4' /> : index + 1}
      </span>
      <div className='min-w-0 flex-1 text-sm leading-relaxed'>{children}</div>
      <Icon className='mt-0.5 size-5 shrink-0 text-muted-foreground' />
    </li>
  )
}

const IOS_STEPS = [
  {
    icon: Share,
    text: (
      <>
        Tocca <strong>Condividi</strong>, in basso al centro (su iPad in alto a destra).
      </>
    )
  },
  {
    icon: SquarePlus,
    text: (
      <>
        Scorri il menu e tocca <strong>Aggiungi alla schermata Home</strong>, poi <strong>Aggiungi</strong>.
      </>
    )
  },
  {
    icon: Smartphone,
    text: (
      <>
        Chiudi Safari e apri <strong>IEPF dall&apos;icona nella schermata Home</strong>: lì attivi le notifiche
        con un tocco.
      </>
    )
  }
]

function IosInstallSteps({ userId }: { userId: string }) {
  const [step, setStep] = React.useState(() => readPromptState(window.localStorage, userId).iosStep)
  const current = Math.min(step, IOS_STEPS.length - 1)

  const go = (next: number) => {
    setStep(next)
    rememberIosStep(window.localStorage, userId, next)
  }

  return (
    <div className='space-y-3'>
      <p className='text-sm text-muted-foreground'>
        Bastano tre passaggi:
      </p>
      <ol className='space-y-2'>
        {IOS_STEPS.map((item, index) => (
          <Step key={index} index={index} active={index === current} done={index < current} icon={item.icon}>
            {item.text}
          </Step>
        ))}
      </ol>
      <div className='flex gap-2'>
        {current > 0 && (
          <Button type='button' variant='outline' className='flex-1' onClick={() => go(current - 1)}>
            Indietro
          </Button>
        )}
        {current < IOS_STEPS.length - 1 && (
          <Button type='button' className='flex-1' onClick={() => go(current + 1)}>
            Fatto, avanti
          </Button>
        )}
      </div>
    </div>
  )
}

function CopyLinkBox() {
  return (
    <div className='space-y-2'>
      <Button type='button' variant='outline' className='w-full' onClick={() => void copySetupLink()}>
        <Copy className='size-4' />
        Copia il link
      </Button>
    </div>
  )
}

function QrCode({ value }: { value: string }) {
  const { size, path } = React.useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const count = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
      }
    }
    return { size: count, path: d }
  }, [value])

  // Always dark on white, in both themes: phone cameras read that best.
  return (
    <svg
      viewBox={`-4 -4 ${size + 8} ${size + 8}`}
      className='size-44 rounded-lg bg-white sm:size-48'
      role='img'
      aria-label='Codice QR per aprire IEPF sul telefono'
      shapeRendering='crispEdges'
    >
      <path d={path} fill='#000' />
    </svg>
  )
}

const POLL_MS = 4_000
const POLL_LIMIT_MS = 10 * 60 * 1000

function DesktopToPhone({ onDone }: { onDone: () => void }) {
  const [sending, setSending] = React.useState(false)
  const url = React.useMemo(() => setupUrl(), [])

  // Watches for the phone: the moment it subscribes, this computer says so.
  React.useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(async () => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        window.clearInterval(timer)
        return
      }
      if (document.visibilityState !== 'visible') return
      const count = await fetchDeviceCount()
      if (count && count > 0) {
        window.clearInterval(timer)
        onDone()
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [onDone])

  async function handleEmail() {
    setSending(true)
    try {
      await emailSetupLink()
      toast.success('Email inviata: aprila dal telefono.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Non è stato possibile mandare l\'email.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className='space-y-4'>
      <p className='text-sm text-muted-foreground'>
        Inquadra il codice QR con la fotocamera del telefono: IEPF si apre e ti guida passo passo.
      </p>
      <div className='flex justify-center'>
        <QrCode value={url} />
      </div>
      <p className='flex items-center justify-center gap-2 text-xs text-muted-foreground'>
        <span className='inline-block size-2 animate-pulse rounded-full bg-primary' aria-hidden />
        Questa finestra si aggiorna da sola quando hai finito.
      </p>
      <div className='space-y-2 border-t pt-4'>
        <p className='text-center text-sm text-muted-foreground'>Non riesci a inquadrarlo?</p>
        <Button type='button' variant='outline' className='w-full' disabled={sending} onClick={() => void handleEmail()}>
          <Mail className='size-4' />
          {sending ? 'Invio...' : 'Mandami il link per email'}
        </Button>
      </div>
    </div>
  )
}

function deniedHelp(userAgent: string, standalone: boolean) {
  const platform = detectPlatform(userAgent, navigator.maxTouchPoints ?? 0)
  if (platform.os === 'ios' && standalone) {
    return 'Apri le Impostazioni dell\'iPhone → Notifiche → IEPF e attiva Consenti notifiche.'
  }
  if (platform.browser === 'samsung') {
    return 'Tocca il menu ☰ → Impostazioni → Siti e download → Notifiche, e consenti IEPF.'
  }
  if (platform.browser === 'firefox') {
    return 'Tocca il lucchetto accanto all\'indirizzo → Notifiche → Consenti.'
  }
  if (platform.os === 'android') {
    return 'Tocca l\'icona a sinistra dell\'indirizzo → Autorizzazioni → Notifiche → Consenti.'
  }
  return 'Clicca l\'icona a sinistra dell\'indirizzo, consenti le notifiche per questo sito e ricarica la pagina.'
}

export function PushSetupGuide({
  state,
  userId,
  role,
  onStateChange,
  showReason = true
}: {
  state: PushSetupState | 'done'
  userId: string
  role: PushRole
  onStateChange: (state: PushSetupState | 'done') => void
  showReason?: boolean
}) {
  const [busy, setBusy] = React.useState(false)
  const [doneOnPhone, setDoneOnPhone] = React.useState(false)
  const [env, setEnv] = React.useState<{ userAgent: string, standalone: boolean } | null>(null)

  React.useEffect(() => {
    void readPushEnvironment().then(value => setEnv({ userAgent: value.userAgent, standalone: value.standalone }))
  }, [])

  const markDone = React.useCallback(() => {
    setOptedOut(window.localStorage, userId, false)
    onStateChange('done')
    notifyPushSetupChanged()
  }, [onStateChange, userId])

  const onPhoneDone = React.useCallback(() => {
    setDoneOnPhone(true)
    markDone()
  }, [markDone])

  async function handleEnable() {
    setBusy(true)
    try {
      await enablePush()
      markDone()
      await showTestNotification().catch(() => undefined)
    } catch (error) {
      const next = pushSetupState(await readPushEnvironment())
      if (next === 'denied') {
        onStateChange('denied')
      } else {
        toast.error(error instanceof Error ? error.message : 'Non è stato possibile attivare le notifiche.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleRecheck() {
    const next = pushSetupState(await readPushEnvironment())
    if (next === 'denied') {
      toast.error('Risultano ancora bloccate. Dopo averle consentite, ricarica la pagina.')
      return
    }
    onStateChange(next)
  }

  const isIosHome = env ? detectPlatform(env.userAgent, 5).os === 'ios' && env.standalone : false

  if (state === 'done') {
    return (
      <div className='flex flex-col items-center gap-3 py-4 text-center'>
        <CheckCircle2 className='size-10 text-emerald-600' />
        <p className='text-sm'>
          {doneOnPhone
            ? 'Fatto! Le notifiche arrivano sul telefono.'
            : 'Fatto! Gli avvisi di IEPF arriveranno su questo dispositivo.'}
        </p>
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      {showReason && state !== 'desktop' && (
        <p className='text-sm'>{ROLE_REASON[role]}</p>
      )}

      {(state === 'ask' || state === 'resubscribe') && (
        <div className='space-y-3'>
          {isIosHome && state === 'ask' && (
            <p className='rounded-lg bg-primary/5 p-3 text-sm'>
              <strong>Ci sei quasi:</strong> ora tocca il pulsante qui sotto e poi <strong>Consenti</strong>.
            </p>
          )}
          <Button type='button' className='w-full' size='lg' disabled={busy} onClick={() => void handleEnable()}>
            {busy ? 'Attivazione...' : state === 'resubscribe' ? 'Riattiva le notifiche' : 'Attiva le notifiche'}
          </Button>
          {state === 'ask' && (
            <p className='text-center text-xs text-muted-foreground'>
              Il telefono ti chiederà il permesso: scegli <strong>Consenti</strong>.
            </p>
          )}
        </div>
      )}

      {state === 'denied' && (
        <div className='space-y-3'>
          <p className='text-sm text-muted-foreground'>
            Su questo dispositivo le notifiche di IEPF sono state bloccate. Per sbloccarle:
          </p>
          <p className='rounded-lg border p-3 text-sm'>{env ? deniedHelp(env.userAgent, env.standalone) : '…'}</p>
          <Button type='button' variant='outline' className='w-full' onClick={() => void handleRecheck()}>
            Ho fatto, ricontrolla
          </Button>
        </div>
      )}

      {state === 'ios-needs-install' && <IosInstallSteps userId={userId} />}

      {state === 'ios-other-browser' && (
        <div className='space-y-3'>
          <p className='text-sm text-muted-foreground'>
            Su iPhone le notifiche si attivano da <strong>Safari</strong>. Copia il link, aprilo in Safari e segui i
            passaggi che compaiono lì.
          </p>
          <CopyLinkBox />
        </div>
      )}

      {state === 'in-app-browser' && (
        <div className='space-y-3'>
          <p className='text-sm text-muted-foreground'>
            Questa pagina è aperta dentro un&apos;app (WhatsApp, Instagram, Telegram...) dove le notifiche non
            funzionano. Tocca il menu <strong>⋯</strong> e scegli <strong>Apri nel browser</strong>, oppure copia il
            link e aprilo tu.
          </p>
          <CopyLinkBox />
        </div>
      )}

      {state === 'desktop' && <DesktopToPhone onDone={onPhoneDone} />}
    </div>
  )
}
