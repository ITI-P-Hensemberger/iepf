'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { BackButton } from '@/components/back-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type Role = 'student' | 'tutor' | 'admin' | 'activator'
type MessageLevel = 'info' | 'warning' | 'error' | 'success'

type MaintenanceSettings = {
  enabled: boolean
  message: string | null
  roles?: Role[]
}

type ServiceMessage = {
  enabled: boolean
  level: MessageLevel
  title: string
  body: string
}

type SettingsPayload = {
  maintenance: MaintenanceSettings
  serviceMessages: Record<Role, ServiceMessage | null>
}

const roleOptions: Role[] = ['student', 'tutor', 'admin', 'activator']
const maintenanceRoleOptions: Role[] = ['student', 'tutor']
const levelOptions: MessageLevel[] = ['info', 'warning', 'error', 'success']

function buildDefaultServiceMessage(): ServiceMessage {
  return {
    enabled: false,
    level: 'info',
    title: '',
    body: ''
  }
}

function normalizeSettings(payload: unknown): SettingsPayload {
  const fallback: SettingsPayload = {
    maintenance: {
      enabled: false,
      message: null,
      roles: [...roleOptions]
    },
    serviceMessages: {
      student: null,
      tutor: null,
      admin: null,
      activator: null
    }
  }

  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const data = payload as Partial<SettingsPayload>
  const maintenance = data.maintenance ?? fallback.maintenance

  const serviceMessages = {
    student: data.serviceMessages?.student ?? null,
    tutor: data.serviceMessages?.tutor ?? null,
    admin: data.serviceMessages?.admin ?? null,
    activator: data.serviceMessages?.activator ?? null
  }

  return { maintenance, serviceMessages }
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = React.useState<SettingsPayload>(
    normalizeSettings(null)
  )
  const [serviceMessageState, setServiceMessageState] = React.useState<
    Record<Role, ServiceMessage>
  >({
    student: buildDefaultServiceMessage(),
    tutor: buildDefaultServiceMessage(),
    admin: buildDefaultServiceMessage(),
    activator: buildDefaultServiceMessage()
  })
  const [initialSnapshot, setInitialSnapshot] = React.useState<string | null>(
    null
  )
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let isMounted = true

    async function loadSettings() {
      setLoading(true)
      try {
        const response = await fetch('/api/settings')
        if (!response.ok) {
          throw new Error('Impossibile caricare le impostazioni.')
        }
        const payload = await response.json()
        if (!isMounted) return
        const normalized = normalizeSettings(payload)
        const maintenanceRoles = (normalized.maintenance.roles ?? []).filter(
          (role) => role === 'student' || role === 'tutor'
        )
        normalized.maintenance = {
          ...normalized.maintenance,
          roles: maintenanceRoles
        }
        setSettings(normalized)
        setServiceMessageState({
          student:
            normalized.serviceMessages.student ?? buildDefaultServiceMessage(),
          tutor:
            normalized.serviceMessages.tutor ?? buildDefaultServiceMessage(),
          admin:
            normalized.serviceMessages.admin ?? buildDefaultServiceMessage(),
          activator:
            normalized.serviceMessages.activator ?? buildDefaultServiceMessage()
        })
        setInitialSnapshot(JSON.stringify(normalized))
      } catch (err) {
        if (!isMounted) return
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le impostazioni.'
        )
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadSettings()

    return () => {
      isMounted = false
    }
  }, [])

  const toggleRole = React.useCallback((role: Role) => {
    setSettings((prev) => {
      const roles = new Set(prev.maintenance.roles ?? [])
      if (roles.has(role)) {
        roles.delete(role)
      } else {
        roles.add(role)
      }
      return {
        ...prev,
        maintenance: {
          ...prev.maintenance,
          roles: Array.from(roles)
        }
      }
    })
  }, [])

  const handleSave = React.useCallback(async () => {
    const nextPayload: SettingsPayload = {
      maintenance: {
        enabled: settings.maintenance.enabled,
        message: settings.maintenance.message?.trim() || null,
        roles: (settings.maintenance.roles ?? []).filter(
          (role) => role === 'student' || role === 'tutor'
        )
      },
      serviceMessages: {
        student: serviceMessageState.student.enabled
          ? serviceMessageState.student
          : null,
        tutor: serviceMessageState.tutor.enabled
          ? serviceMessageState.tutor
          : null,
        admin: serviceMessageState.admin.enabled
          ? serviceMessageState.admin
          : null,
        activator: serviceMessageState.activator.enabled
          ? serviceMessageState.activator
          : null
      }
    }

    for (const role of roleOptions) {
      const message = nextPayload.serviceMessages[role]
      if (!message) continue
      if (!message.title.trim() || !message.body.trim()) {
        toast.error('Compila titolo e messaggio per i servizi abilitati.')
        return
      }
    }

    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPayload)
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(
          payload?.message || 'Impossibile salvare le impostazioni.'
        )
      }
      const payload = await response.json()
      const normalized = normalizeSettings(payload)
      const maintenanceRoles = (normalized.maintenance.roles ?? []).filter(
        (role) => role === 'student' || role === 'tutor'
      )
      normalized.maintenance = {
        ...normalized.maintenance,
        roles: maintenanceRoles
      }
      setSettings(normalized)
      setServiceMessageState({
        student:
          normalized.serviceMessages.student ?? buildDefaultServiceMessage(),
        tutor: normalized.serviceMessages.tutor ?? buildDefaultServiceMessage(),
        admin: normalized.serviceMessages.admin ?? buildDefaultServiceMessage(),
        activator:
          normalized.serviceMessages.activator ?? buildDefaultServiceMessage()
      })
      setInitialSnapshot(JSON.stringify(normalized))
      toast.success('Impostazioni salvate.')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile salvare le impostazioni.'
      )
    } finally {
      setSaving(false)
    }
  }, [serviceMessageState, settings.maintenance])

  const isDirty = React.useMemo(() => {
    const snapshot = JSON.stringify({
      maintenance: settings.maintenance,
      serviceMessages: {
        student: serviceMessageState.student.enabled
          ? serviceMessageState.student
          : null,
        tutor: serviceMessageState.tutor.enabled
          ? serviceMessageState.tutor
          : null,
        admin: serviceMessageState.admin.enabled
          ? serviceMessageState.admin
          : null,
        activator: serviceMessageState.activator.enabled
          ? serviceMessageState.activator
          : null
      }
    })
    return snapshot !== (initialSnapshot ?? '')
  }, [initialSnapshot, serviceMessageState, settings.maintenance])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl space-y-6'>
          <div className='mb-6 self-start'>
            <BackButton />
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Impostazioni globali</h1>
            <Button onClick={handleSave} disabled={loading || saving || !isDirty}>
              {saving ? 'Salvataggio...' : 'Salva modifiche'}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Modalità manutenzione</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex items-start gap-3'>
                <Checkbox
                  id='maintenance-enabled'
                  checked={settings.maintenance.enabled}
                  onCheckedChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      maintenance: {
                        ...prev.maintenance,
                        enabled: Boolean(value)
                      }
                    }))
                  }
                />
                <label
                  htmlFor='maintenance-enabled'
                  className='text-sm text-muted-foreground'
                >
                  Abilita modalità manutenzione
                </label>
              </div>

              <Field className='gap-2'>
                <FieldLabel>Messaggio manutenzione</FieldLabel>
                <Textarea
                  value={settings.maintenance.message ?? ''}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      maintenance: {
                        ...prev.maintenance,
                        message: event.target.value
                      }
                    }))
                  }
                  placeholder='Messaggio visibile agli utenti durante la manutenzione.'
                  maxLength={500}
                  rows={4}
                />
                <div className='text-xs text-muted-foreground'>
                  {(settings.maintenance.message ?? '').length}/500
                </div>
              </Field>

              <Field className='gap-2'>
                <FieldLabel>Ruoli coinvolti</FieldLabel>
                <div className='grid gap-2 sm:grid-cols-2'>
                  {maintenanceRoleOptions.map((role) => (
                    <label
                      key={role}
                      className='flex items-center gap-2 text-sm'
                    >
                      <Checkbox
                        checked={(settings.maintenance.roles ?? []).includes(
                          role
                        )}
                        onCheckedChange={() => toggleRole(role)}
                      />
                      <span className='capitalize'>{role}</span>
                    </label>
                  ))}
                </div>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Messaggi di servizio</CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              {roleOptions.map((role) => {
                const message = serviceMessageState[role]
                return (
                  <div key={role} className='rounded-lg border p-4 space-y-4'>
                    <div className='flex items-center justify-between'>
                      <div className='text-sm font-semibold capitalize'>
                        {role}
                      </div>
                      <div className='flex items-center gap-2'>
                        <Checkbox
                          id={`service-${role}-enabled`}
                          checked={message.enabled}
                          onCheckedChange={(value) =>
                            setServiceMessageState((prev) => ({
                              ...prev,
                              [role]: {
                                ...prev[role],
                                enabled: Boolean(value)
                              }
                            }))
                          }
                        />
                        <label
                          htmlFor={`service-${role}-enabled`}
                          className='text-sm text-muted-foreground'
                        >
                          Abilita
                        </label>
                      </div>
                    </div>

                    <div className='grid gap-4 md:grid-cols-2'>
                      <Field className='gap-2'>
                        <FieldLabel>Livello</FieldLabel>
                        <Select
                          value={message.level}
                          onValueChange={(value) =>
                            setServiceMessageState((prev) => ({
                              ...prev,
                              [role]: {
                                ...prev[role],
                                level: value as MessageLevel
                              }
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Seleziona livello' />
                          </SelectTrigger>
                          <SelectContent>
                            {levelOptions.map((level) => (
                              <SelectItem key={level} value={level}>
                                {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Titolo</FieldLabel>
                        <Input
                          value={message.title}
                          onChange={(event) =>
                            setServiceMessageState((prev) => ({
                              ...prev,
                              [role]: {
                                ...prev[role],
                                title: event.target.value
                              }
                            }))
                          }
                          placeholder='Titolo messaggio'
                          maxLength={120}
                        />
                        <div className='text-xs text-muted-foreground'>
                          {message.title.length}/120
                        </div>
                      </Field>
                    </div>

                    <Field className='gap-2'>
                      <FieldLabel>Messaggio</FieldLabel>
                      <Textarea
                        value={message.body}
                        onChange={(event) =>
                          setServiceMessageState((prev) => ({
                            ...prev,
                            [role]: {
                              ...prev[role],
                              body: event.target.value
                            }
                          }))
                        }
                        placeholder='Messaggio visibile agli utenti'
                        maxLength={1000}
                        rows={4}
                      />
                      <div className='text-xs text-muted-foreground'>
                        {message.body.length}/1000
                      </div>
                    </Field>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
