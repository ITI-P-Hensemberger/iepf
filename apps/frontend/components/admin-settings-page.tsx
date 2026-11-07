'use client'

import { AdminSubjectsSettings } from '@/components/admin-subjects-settings'
import { SettingsSection } from '@/components/settings-section'
import AdminAnnouncementsPage from '@/components/admin-announcements-page'
import { AdminClosures } from '@/components/admin-closures'
import { AdminFaqSettings } from '@/components/admin-faq-settings'
import * as React from 'react'
import { toast } from 'sonner'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { type SectionItem, SectionLayout } from '@/components/section-layout'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownEditor } from '@/components/markdown-editor'
import { SchoolYearReset } from '@/components/school-year-reset'
import { ServiceMessageCard } from '@/components/service-message-banner'
import { extractPayloadArray } from '@/lib/backend-response'
import { formatItalianDate } from '@/lib/format-date'
import { BookOpen, CalendarOff, Info, Megaphone, RotateCcw, Wrench, CircleHelp, MessageSquareText } from 'lucide-react'
import { capitalizeFirst } from '@/lib/capitalize'

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
  closureDates: string[]
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
    },
    closureDates: []
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

  const closureDates = Array.isArray(data.closureDates)
    ? data.closureDates.filter((date) => typeof date === 'string')
    : fallback.closureDates

  return { maintenance, serviceMessages, closureDates }
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
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
  const [initialMaintenanceSnapshot, setInitialMaintenanceSnapshot] =
    React.useState<string | null>(null)
  const [initialServiceSnapshot, setInitialServiceSnapshot] = React.useState<
    string | null
  >(null)
  const [initialClosuresSnapshot, setInitialClosuresSnapshot] = React.useState<
    string | null
  >(null)
  const [loading, setLoading] = React.useState(true)
  const [savingMaintenance, setSavingMaintenance] = React.useState(false)
  const [savingMessages, setSavingMessages] = React.useState(false)
  const [savingClosures, setSavingClosures] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState<string>(
    new Date().toISOString()
  )
  const [closureDates, setClosureDates] = React.useState<string[]>([])
  // For the Info section; the Materie section loads and edits the list on its own.
  const [subjectCount, setSubjectCount] = React.useState<number | null>(null)
  React.useEffect(() => {
    void fetch('/api/subjects')
      .then(response => (response.ok ? response.json() : null))
      .then(payload => payload && setSubjectCount(extractPayloadArray(payload).length))
      .catch(() => undefined)
  }, [])

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
        setClosureDates(
          normalized.closureDates.map((date) => {
            const [year, month, day] = date.split('-')
            if (!year || !month || !day) return date
            return `${day}-${month}-${year}`
          })
        )
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
        const maintenanceSnapshot = JSON.stringify({
          enabled: normalized.maintenance.enabled,
          message: normalized.maintenance.message ?? null,
          roles: (normalized.maintenance.roles ?? []).filter(
            (role) => role === 'student' || role === 'tutor'
          )
        })
        const serviceSnapshot = JSON.stringify({
          student: normalized.serviceMessages.student?.enabled
            ? normalized.serviceMessages.student
            : null,
          tutor: normalized.serviceMessages.tutor?.enabled
            ? normalized.serviceMessages.tutor
            : null,
          admin: normalized.serviceMessages.admin?.enabled
            ? normalized.serviceMessages.admin
            : null,
          activator: normalized.serviceMessages.activator?.enabled
            ? normalized.serviceMessages.activator
            : null
        })
        const closuresSnapshot = JSON.stringify(
          normalized.closureDates
            .map((date) => {
              const [year, month, day] = date.split('-')
              if (!year || !month || !day) return date
              return `${day}-${month}-${year}`
            })
            .sort()
        )
        setInitialMaintenanceSnapshot(maintenanceSnapshot)
        setInitialServiceSnapshot(serviceSnapshot)
        setInitialClosuresSnapshot(closuresSnapshot)
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

  React.useEffect(() => {
    const tick = () => setCurrentTime(new Date().toISOString())
    const interval = window.setInterval(tick, 60_000)
    tick()
    return () => window.clearInterval(interval)
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

  const maintenancePayload = React.useMemo(
    () => ({
      enabled: settings.maintenance.enabled,
      message: settings.maintenance.message?.trim() || null,
      roles: (settings.maintenance.roles ?? []).filter(
        (role) => role === 'student' || role === 'tutor'
      )
    }),
    [settings.maintenance]
  )

  const serviceMessagesPayload = React.useMemo(
    () => ({
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
    }),
    [serviceMessageState]
  )

  const closureDatePattern = React.useMemo(() => /^\d{2}-\d{2}-\d{4}$/, [])

  const toApiClosureDate = React.useCallback(
    (date: string) => {
      if (!closureDatePattern.test(date)) return null
      const [day, month, year] = date.split('-')
      return `${year}-${month}-${day}`
    },
    [closureDatePattern]
  )

  const closureDatesPayload = React.useMemo(
    () =>
      closureDates
        .map((date) => toApiClosureDate(date))
        .filter(Boolean)
        .sort() as string[],
    [closureDates, toApiClosureDate]
  )

  const handleSaveMaintenance = React.useCallback(async () => {
    setSavingMaintenance(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenance: maintenancePayload })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(
          payload?.message || 'Impossibile salvare la manutenzione.'
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
      setSettings((prev) => ({
        ...prev,
        maintenance: normalized.maintenance
      }))
      setInitialMaintenanceSnapshot(JSON.stringify(normalized.maintenance))
      toast.success('Manutenzione salvata.')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile salvare la manutenzione.'
      )
    } finally {
      setSavingMaintenance(false)
    }
  }, [maintenancePayload])

  const handleSaveMessages = React.useCallback(async () => {
    for (const role of roleOptions) {
      const message = serviceMessagesPayload[role]
      if (!message) continue
      if (!message.title.trim() || !message.body.trim()) {
        toast.error('Compila titolo e messaggio per i servizi abilitati.')
        return
      }
    }

    setSavingMessages(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceMessages: serviceMessagesPayload })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile salvare i messaggi.')
      }
      const payload = await response.json()
      const normalized = normalizeSettings(payload)
      setServiceMessageState({
        student:
          normalized.serviceMessages.student ?? buildDefaultServiceMessage(),
        tutor: normalized.serviceMessages.tutor ?? buildDefaultServiceMessage(),
        admin: normalized.serviceMessages.admin ?? buildDefaultServiceMessage(),
        activator:
          normalized.serviceMessages.activator ?? buildDefaultServiceMessage()
      })
      setInitialServiceSnapshot(JSON.stringify(normalized.serviceMessages))
      toast.success('Messaggi salvati.')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile salvare i messaggi.'
      )
    } finally {
      setSavingMessages(false)
    }
  }, [serviceMessagesPayload])

  const handleSaveClosures = React.useCallback(async () => {
    if (closureDates.some((date) => !closureDatePattern.test(date))) {
      toast.error('Alcune date non sono valide (DD-MM-YYYY).')
      return
    }

    setSavingClosures(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closureDates: closureDatesPayload })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile salvare le chiusure.')
      }
      const payload = await response.json()
      const normalized = normalizeSettings(payload)
      setClosureDates(
        normalized.closureDates.map((date) => {
          const [year, month, day] = date.split('-')
          if (!year || !month || !day) return date
          return `${day}-${month}-${year}`
        })
      )
      setInitialClosuresSnapshot(
        JSON.stringify(
          normalized.closureDates
            .map((date) => {
              const [year, month, day] = date.split('-')
              if (!year || !month || !day) return date
              return `${day}-${month}-${year}`
            })
            .sort()
        )
      )
      toast.success('Date di chiusura salvate.')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile salvare le chiusure.'
      )
    } finally {
      setSavingClosures(false)
    }
  }, [closureDatePattern, closureDates, closureDatesPayload])

  const isMaintenanceDirty = React.useMemo(
    () =>
      JSON.stringify(maintenancePayload) !== (initialMaintenanceSnapshot ?? ''),
    [initialMaintenanceSnapshot, maintenancePayload]
  )

  const isServiceDirty = React.useMemo(
    () =>
      JSON.stringify(serviceMessagesPayload) !== (initialServiceSnapshot ?? ''),
    [initialServiceSnapshot, serviceMessagesPayload]
  )

  const isClosuresDirty = React.useMemo(
    () =>
      JSON.stringify(closureDates.slice().sort()) !==
      (initialClosuresSnapshot ?? ''),
    [closureDates, initialClosuresSnapshot]
  )

  const availableTabs = React.useMemo(
    () => ['info', 'maintenance', 'messages', 'popup', 'closures', 'subjects', 'faq', 'school-year'] as const,
    []
  )
  const sections: SectionItem[] = [
    { value: 'info', label: 'Info', icon: Info },
    { value: 'maintenance', label: 'Manutenzione', icon: Wrench, separatorBefore: true },
    { value: 'messages', label: 'Messaggi', icon: Megaphone },
    { value: 'popup', label: 'Popup', icon: MessageSquareText },
    { value: 'closures', label: 'Chiusure', icon: CalendarOff },
    { value: 'subjects', label: 'Materie', icon: BookOpen },
    { value: 'faq', label: 'FAQ', icon: CircleHelp },
    { value: 'school-year', label: 'Anno scolastico', icon: RotateCcw, separatorBefore: true }
  ]

  const activeTab = React.useMemo(() => {
    const tab = searchParams.get('tab')
    if (tab && availableTabs.includes(tab as (typeof availableTabs)[number])) {
      return tab
    }
    return 'info'
  }, [availableTabs, searchParams])

  const handleTabChange = React.useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams)
      if (value === 'info') {
        params.delete('tab')
      } else {
        params.set('tab', value)
      }
      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false
      })
    },
    [pathname, router, searchParams]
  )

  return (
    <SectionLayout title='Impostazioni globali' backHref='/admin' sections={sections} value={activeTab} onValueChange={handleTabChange}>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsContent value='maintenance' className='mt-0 space-y-6'>
              <SettingsSection
                title='Manutenzione'
                description='Chiude il sito a studenti e tutor con un messaggio; gli admin continuano a entrare.'
                actions={
                  <Button onClick={handleSaveMaintenance} disabled={loading || savingMaintenance || !isMaintenanceDirty}>
                    {savingMaintenance ? 'Salvataggio...' : 'Salva modifiche'}
                  </Button>
                }
              >
              <Card>
                <CardContent className='pt-6 space-y-4'>
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
                            message: capitalizeFirst(event.target.value)
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
                            checked={(
                              settings.maintenance.roles ?? []
                            ).includes(role)}
                            onCheckedChange={() => toggleRole(role)}
                          />
                          <span className='capitalize'>{role}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                </CardContent>
              </Card>
              </SettingsSection>
            </TabsContent>

            <TabsContent value='messages' className='mt-0 space-y-6'>
              <SettingsSection
                title='Messaggi di servizio'
                description='Un avviso in cima alle pagine, diverso per studenti, tutor e admin.'
                actions={
                  <Button onClick={handleSaveMessages} disabled={loading || savingMessages || !isServiceDirty}>
                    {savingMessages ? 'Salvataggio...' : 'Salva modifiche'}
                  </Button>
                }
              >
              <Card>
                <CardContent className='pt-6 space-y-6'>
                  {roleOptions.map((role) => {
                    const message = serviceMessageState[role]
                    return (
                      <div
                        key={role}
                        className='rounded-lg border p-4 space-y-4'
                      >
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
                                    title: capitalizeFirst(event.target.value)
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
                          <MarkdownEditor
                            id={`service-message-body-${role}`}
                            value={message.body}
                            onChange={(value) =>
                              setServiceMessageState((prev) => ({
                                ...prev,
                                [role]: {
                                  ...prev[role],
                                  body: value
                                }
                              }))
                            }
                            placeholder='Messaggio visibile agli utenti. Usa la barra sopra per **grassetto**, elenchi e link.'
                            maxLength={1000}
                            rows={4}
                          />
                          {message.body.trim() && (
                            <div className='space-y-1'>
                              <div className='text-xs text-muted-foreground'>Anteprima</div>
                              <ServiceMessageCard message={message} />
                            </div>
                          )}
                        </Field>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
              </SettingsSection>
            </TabsContent>

            <TabsContent value='subjects' className='mt-0 space-y-6'>
              {activeTab === 'subjects' && <AdminSubjectsSettings />}
            </TabsContent>

            <TabsContent value='closures' className='mt-0 space-y-6'>
              <SettingsSection
                title='Chiusure'
                description='I giorni in cui la scuola è chiusa e non si fanno lezioni.'
                actions={
                  <Button onClick={handleSaveClosures} disabled={loading || savingClosures || !isClosuresDirty}>
                    {savingClosures ? 'Salvataggio...' : 'Salva modifiche'}
                  </Button>
                }
              >
              <AdminClosures
                dates={closureDatesPayload}
                onChange={(next) => setClosureDates(next.map((date) => {
                  const [year, month, day] = date.split('-')
                  return `${day}-${month}-${year}`
                }))}
                dirty={isClosuresDirty}
              />
              </SettingsSection>
            </TabsContent>

            <TabsContent value='popup' className='mt-0'>
              {activeTab === 'popup' && <AdminAnnouncementsPage />}
            </TabsContent>

            <TabsContent value='faq' className='mt-0'>
              {activeTab === 'faq' && <AdminFaqSettings />}
            </TabsContent>

            <TabsContent value='school-year' className='mt-0'>
              <SettingsSection
                title='Anno scolastico'
                description='A fine anno: scarica il report e azzera i dati per ricominciare.'
              >
              {activeTab === 'school-year' && <SchoolYearReset />}
              </SettingsSection>
            </TabsContent>

            <TabsContent value='info' className='mt-0 space-y-6'>
              <SettingsSection
                title='Informazioni'
                description='Lo stato del servizio a colpo d’occhio.'
              >
              <Card>
                <CardContent className='pt-6 space-y-4'>
                  <div className='flex flex-wrap gap-2'>
                    <Badge variant='secondary'>
                      Data e ora attuali: {formatItalianDate(currentTime)}
                    </Badge>
                    <Badge variant='outline'>
                      Modalità manutenzione:{' '}
                      {settings.maintenance.enabled ? 'attiva' : 'disattiva'}
                    </Badge>
                    <Badge variant='outline'>
                      Ruoli manutenzione:{' '}
                      {(settings.maintenance.roles ?? [])
                        .filter(
                          (role) => role === 'student' || role === 'tutor'
                        )
                        .join(', ') || 'nessuno'}
                    </Badge>
                    <Badge variant='outline'>
                      Messaggi attivi:{' '}
                      {Object.entries(serviceMessagesPayload)
                        .filter(([, value]) => Boolean(value))
                        .map(([role]) => role)
                        .join(', ') || 'nessuno'}
                    </Badge>
                    <Badge variant='outline'>
                      Materie totali: {subjectCount ?? '–'}
                    </Badge>
                    <Badge variant='outline'>
                      Giorni di chiusura: {closureDates.length}
                    </Badge>
                  </div>
                  <p className='text-sm text-muted-foreground'>
                    I dati sono aggiornati in base all&apos;ultimo caricamento
                    di questa pagina.
                  </p>
                </CardContent>
              </Card>
              </SettingsSection>
            </TabsContent>
          </Tabs>
    </SectionLayout>
  )
}
