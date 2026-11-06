'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { BackButton } from '@/components/back-button'
import { Badge } from '@/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownEditor } from '@/components/markdown-editor'
import { SchoolYearReset } from '@/components/school-year-reset'
import { ServiceMessageCard } from '@/components/service-message-banner'
import { Calendar } from '@/components/ui/calendar'
import { extractPayloadArray } from '@/lib/backend-response'
import { formatItalianDate } from '@/lib/format-date'
import { Pencil, Trash2, Save, X } from 'lucide-react'
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

type Subject = {
  id: string
  name: string
  canonicalName: string
  createdAt: string
  updatedAt: string
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
  const [subjects, setSubjects] = React.useState<Subject[]>([])
  const [subjectsLoading, setSubjectsLoading] = React.useState(false)
  const [subjectsCreating, setSubjectsCreating] = React.useState(false)
  const [subjectsSavingId, setSubjectsSavingId] = React.useState<string | null>(
    null
  )
  const [subjectsDeletingId, setSubjectsDeletingId] = React.useState<
    string | null
  >(null)
  const [newSubjectName, setNewSubjectName] = React.useState('')
  const [newSubjectCanonicalName, setNewSubjectCanonicalName] =
    React.useState('')
  const [editingSubjectId, setEditingSubjectId] = React.useState<string | null>(
    null
  )
  const [editingSubjectName, setEditingSubjectName] = React.useState('')
  const [editingSubjectCanonicalName, setEditingSubjectCanonicalName] =
    React.useState('')
  const [closureDates, setClosureDates] = React.useState<string[]>([])

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

  const loadSubjects = React.useCallback(async () => {
    setSubjectsLoading(true)
    try {
      const response = await fetch('/api/subjects')
      if (!response.ok) {
        throw new Error('Impossibile caricare le materie.')
      }
      const payload = await response.json()
      const data = extractPayloadArray<Subject>(payload)
      setSubjects(data)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile caricare le materie.'
      )
    } finally {
      setSubjectsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadSubjects()
  }, [loadSubjects])

  const handleCreateSubject = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const name = newSubjectName.trim()
      const canonicalName = newSubjectCanonicalName.trim()

      if (!name || !canonicalName) {
        toast.error('Inserisci nome e nome canonico.')
        return
      }

      setSubjectsCreating(true)
      try {
        const response = await fetch('/api/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, canonicalName })
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.message || 'Impossibile creare la materia.')
        }
        const payload = await response.json()
        const created = (payload?.data ?? payload) as Subject
        setSubjects((prev) => [created, ...prev])
        setNewSubjectName('')
        setNewSubjectCanonicalName('')
        toast.success('Materia creata.')
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Impossibile creare la materia.'
        )
      } finally {
        setSubjectsCreating(false)
      }
    },
    [newSubjectCanonicalName, newSubjectName]
  )

  const handleEditSubject = React.useCallback((subject: Subject) => {
    setEditingSubjectId(subject.id)
    setEditingSubjectName(subject.name)
    setEditingSubjectCanonicalName(subject.canonicalName)
  }, [])

  const handleCancelEdit = React.useCallback(() => {
    setEditingSubjectId(null)
    setEditingSubjectName('')
    setEditingSubjectCanonicalName('')
  }, [])

  const handleUpdateSubject = React.useCallback(
    async (subjectId: string) => {
      const name = editingSubjectName.trim()
      const canonicalName = editingSubjectCanonicalName.trim()

      if (!name || !canonicalName) {
        toast.error('Inserisci nome e nome canonico.')
        return
      }

      setSubjectsSavingId(subjectId)
      try {
        const response = await fetch(`/api/subjects/${subjectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, canonicalName })
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(
            payload?.message || 'Impossibile aggiornare la materia.'
          )
        }
        const payload = await response.json()
        const updated = (payload?.data ?? payload) as Subject
        setSubjects((prev) =>
          prev.map((subject) => (subject.id === subjectId ? updated : subject))
        )
        handleCancelEdit()
        toast.success('Materia aggiornata.')
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile aggiornare la materia.'
        )
      } finally {
        setSubjectsSavingId(null)
      }
    },
    [editingSubjectCanonicalName, editingSubjectName, handleCancelEdit]
  )

  const handleDeleteSubject = React.useCallback(async (subject: Subject) => {
    const confirmed = window.confirm(`Eliminare la materia "${subject.name}"?`)
    if (!confirmed) return

    setSubjectsDeletingId(subject.id)
    try {
      const response = await fetch(`/api/subjects/${subject.id}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile eliminare la materia.')
      }
      setSubjects((prev) => prev.filter((item) => item.id !== subject.id))
      toast.success('Materia eliminata.')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile eliminare la materia.'
      )
    } finally {
      setSubjectsDeletingId(null)
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

  const handleRemoveClosureDate = React.useCallback(
    (date: string) => {
      setClosureDates((prev) => prev.filter((item) => item !== date))
    },
    []
  )

  const parseClosureDate = React.useCallback(
    (date: string) => {
      const apiDate = toApiClosureDate(date)
      if (!apiDate) return null
      const parsed = new Date(`${apiDate}T00:00:00`)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    },
    [toApiClosureDate]
  )

  const formatClosureDate = React.useCallback((date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${day}-${month}-${year}`
  }, [])

  const selectedClosureDates = React.useMemo(
    () => closureDates.map(parseClosureDate).filter(Boolean) as Date[],
    [closureDates, parseClosureDate]
  )

  const closureDatesDisplay = React.useMemo(() => {
    return closureDates.slice().sort((a, b) => {
      const apiA = toApiClosureDate(a)
      const apiB = toApiClosureDate(b)
      if (!apiA || !apiB) return a.localeCompare(b)
      return apiA.localeCompare(apiB)
    })
  }, [closureDates, toApiClosureDate])

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
    () => ['info', 'maintenance', 'messages', 'closures', 'subjects', 'school-year'] as const,
    []
  )
  const tabLabels: Record<(typeof availableTabs)[number], string> = {
    info: 'Info',
    maintenance: 'Manutenzione',
    messages: 'Messaggi',
    closures: 'Chiusure',
    subjects: 'Materie',
    'school-year': 'Anno scolastico'
  }

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
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl space-y-6'>
          <div className='mb-6 self-start'>
            <BackButton href='/admin' />
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Impostazioni globali</h1>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div className='sm:hidden'>
              <Select value={activeTab} onValueChange={handleTabChange}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Seleziona sezione' />
                </SelectTrigger>
                <SelectContent>
                  {availableTabs.map((tab) => (
                    <SelectItem key={tab} value={tab}>
                      {tabLabels[tab]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TabsList className='hidden sm:grid w-full grid-cols-6'>
              <TabsTrigger value='info' className='w-full'>
                Info
              </TabsTrigger>
              <TabsTrigger value='maintenance' className='w-full'>
                Manutenzione
              </TabsTrigger>
              <TabsTrigger value='messages' className='w-full'>
                Messaggi
              </TabsTrigger>
              <TabsTrigger value='closures' className='w-full'>
                Chiusure
              </TabsTrigger>
              <TabsTrigger value='subjects' className='w-full'>
                Materie
              </TabsTrigger>
              <TabsTrigger value='school-year' className='w-full'>
                Anno scolastico
              </TabsTrigger>
            </TabsList>

            <TabsContent value='maintenance' className='mt-6 space-y-6'>
              <div className='flex justify-end'>
                <Button
                  onClick={handleSaveMaintenance}
                  disabled={loading || savingMaintenance || !isMaintenanceDirty}
                >
                  {savingMaintenance ? 'Salvataggio...' : 'Salva manutenzione'}
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
            </TabsContent>

            <TabsContent value='messages' className='mt-6 space-y-6'>
              <div className='flex justify-end'>
                <Button
                  onClick={handleSaveMessages}
                  disabled={loading || savingMessages || !isServiceDirty}
                >
                  {savingMessages ? 'Salvataggio...' : 'Salva messaggi'}
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Messaggi di servizio</CardTitle>
                </CardHeader>
                <CardContent className='space-y-6'>
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
            </TabsContent>

            <TabsContent value='subjects' className='mt-6 space-y-6'>
              <Card>
                <CardHeader>
                  <CardTitle>Nuova materia</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className='space-y-4' onSubmit={handleCreateSubject}>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <Field className='gap-2'>
                        <FieldLabel>Nome</FieldLabel>
                        <Input
                          value={newSubjectName}
                          onChange={(event) =>
                            setNewSubjectName(capitalizeFirst(event.target.value))
                          }
                          placeholder='Es. Matematica'
                          maxLength={120}
                        />
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Nome canonico</FieldLabel>
                        <Input
                          value={newSubjectCanonicalName}
                          onChange={(event) =>
                            setNewSubjectCanonicalName(event.target.value)
                          }
                          placeholder='Es. matematica'
                          maxLength={120}
                        />
                      </Field>
                    </div>
                    <div className='flex justify-end'>
                      <Button type='submit' disabled={subjectsCreating}>
                        {subjectsCreating ? 'Creazione...' : 'Aggiungi materia'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Elenco materie</CardTitle>
                </CardHeader>
                <CardContent>
                  {subjectsLoading ? (
                    <div className='text-sm text-muted-foreground'>
                      Caricamento materie...
                    </div>
                  ) : subjects.length === 0 ? (
                    <div className='text-sm text-muted-foreground'>
                      Nessuna materia disponibile.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Nome canonico</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subjects.map((subject) => {
                          const isEditing = editingSubjectId === subject.id
                          const isSaving = subjectsSavingId === subject.id
                          return (
                            <TableRow key={subject.id}>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={editingSubjectName}
                                    onChange={(event) =>
                                      setEditingSubjectName(capitalizeFirst(event.target.value))
                                    }
                                    maxLength={120}
                                  />
                                ) : (
                                  subject.name
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={editingSubjectCanonicalName}
                                    onChange={(event) =>
                                      setEditingSubjectCanonicalName(
                                        event.target.value
                                      )
                                    }
                                    maxLength={120}
                                  />
                                ) : (
                                  subject.canonicalName
                                )}
                              </TableCell>
                              <TableCell className='text-right'>
                                <div className='flex items-center justify-end gap-2'>
                                  {isEditing ? (
                                    <>
                                      <Button
                                        size='sm'
                                        variant='ghost'
                                        onClick={() =>
                                          handleUpdateSubject(subject.id)
                                        }
                                        disabled={isSaving}
                                        aria-label='Salva'
                                      >
                                        <Save className='h-4 w-4' />
                                      </Button>
                                      <Button
                                        size='sm'
                                        variant='ghost'
                                        onClick={handleCancelEdit}
                                        disabled={isSaving}
                                        aria-label='Annulla'
                                      >
                                        <X className='h-4 w-4' />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size='sm'
                                        variant='ghost'
                                        onClick={() =>
                                          handleEditSubject(subject)
                                        }
                                        disabled={Boolean(
                                          editingSubjectId ||
                                          subjectsSavingId ||
                                          subjectsDeletingId
                                        )}
                                        aria-label='Modifica'
                                      >
                                        <Pencil className='h-4 w-4' />
                                      </Button>
                                      <Button
                                        size='sm'
                                        variant='ghost'
                                        onClick={() =>
                                          handleDeleteSubject(subject)
                                        }
                                        disabled={Boolean(
                                          editingSubjectId ||
                                          subjectsSavingId ||
                                          subjectsDeletingId
                                        )}
                                        aria-label='Elimina'
                                      >
                                        <Trash2 className='h-4 w-4 text-destructive' />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='closures' className='mt-6 space-y-6'>
              <div className='flex justify-end'>
                <Button
                  onClick={handleSaveClosures}
                  disabled={loading || savingClosures || !isClosuresDirty}
                >
                  {savingClosures ? 'Salvataggio...' : 'Salva chiusure'}
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Date di chiusura</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <p className='text-sm text-muted-foreground'>
                    Seleziona le date in cui la scuola è chiusa.
                  </p>
                  <div className='flex justify-center'>
                    <Calendar
                      mode='multiple'
                      selected={selectedClosureDates}
                      onSelect={(dates) => {
                        const next = (dates ?? []).map(formatClosureDate)
                        setClosureDates(Array.from(new Set(next)))
                      }}
                      numberOfMonths={1}
                    />
                  </div>

                  {closureDates.length === 0 ? (
                    <div className='text-sm text-muted-foreground'>
                      Nessuna data di chiusura impostata.
                    </div>
                  ) : (
                    <div className='flex flex-wrap gap-2'>
                      {closureDatesDisplay.map((date) => (
                        <div
                          key={date}
                          className='flex items-center gap-2 rounded-full border px-3 py-1 text-sm'
                        >
                          <span>{date}</span>
                          <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            onClick={() => handleRemoveClosureDate(date)}
                          >
                            Rimuovi
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='school-year' className='mt-6'>
              {activeTab === 'school-year' && <SchoolYearReset />}
            </TabsContent>

            <TabsContent value='info' className='mt-6 space-y-6'>
              <Card>
                <CardHeader>
                  <CardTitle>Informazioni</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
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
                      Materie totali: {subjects.length}
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
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  )
}
