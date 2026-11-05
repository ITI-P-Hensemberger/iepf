'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  currentSubscription,
  detectPushSupport,
  disablePush,
  enablePush,
  refreshPushSubscription,
  type PushCategory,
  type PushPreferences,
  type PushSupport
} from '@/lib/push-client'

const CATEGORY_LABELS: Array<{ key: PushCategory, label: string, description: string, tutorDescription?: string }> = [
  { key: 'bookings', label: 'Prenotazioni', description: 'Conferme, annullamenti e spostamenti delle lezioni.' },
  { key: 'reminders', label: 'Promemoria', description: 'Le lezioni del giorno e del giorno dopo.' },
  { key: 'feedback', label: 'Feedback', description: 'Lezioni concluse che aspettano il tuo feedback.' },
  { key: 'account', label: 'Account', description: 'Attivazione o disattivazione del tuo account.' },
  {
    key: 'lessons',
    label: 'Nuove lezioni',
    description: 'Nuove lezioni disponibili da prenotare.',
    tutorDescription: 'Lezioni create per te dalla scuola o dal calendario settimanale.'
  }
]

type DeviceState = 'loading' | 'off' | 'on' | 'blocked'

export function NotificationSettings({ role }: { role: 'student' | 'tutor' }) {
  const [support, setSupport] = React.useState<PushSupport | null>(null)
  const [device, setDevice] = React.useState<DeviceState>('loading')
  const [preferences, setPreferences] = React.useState<PushPreferences | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    // Nothing is asked here: the permission prompt only follows a click on "Attiva".
    void (async () => {
      const detected = detectPushSupport()
      const usable = detected === 'supported' && Notification.permission !== 'denied'
      const subscribed = usable ? Boolean(await currentSubscription().catch(() => null)) : false
      if (subscribed) {
        await refreshPushSubscription().catch(() => undefined)
      }
      setSupport(detected)
      if (detected === 'supported' && Notification.permission === 'denied') {
        setDevice('blocked')
      } else {
        setDevice(subscribed && Notification.permission === 'granted' ? 'on' : 'off')
      }
    })()
  }, [])

  React.useEffect(() => {
    void (async () => {
      const response = await fetch('/api/notifications/preferences', { cache: 'no-store' })
      if (response.ok) {
        setPreferences(await response.json() as PushPreferences)
      }
    })()
  }, [])

  async function handleEnable() {
    setBusy(true)
    try {
      await enablePush()
      setDevice('on')
      toast.success('Notifiche attivate su questo dispositivo.')
    } catch (error) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setDevice('blocked')
      }
      toast.error(error instanceof Error ? error.message : 'Non è stato possibile attivare le notifiche.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    try {
      await disablePush()
      setDevice('off')
      toast.success('Notifiche disattivate su questo dispositivo.')
    } catch {
      toast.error('Non è stato possibile disattivare le notifiche.')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(key: PushCategory, value: boolean) {
    const previous = preferences
    setPreferences(current => (current ? { ...current, [key]: value } : current))
    const response = await fetch('/api/notifications/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    })
    if (!response.ok) {
      setPreferences(previous)
      toast.error(response.status === 403
        ? 'Le preferenze si cambiano solo dal proprio account.'
        : 'Non è stato possibile salvare la preferenza.')
    }
  }

  const categories = CATEGORY_LABELS.map(category => ({
    ...category,
    description: role === 'tutor' ? category.tutorDescription ?? category.description : category.description
  }))

  return (
    <Card className='mt-6'>
      <CardHeader>
        <CardTitle>Notifiche</CardTitle>
        <CardDescription>
          Ricevi sul telefono o sul computer gli avvisi che oggi arrivano per email. Le email
          continuano ad arrivare comunque. Le notifiche mostrano solo materia e orario.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        <div className='flex flex-col gap-3'>
          <p className='text-sm font-medium'>Questo dispositivo</p>
          {support === 'ios-needs-install' && (
            <p className='text-sm text-muted-foreground'>
              Su iPhone e iPad le notifiche funzionano solo dall&apos;app nella schermata Home: in Safari
              tocca <strong>Condividi</strong>, poi <strong>Aggiungi alla schermata Home</strong>, apri IEPF
              da lì e torna su questa pagina. Serve iOS 16.4 o successivo.
            </p>
          )}
          {support === 'unsupported' && (
            <p className='text-sm text-muted-foreground'>
              Questo browser non supporta le notifiche push.
            </p>
          )}
          {support === 'supported' && device === 'blocked' && (
            <p className='text-sm text-muted-foreground'>
              Le notifiche sono bloccate per questo sito. Per riceverle, consentile dalle impostazioni
              del browser e ricarica la pagina.
            </p>
          )}
          {support === 'supported' && (device === 'off' || device === 'loading') && (
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-sm text-muted-foreground'>
                Le notifiche non sono attive su questo dispositivo.
              </p>
              <Button type='button' onClick={handleEnable} disabled={busy || device === 'loading'}>
                {busy ? 'Attivazione...' : 'Attiva le notifiche'}
              </Button>
            </div>
          )}
          {support === 'supported' && device === 'on' && (
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-sm text-muted-foreground'>
                Le notifiche sono attive su questo dispositivo, anche quando esci dall&apos;account.
              </p>
              <Button type='button' variant='outline' onClick={handleDisable} disabled={busy}>
                {busy ? 'Disattivazione...' : 'Disattiva'}
              </Button>
            </div>
          )}
        </div>

        {preferences && (
          <div className='flex flex-col gap-3'>
            <p className='text-sm font-medium'>Cosa ricevere (su tutti i tuoi dispositivi)</p>
            {categories.map(category => (
              <div key={category.key} className='flex items-start gap-3'>
                <Checkbox
                  id={`push-${category.key}`}
                  checked={preferences[category.key]}
                  onCheckedChange={value => void handleToggle(category.key, value === true)}
                />
                <div className='grid gap-1'>
                  <Label htmlFor={`push-${category.key}`}>{category.label}</Label>
                  <p className='text-sm text-muted-foreground'>{category.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
