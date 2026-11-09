'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { notifyPushSetupChanged, openPushSetup } from '@/components/push-prompt'
import { PushSetupGuide } from '@/components/push-setup-guide'
import {
  disablePush,
  enablePush,
  fetchDeviceCount,
  readPushEnvironment,
  refreshPushSubscription,
  emailPreference,
  type AdminCategory,
  type PreferenceKey,
  type PushPreferences,
  type UserCategory
} from '@/lib/push-client'
import { type PushSetupState, pushSetupState } from '@/lib/push-platform'
import { setOptedOut } from '@/lib/push-prompt'
import { apiFetch, jsonBody } from '@/lib/api-fetch'

const PREFERENCES_KEY = ['notification-preferences']
const DEVICE_KEY = ['push-device']

const USER_LABELS: Array<{
  key: UserCategory
  label: string
  description: string
  tutorDescription?: string
}> = [
  {
    key: 'bookings',
    label: 'Prenotazioni',
    description: 'Conferme, annullamenti e spostamenti delle lezioni.'
  },
  {
    key: 'reminders',
    label: 'Promemoria',
    description: 'Le lezioni del giorno e del giorno dopo.'
  },
  {
    key: 'feedback',
    label: 'Feedback',
    description: 'Lezioni concluse che aspettano il tuo feedback.'
  },
  {
    key: 'account',
    label: 'Account',
    description: 'Attivazione o disattivazione del tuo account.'
  },
  {
    key: 'lessons',
    label: 'Nuove lezioni',
    description: 'Nuove lezioni disponibili da prenotare.',
    tutorDescription: 'Lezioni assegnate a te automaticamente o dai gestori.'
  }
]

const ADMIN_LABELS: Array<{
  key: AdminCategory
  label: string
  description: string
}> = [
  {
    key: 'adminLowFeedback',
    label: 'Feedback bassi',
    description: 'Voto 2 o meno, dato da uno studente o da un tutor.'
  },
  {
    key: 'adminLateCancellations',
    label: "Annullamenti dell'ultimo momento",
    description: 'Uno studente annulla una lezione il giorno stesso.'
  },
  {
    key: 'adminAbsences',
    label: 'Assenze',
    description: 'Ogni volta che uno studente viene segnato assente.'
  },
  {
    key: 'adminEmptyWeek',
    label: 'Settimana senza lezioni',
    description:
      'La generazione del sabato non crea lezioni per una settimana con giorni di scuola.'
  },
  {
    key: 'adminPendingAdmins',
    label: 'Admin in attesa',
    description:
      "Ogni mattina, se qualcuno ha accettato l'invito e aspetta l'attivazione."
  },
  {
    key: 'adminSubjectRequests',
    label: 'Richieste di materie',
    description: 'Ogni mattina, le richieste delle ultime 24 ore.'
  }
]

export function NotificationSettings({
  role,
  userId
}: {
  role: 'student' | 'tutor' | 'admin'
  userId: string
}) {
  const queryClient = useQueryClient()
  // Without them the section simply shows no switches.
  const { data: preferences = null } = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: () => apiFetch<PushPreferences>('/api/notifications/preferences', 'Impossibile caricare le preferenze.'),
    meta: { inline: true }
  })

  // This device's push state and how many devices get push. Nothing is asked here: the
  // permission prompt only follows a click on "Attiva".
  const deviceQuery = useQuery({
    queryKey: DEVICE_KEY,
    queryFn: async () => {
      const state = pushSetupState(await readPushEnvironment())
      if (state === 'enabled') {
        await refreshPushSubscription().catch(() => undefined)
      }
      return { state, count: await fetchDeviceCount() }
    },
    gcTime: 0,
    retry: false,
    meta: { inline: true }
  })
  // The setup guide moves through its steps here, until the device is read again.
  const [guideState, setGuideState] = React.useState<PushSetupState | 'done' | null>(null)
  const device: PushSetupState | 'done' | 'loading' = guideState ?? deviceQuery.data?.state ?? 'loading'
  const deviceCount = deviceQuery.data?.count ?? null
  const setDevice = setGuideState

  const changed = React.useCallback(() => {
    notifyPushSetupChanged()
    void queryClient.invalidateQueries({ queryKey: DEVICE_KEY }).then(() => setGuideState(null))
  }, [queryClient])

  // Computers only: phones go through PushSetupGuide.
  const enableHere = useMutation({
    mutationFn: async () => {
      try {
        await enablePush()
      } catch (error) {
        throw error instanceof Error ? error : new Error('Non è stato possibile attivare le notifiche.')
      }
    },
    onSuccess: () => {
      setOptedOut(window.localStorage, userId, false)
      toast.success('Notifiche attivate su questo computer.')
      changed()
    }
  })
  const disable = useMutation({
    mutationFn: () => disablePush().catch(() => {
      throw new Error('Non è stato possibile disattivare le notifiche.')
    }),
    onSuccess: () => {
      // Off on purpose: no more requests on this device.
      setOptedOut(window.localStorage, userId, true)
      toast.success('Notifiche disattivate su questo dispositivo.')
      changed()
    }
  })
  const busy = enableHere.isPending || disable.isPending
  const handleEnableHere = () => enableHere.mutate()
  const handleDisable = () => disable.mutate()

  // Avvisi admin che non arriverebbero da nessuna parte: email spenta e nessun dispositivo.
  const unreachable =
    role === 'admin' && preferences && deviceCount === 0
      ? ADMIN_LABELS.filter(
          (category) => !preferences[emailPreference(category.key)]
        )
      : []

  // The switch moves at once and goes back if the save fails.
  const toggle = useMutation({
    mutationFn: async ({ key, value }: { key: PreferenceKey, value: boolean }) => {
      const response = await fetch('/api/notifications/preferences', jsonBody('PUT', { [key]: value }))
      if (!response.ok) {
        throw new Error(response.status === 403
          ? 'Le preferenze si cambiano solo dal proprio account.'
          : 'Non è stato possibile salvare la preferenza.')
      }
    },
    onMutate: ({ key, value }) => {
      const previous = queryClient.getQueryData<PushPreferences>(PREFERENCES_KEY)
      queryClient.setQueryData<PushPreferences>(PREFERENCES_KEY, (current) => current && { ...current, [key]: value })
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(PREFERENCES_KEY, context?.previous)
    },
    onSuccess: () => {
      // Saved at once: a short confirmation, no "Save" button.
      toast.success('Preferenza salvata.', {
        id: 'notification-preference',
        duration: 1500
      })
    }
  })
  function handleToggle(key: PreferenceKey, value: boolean) {
    toggle.mutate({ key, value })
  }

  const userCategories = USER_LABELS.filter(
    (category) => role !== 'admin' || category.key === 'account'
  ).map((category) => ({
    ...category,
    description:
      role === 'tutor'
        ? (category.tutorDescription ?? category.description)
        : category.description
  }))

  return (
    <section className='space-y-4 rounded-lg border bg-card p-4 sm:p-6'>
      <div className='space-y-1'>
        <h2 className='text-lg font-semibold'>Notifiche</h2>
        <p className='text-sm text-muted-foreground'>
          {role === 'admin'
            ? 'Scegli per ogni avviso se riceverlo come notifica, per email o in entrambi i modi.'
            : role === 'tutor'
              ? 'Ricevi sul telefono gli avvisi su nuove lezioni assegnate, prenotazioni, annullamenti, promemoria e feedback da lasciare.'
              : 'Ricevi sul telefono o sul computer gli avvisi che oggi arrivano per email. Le email continuano ad arrivare comunque. Le notifiche mostrano solo materia e orario.'}
        </p>
      </div>
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-3'>
          <p className='text-sm font-medium'>Questo dispositivo</p>
          {device === 'unsupported' && (
            <p className='text-sm text-muted-foreground'>
              Questo browser non supporta le notifiche push.
            </p>
          )}
          {(device === 'enabled' || device === 'done') && (
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-sm text-muted-foreground'>
                Le notifiche sono attive su questo dispositivo.
              </p>
              <Button
                type='button'
                variant='outline'
                onClick={handleDisable}
                disabled={busy}
              >
                {busy ? 'Disattivazione...' : 'Disattiva'}
              </Button>
            </div>
          )}
          {device === 'desktop' && (
            <div className='flex flex-col gap-3'>
              <p className='text-sm text-muted-foreground'>
                {deviceCount && deviceCount > 0
                  ? `Le notifiche arrivano già su ${deviceCount === 1 ? 'un tuo dispositivo' : `${deviceCount} tuoi dispositivi`}. Su questo computer non sono attive.`
                  : 'Le notifiche non sono attive su nessun tuo dispositivo. Ti consigliamo di attivarle sul telefono.'}
              </p>
              <div className='flex flex-col gap-2 sm:flex-row'>
                {deviceCount === 0 && (
                  <Button type='button' onClick={openPushSetup}>
                    Attivale sul telefono
                  </Button>
                )}
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => void handleEnableHere()}
                  disabled={busy}
                >
                  {busy ? 'Attivazione...' : 'Attiva su questo computer'}
                </Button>
              </div>
            </div>
          )}
          {device !== 'loading' &&
            device !== 'unsupported' &&
            device !== 'enabled' &&
            device !== 'done' &&
            device !== 'desktop' && (
              <PushSetupGuide
                state={device}
                userId={userId}
                role={role}
                showReason={false}
                onStateChange={(next) => {
                  setDevice(next)
                  if (next === 'done') changed()
                }}
              />
            )}
        </div>

        {unreachable.length > 0 && (
          <div className='rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'>
            <p className='font-medium'>
              Questi avvisi non ti arrivano da nessuna parte
            </p>
            <p className='mt-1'>
              Hai spento l&apos;email per{' '}
              {unreachable
                .map((category) => category.label.toLowerCase())
                .join(', ')}{' '}
              e non hai le notifiche attive su nessun dispositivo.
            </p>
            {device !== 'unsupported' && (
              <Button
                type='button'
                size='sm'
                className='mt-3'
                onClick={openPushSetup}
              >
                Attiva le notifiche
              </Button>
            )}
          </div>
        )}

        {preferences && (
          <div className='flex flex-col gap-3'>
            <p className='text-sm font-medium'>
              Cosa ricevere (su tutti i tuoi dispositivi)
            </p>
            {userCategories.map((category) => (
              <div
                key={category.key}
                className='flex items-start justify-between gap-4'
              >
                <div className='grid gap-1'>
                  <Label htmlFor={`push-${category.key}`}>
                    {category.label}
                  </Label>
                  <p className='text-sm text-muted-foreground'>
                    {category.description}
                  </p>
                </div>
                <Switch
                  id={`push-${category.key}`}
                  className='mt-0.5'
                  checked={preferences[category.key]}
                  onCheckedChange={(value) =>
                    void handleToggle(category.key, value)
                  }
                />
              </div>
            ))}
            {role === 'admin' &&
              ADMIN_LABELS.map((category) => (
                <div
                  key={category.key}
                  className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'
                >
                  <div className='grid gap-1'>
                    <p className='text-sm font-medium'>{category.label}</p>
                    <p className='text-sm text-muted-foreground'>
                      {category.description}
                    </p>
                  </div>
                  <div className='flex gap-5 sm:shrink-0'>
                    <div className='flex items-center gap-2'>
                      <Switch
                        id={`push-${category.key}`}
                        checked={preferences[category.key]}
                        onCheckedChange={(value) =>
                          void handleToggle(category.key, value)
                        }
                      />
                      <Label htmlFor={`push-${category.key}`}>Notifica</Label>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Switch
                        id={`email-${category.key}`}
                        checked={preferences[emailPreference(category.key)]}
                        onCheckedChange={(value) =>
                          void handleToggle(
                            emailPreference(category.key),
                            value
                          )
                        }
                      />
                      <Label htmlFor={`email-${category.key}`}>Email</Label>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  )
}
