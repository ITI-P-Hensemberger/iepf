'use client'

import { AdminSubjectsSettings } from '@/components/admin-subjects-settings'
import { SettingsSection } from '@/components/settings-section'
import AdminAnnouncementsPage from '@/components/admin-announcements-page'
import { AdminClosures } from '@/components/admin-closures'
import { AdminFaqSettings } from '@/components/admin-faq-settings'
import { AdminLinksSettings } from '@/components/admin-links-settings'
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
import { BookOpen, CalendarOff, Info, Link2, Megaphone, RotateCcw, Wrench, CircleHelp, MessageSquareText } from 'lucide-react'
import { capitalizeFirst } from '@/lib/capitalize'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, jsonBody } from '@/lib/api-fetch'

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

// The API stores closure days as YYYY-MM-DD; the form shows DD-MM-YYYY.
function toFormClosureDate(date: string) {
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}-${month}-${year}` : date
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
  const [currentTime, setCurrentTime] = React.useState<string>(
    new Date().toISOString()
  )
  const [closureDates, setClosureDates] = React.useState<string[]>([])
  // For the Info section; the Materie section loads and edits the list on its own.
  const { data: subjectCount = null } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => extractPayloadArray(await apiFetch('/api/subjects', 'Impossibile caricare le materie.')),
    select: (list) => list.length,
    meta: { inline: true }
  })

  const queryClient = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/api/settings', 'Impossibile caricare le impostazioni.')
  })
  const loading = settingsQuery.isPending
  // The sections edit a copy: it is filled once, from the first load, so a reload never
  // overwrites what the admin is typing. Each save then refreshes its own part.
  const [seeded, setSeeded] = React.useState(false)
  if (settingsQuery.data && !seeded) {
    setSeeded(true)
    const normalized = normalizeSettings(settingsQuery.data)
    normalized.maintenance = {
      ...normalized.maintenance,
      roles: (normalized.maintenance.roles ?? []).filter((role) => role === 'student' || role === 'tutor')
    }
    setSettings(normalized)
    setClosureDates(normalized.closureDates.map(toFormClosureDate))
    setServiceMessageState({
      student: normalized.serviceMessages.student ?? buildDefaultServiceMessage(),
      tutor: normalized.serviceMessages.tutor ?? buildDefaultServiceMessage(),
      admin: normalized.serviceMessages.admin ?? buildDefaultServiceMessage(),
      activator: normalized.serviceMessages.activator ?? buildDefaultServiceMessage()
    })
    setInitialMaintenanceSnapshot(JSON.stringify({
      enabled: normalized.maintenance.enabled,
      message: normalized.maintenance.message ?? null,
      roles: normalized.maintenance.roles
    }))
    setInitialServiceSnapshot(JSON.stringify({
      student: normalized.serviceMessages.student?.enabled ? normalized.serviceMessages.student : null,
      tutor: normalized.serviceMessages.tutor?.enabled ? normalized.serviceMessages.tutor : null,
      admin: normalized.serviceMessages.admin?.enabled ? normalized.serviceMessages.admin : null,
      activator: normalized.serviceMessages.activator?.enabled ? normalized.serviceMessages.activator : null
    }))
    setInitialClosuresSnapshot(JSON.stringify(normalized.closureDates.map(toFormClosureDate).sort()))
  }

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

  // Each section saves its own part; the answer is the whole settings, kept for the next visit.
  const saveSettings = (body: unknown, fallback: string) =>
    apiFetch('/api/settings', fallback, jsonBody('PATCH', body)).then((payload) => {
      queryClient.setQueryData(['settings'], payload)
      // The date pickers read the closures on their own.
      void queryClient.invalidateQueries({ queryKey: ['settings', 'closures'] })
      return normalizeSettings(payload)
    })

  const saveMaintenance = useMutation({
    mutationFn: () => saveSettings({ maintenance: maintenancePayload }, 'Impossibile salvare la manutenzione.'),
    onSuccess: (normalized) => {
      const maintenance = {
        ...normalized.maintenance,
        roles: (normalized.maintenance.roles ?? []).filter((role) => role === 'student' || role === 'tutor')
      }
      setSettings((prev) => ({ ...prev, maintenance }))
      setInitialMaintenanceSnapshot(JSON.stringify(maintenance))
      toast.success('Manutenzione salvata.')
    }
  })
  const savingMaintenance = saveMaintenance.isPending
  const handleSaveMaintenance = () => saveMaintenance.mutate()

  const saveMessages = useMutation({
    mutationFn: () => saveSettings({ serviceMessages: serviceMessagesPayload }, 'Impossibile salvare i messaggi.'),
    onSuccess: (normalized) => {
      setServiceMessageState({
        student: normalized.serviceMessages.student ?? buildDefaultServiceMessage(),
        tutor: normalized.serviceMessages.tutor ?? buildDefaultServiceMessage(),
        admin: normalized.serviceMessages.admin ?? buildDefaultServiceMessage(),
        activator: normalized.serviceMessages.activator ?? buildDefaultServiceMessage()
      })
      setInitialServiceSnapshot(JSON.stringify(normalized.serviceMessages))
      toast.success('Messaggi salvati.')
    }
  })
  const savingMessages = saveMessages.isPending
  const handleSaveMessages = () => {
    for (const role of roleOptions) {
      const message = serviceMessagesPayload[role]
      if (!message) continue
      if (!message.title.trim() || !message.body.trim()) {
        toast.error('Compila titolo e messaggio per i servizi abilitati.')
        return
      }
    }
    saveMessages.mutate()
  }

  const saveClosures = useMutation({
    mutationFn: () => saveSettings({ closureDates: closureDatesPayload }, 'Impossibile salvare le chiusure.'),
    onSuccess: (normalized) => {
      const dates = normalized.closureDates.map(toFormClosureDate)
      setClosureDates(dates)
      setInitialClosuresSnapshot(JSON.stringify([...dates].sort()))
      // The booking pages read the closed days: they reload them on their next visit.
      void queryClient.invalidateQueries({ queryKey: ['lessons'] })
      toast.success('Date di chiusura salvate.')
    }
  })
  const savingClosures = saveClosures.isPending
  const handleSaveClosures = () => {
    if (closureDates.some((date) => !closureDatePattern.test(date))) {
      toast.error('Alcune date non sono valide (DD-MM-YYYY).')
      return
    }
    saveClosures.mutate()
  }

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
    () => ['info', 'maintenance', 'messages', 'popup', 'closures', 'subjects', 'faq', 'links', 'school-year'] as const,
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
    { value: 'links', label: 'Link', icon: Link2 },
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

            <TabsContent value='links' className='mt-0'>
              {activeTab === 'links' && <AdminLinksSettings />}
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
