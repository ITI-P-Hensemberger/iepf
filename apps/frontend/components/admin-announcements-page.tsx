'use client'

import { BlockSkeleton } from '@/components/loading'
import { EmptyState } from '@/components/empty-state'
import * as React from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarIcon, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { AnnouncementCard } from '@/components/announcement-popup'
import { PageHeader } from '@/components/page-header'
import { MarkdownEditor } from '@/components/markdown-editor'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { DismissMode } from '@/lib/announcement-dismissals'
import {
  announcementStatus,
  type AnnouncementStatus
} from '@/lib/announcement-status'
import { safeHref } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import { capitalizeFirst } from '@/lib/capitalize'

type Role = 'student' | 'tutor' | 'admin'

type Announcement = {
  id: string
  title: string
  body: string
  linkUrl: string | null
  linkLabel: string | null
  roles: Role[]
  dismissMode: DismissMode
  active: boolean
  startsAt: string | null
  expiresAt: string | null
  dismissals: number
  createdAt: string
  updatedAt: string
}

type Draft = {
  title: string
  body: string
  linkUrl: string
  linkLabel: string
  roles: Role[]
  dismissMode: DismissMode
  active: boolean
  // datetime-local values, in the admin's time zone.
  startsAt: string
  expiresAt: string
}

const TITLE_MAX = 120
const BODY_MAX = 5000
const LINK_LABEL_MAX = 40

const ROLE_LABELS: Record<Role, string> = {
  student: 'Studenti',
  tutor: 'Tutor',
  admin: 'Admin'
}

const MODE_LABELS: Record<DismissMode, { label: string; hint: string }> = {
  once_account: {
    label: 'Una volta per account',
    hint: 'Chiuso una volta, non ricompare su nessun dispositivo.'
  },
  once_device: {
    label: 'Una volta per dispositivo',
    hint: 'Chiuso una volta, non ricompare su quel browser.'
  },
  every_session: {
    label: 'A ogni accesso',
    hint: 'Ricompare a ogni login, finché resta visibile.'
  }
}

const STATUS_BADGES: Record<
  AnnouncementStatus,
  { label: string; variant: 'success' | 'secondary' | 'outline' | 'warning' }
> = {
  active: { label: 'Visibile', variant: 'success' },
  scheduled: { label: 'Programmato', variant: 'warning' },
  expired: { label: 'Scaduto', variant: 'outline' },
  disabled: { label: 'Disattivato', variant: 'secondary' }
}

const EMPTY_DRAFT: Draft = {
  title: '',
  body: '',
  linkUrl: '',
  linkLabel: '',
  roles: ['student', 'tutor'],
  dismissMode: 'once_account',
  active: false,
  startsAt: '',
  expiresAt: ''
}

function toLocalInput(iso: string | null) {
  return iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : ''
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null
}

// Same picker as the rest of the app: an outline button that opens the shared Calendar.
function DateTimeField({
  id,
  value,
  defaultTime,
  clearLabel,
  onChange
}: {
  id: string
  value: string
  defaultTime: string
  clearLabel: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const date = value ? new Date(value) : undefined
  const time = value ? value.slice(11, 16) : defaultTime

  return (
    <div className='flex gap-2'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type='button'
            variant='outline'
            className='min-w-0 flex-1 justify-start px-2.5 font-normal'
          >
            <CalendarIcon className='mr-2 h-4 w-4' />
            {date ? (
              <span className='truncate'>{format(date, 'dd/MM/yyyy HH:mm')}</span>
            ) : (
              <span className='text-muted-foreground'>Seleziona data</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-auto space-y-3 p-3' align='start'>
          <Calendar
            mode='single'
            selected={date}
            onSelect={(picked) => {
              if (picked) onChange(`${format(picked, 'yyyy-MM-dd')}T${time}`)
            }}
            defaultMonth={date ?? new Date()}
            initialFocus
          />
          <div className='flex items-center gap-2'>
            <Label htmlFor={`${id}-time`} className='shrink-0'>
              Orario
            </Label>
            <Input
              id={`${id}-time`}
              type='time'
              value={time}
              disabled={!date}
              onChange={(event) => {
                if (date && event.target.value) {
                  onChange(`${value.slice(0, 10)}T${event.target.value}`)
                }
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type='button'
          variant='outline'
          size='icon'
          aria-label={clearLabel}
          onClick={() => onChange('')}
        >
          <X />
        </Button>
      )}
    </div>
  )
}

function formatDate(iso: string) {
  return format(new Date(iso), 'd MMM yyyy, HH:mm', { locale: it })
}

function draftFrom(announcement: Announcement): Draft {
  return {
    title: announcement.title,
    body: announcement.body,
    linkUrl: announcement.linkUrl ?? '',
    linkLabel: announcement.linkLabel ?? '',
    roles: announcement.roles,
    dismissMode: announcement.dismissMode,
    active: announcement.active,
    startsAt: toLocalInput(announcement.startsAt),
    expiresAt: toLocalInput(announcement.expiresAt)
  }
}

function payloadFrom(draft: Draft) {
  const linkUrl = draft.linkUrl.trim() || null
  return {
    title: draft.title.trim(),
    body: draft.body.trim(),
    linkUrl,
    linkLabel: linkUrl ? draft.linkLabel.trim() || null : null,
    roles: draft.roles,
    dismissMode: draft.dismissMode,
    active: draft.active,
    startsAt: fromLocalInput(draft.startsAt),
    expiresAt: fromLocalInput(draft.expiresAt)
  }
}

function validate(draft: Draft): string | null {
  if (!draft.title.trim()) return 'Scrivi un titolo.'
  if (!draft.body.trim()) return 'Scrivi il testo del popup.'
  if (draft.roles.length === 0) return 'Scegli almeno un ruolo.'
  if (draft.linkUrl.trim() && !safeHref(draft.linkUrl))
    return 'Il link deve iniziare con https:// o con /.'
  if (draft.linkUrl.trim().startsWith('mailto:'))
    return 'Il bottone accetta solo https:// o un percorso che inizia con /.'
  if (
    draft.startsAt &&
    draft.expiresAt &&
    new Date(draft.expiresAt) <= new Date(draft.startsAt)
  ) {
    return "La scadenza deve essere dopo l'inizio."
  }
  return null
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string }
    return payload.message || fallback
  } catch {
    return fallback
  }
}

function AnnouncementForm({
  initial,
  editingId,
  onSaved,
  onCancel
}: {
  initial: Draft
  editingId: string | null
  onSaved: (announcement: Announcement) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = React.useState<Draft>(initial)
  const [isSaving, setIsSaving] = React.useState(false)
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const problem = validate(draft)
    if (problem) {
      toast.error(problem)
      return
    }
    setIsSaving(true)
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/announcements/${editingId}`
          : '/api/admin/announcements',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadFrom(draft))
        }
      )
      if (!response.ok) {
        throw new Error(await readError(response, 'Salvataggio non riuscito.'))
      }
      onSaved((await response.json()) as Announcement)
      toast.success(editingId ? 'Popup aggiornato.' : 'Popup creato.')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Salvataggio non riuscito.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const preview = payloadFrom(draft)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editingId ? 'Modifica popup' : 'Nuovo popup'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className='grid gap-6 lg:grid-cols-2'>
          <div className='min-w-0 space-y-5'>
            <div className='space-y-2'>
              <Label htmlFor='announcement-title'>Titolo</Label>
              <Input
                id='announcement-title'
                value={draft.title}
                maxLength={TITLE_MAX}
                onChange={(event) => update('title', capitalizeFirst(event.target.value))}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='announcement-body'>Testo</Label>
              <MarkdownEditor
                id='announcement-body'
                value={draft.body}
                maxLength={BODY_MAX}
                onChange={(value) => update('body', value)}
              />
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='announcement-link'>
                  Bottone: link (facoltativo)
                </Label>
                <Input
                  id='announcement-link'
                  value={draft.linkUrl}
                  inputMode='url'
                  placeholder='https://… oppure /student/book'
                  onChange={(event) => update('linkUrl', event.target.value)}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='announcement-link-label'>Bottone: testo</Label>
                <Input
                  id='announcement-link-label'
                  value={draft.linkLabel}
                  maxLength={LINK_LABEL_MAX}
                  placeholder='Scopri di più'
                  disabled={!draft.linkUrl.trim()}
                  onChange={(event) => update('linkLabel', capitalizeFirst(event.target.value))}
                />
              </div>
            </div>

            <fieldset className='space-y-2'>
              <legend className='text-sm font-medium'>Chi lo vede</legend>
              <div className='flex flex-wrap gap-x-6 gap-y-2'>
                {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                  <label key={role} className='flex items-center gap-2 text-sm'>
                    <Checkbox
                      checked={draft.roles.includes(role)}
                      onCheckedChange={(checked) =>
                        update(
                          'roles',
                          checked
                            ? [...draft.roles, role]
                            : draft.roles.filter((item) => item !== role)
                        )
                      }
                    />
                    {ROLE_LABELS[role]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className='space-y-2'>
              <Label htmlFor='announcement-mode'>Dopo la chiusura</Label>
              <Select
                value={draft.dismissMode}
                onValueChange={(value) =>
                  update('dismissMode', value as DismissMode)
                }
              >
                <SelectTrigger id='announcement-mode' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODE_LABELS) as DismissMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {MODE_LABELS[mode].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground'>
                {MODE_LABELS[draft.dismissMode].hint}
              </p>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              {(['startsAt', 'expiresAt'] as const).map((key) => (
                <div key={key} className='min-w-0 space-y-2'>
                  <Label htmlFor={`announcement-${key}`}>
                    {key === 'startsAt'
                      ? 'Inizio (facoltativo)'
                      : 'Scadenza (facoltativa)'}
                  </Label>
                  <DateTimeField
                    id={`announcement-${key}`}
                    value={draft[key]}
                    defaultTime={key === 'startsAt' ? '00:00' : '23:59'}
                    clearLabel={
                      key === 'startsAt' ? "Togli l'inizio" : 'Togli la scadenza'
                    }
                    onChange={(value) => update(key, value)}
                  />
                  <p className='text-xs text-muted-foreground'>
                    {key === 'startsAt'
                      ? 'Vuoto: da subito.'
                      : 'Vuota: non scade.'}
                  </p>
                </div>
              ))}
            </div>

            <label className='flex items-center gap-2 text-sm font-medium'>
              <Checkbox
                checked={draft.active}
                onCheckedChange={(checked) =>
                  update('active', checked === true)
                }
              />
              Attivo
            </label>

            <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
              <Button
                type='button'
                variant='outline'
                onClick={onCancel}
                disabled={isSaving}
              >
                Annulla
              </Button>
              <Button type='submit' disabled={isSaving}>
                {isSaving
                  ? 'Salvataggio...'
                  : editingId
                    ? 'Salva modifiche'
                    : 'Crea popup'}
              </Button>
            </div>
          </div>

          <div className='min-w-0 space-y-2'>
            <p className='text-sm font-medium'>Anteprima</p>
            <div className='flex justify-center rounded-lg bg-black/50 p-4 lg:sticky lg:top-20'>
              <div
                className='flex max-h-[min(70dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-background shadow-lg'
                aria-label='Anteprima del popup'
              >
                <AnnouncementCard announcement={preview} preview />
              </div>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = React.useState<Announcement[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<{
    id: string | null
    draft: Draft
  } | null>(null)
  const [toDelete, setToDelete] = React.useState<Announcement | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const formRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/admin/announcements', {
          cache: 'no-store'
        })
        if (!response.ok) {
          throw new Error(
            await readError(response, 'Impossibile caricare i popup.')
          )
        }
        const payload = (await response.json()) as Announcement[]
        if (!cancelled) setItems(payload)
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Impossibile caricare i popup.'
        )
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  function openEditor(id: string | null, draft: Draft) {
    setEditing({ id, draft })
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    )
  }

  function handleSaved(saved: Announcement) {
    setItems((previous) => {
      const exists = previous.some((item) => item.id === saved.id)
      return exists
        ? previous.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...previous]
    })
    setEditing(null)
  }

  async function toggleActive(announcement: Announcement) {
    setBusyId(announcement.id)
    try {
      const response = await fetch(
        `/api/admin/announcements/${announcement.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payloadFrom(draftFrom(announcement)),
            startsAt: announcement.startsAt,
            expiresAt: announcement.expiresAt,
            active: !announcement.active
          })
        }
      )
      if (!response.ok) {
        throw new Error(await readError(response, 'Modifica non riuscita.'))
      }
      handleSaved((await response.json()) as Announcement)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Modifica non riuscita.'
      )
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    const target = toDelete
    setToDelete(null)
    setBusyId(target.id)
    try {
      const response = await fetch(`/api/admin/announcements/${target.id}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error(await readError(response, 'Eliminazione non riuscita.'))
      }
      setItems((previous) => previous.filter((item) => item.id !== target.id))
      if (editing?.id === target.id) setEditing(null)
      toast.success('Popup eliminato.')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Eliminazione non riuscita.'
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto flex flex-col items-center px-4 py-10'>
        <div className='w-full max-w-6xl space-y-6'>
          <PageHeader
            title='Popup'
            description='Messaggi in primo piano per studenti, tutor o admin.'
            backHref='/admin'
            actions={!editing && (
              <Button onClick={() => openEditor(null, EMPTY_DRAFT)}>
                <Plus className='size-4' />
                Nuovo popup
              </Button>
            )}
          />

          {editing && (
            <div ref={formRef} className='scroll-mt-20'>
              <AnnouncementForm
                key={editing.id ?? 'new'}
                initial={editing.draft}
                editingId={editing.id}
                onSaved={handleSaved}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}

          {isLoading ? (
            <BlockSkeleton />
          ) : items.length === 0 ? (
            <EmptyState>Nessun popup.</EmptyState>
          ) : (
            <ul className='space-y-3'>
              {items.map((item) => {
                const status = STATUS_BADGES[announcementStatus(item)]
                return (
                  <li key={item.id}>
                    <Card
                      className={cn(
                        'py-4',
                        editing?.id === item.id && 'ring-2 ring-primary'
                      )}
                    >
                      <CardContent className='flex flex-col gap-4 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6'>
                        <div className='min-w-0 space-y-2'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <Badge variant={status.variant}>
                              {status.label}
                            </Badge>
                            <h2 className='min-w-0 font-semibold break-words'>
                              {item.title}
                            </h2>
                          </div>
                          <p className='text-sm text-muted-foreground'>
                            {item.roles
                              .map((role) => ROLE_LABELS[role])
                              .join(', ')}{' '}
                            · {MODE_LABELS[item.dismissMode].label}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {item.startsAt
                              ? `Dal ${formatDate(item.startsAt)}`
                              : 'Da subito'}
                            {' · '}
                            {item.expiresAt
                              ? `fino al ${formatDate(item.expiresAt)}`
                              : 'senza scadenza'}
                            {item.dismissMode === 'once_account' &&
                              ` · chiuso da ${item.dismissals} ${item.dismissals === 1 ? 'utente' : 'utenti'}`}
                          </p>
                        </div>
                        <div className='flex shrink-0 items-center gap-2'>
                          <label className='mr-2 flex items-center gap-2 text-sm'>
                            <Switch
                              checked={item.active}
                              aria-label={item.active ? 'Disattiva popup' : 'Attiva popup'}
                              disabled={busyId === item.id}
                              onCheckedChange={() => void toggleActive(item)}
                            />
                            {item.active ? 'Attivo' : 'Spento'}
                          </label>
                          <Button
                            variant='outline'
                            size='icon'
                            aria-label='Modifica'
                            onClick={() => openEditor(item.id, draftFrom(item))}
                          >
                            <Pencil className='size-4' />
                          </Button>
                          <Button
                            variant='outline'
                            size='icon'
                            aria-label='Elimina'
                            disabled={busyId === item.id}
                            onClick={() => setToDelete(item)}
                          >
                            <Trash2 className='size-4' />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il popup?</AlertDialogTitle>
            <AlertDialogDescription>
              «{toDelete?.title}» sparirà per tutti e non si potrà recuperare.
              Per nasconderlo soltanto, disattivalo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void confirmDelete()}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
