'use client'

import * as React from 'react'
import { Copy, Download, Pencil, Plus, QrCode as QrIcon, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ApiResponse } from '@/lib/api'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
import { SLUG_MAX, slugify } from '@/lib/slug'

import { EmptyState } from '@/components/empty-state'
import { BlockSkeleton } from '@/components/loading'
import { downloadQrPng, QrCode } from '@/components/qr-code'
import { SettingsSection } from '@/components/settings-section'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export type ShortLink = ApiResponse<'/links'>[number]
type Draft = { id: string | null, slug: string, url: string, active: boolean }

const URL_MAX = 2_000
const noLinks: ShortLink[] = []

export const LINKS_QUERY_KEY = ['links']

export function fetchLinks() {
  return apiFetch<ShortLink[]>('/api/links', 'Impossibile caricare i link.', { cache: 'no-store' })
}

// The address to share: this site, /link/<slug>.
export function shortUrl(slug: string) {
  return `${window.location.origin}/link/${slug}`
}

const isHttps = (value: string) => {
  try {
    return new URL(value).protocol === 'https:'
  }
  catch {
    return false
  }
}

// The "Link" section of the global settings: short links /link/<slug> that send visitors to an
// https address. Admins add, edit, switch off and delete them, and share them as a QR code.
export function AdminLinksSettings() {
  const queryClient = useQueryClient()
  const { data: items = noLinks, isPending: loading } = useQuery({ queryKey: LINKS_QUERY_KEY, queryFn: fetchLinks })
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ShortLink | null>(null)
  const [qrTarget, setQrTarget] = React.useState<ShortLink | null>(null)
  const reload = () => queryClient.invalidateQueries({ queryKey: LINKS_QUERY_KEY })

  const saveLink = useMutation({
    mutationFn: (value: Draft) => apiFetch<ShortLink>(
      value.id ? `/api/links/${value.id}` : '/api/links',
      'Impossibile salvare il link.',
      jsonBody(value.id ? 'PUT' : 'POST', { slug: value.slug, url: value.url.trim(), active: value.active })
    ),
    onSuccess: (_, value) => {
      toast.success(value.id ? 'Link aggiornato.' : 'Link aggiunto.')
      setDraft(null)
      return reload()
    }
  })
  const saving = saveLink.isPending

  function save() {
    if (!draft) return
    const slug = slugify(draft.slug)
    if (!slug) {
      toast.error('Scrivi il nome del link.')
      return
    }
    if (!isHttps(draft.url.trim())) {
      toast.error('Il link deve iniziare con https://')
      return
    }
    saveLink.mutate({ ...draft, slug })
  }

  // The switch saves at once and shows the new state before the server answers.
  const toggle = useMutation({
    mutationFn: (link: ShortLink) => apiFetch<ShortLink>(
      `/api/links/${link.id}`,
      'Impossibile cambiare lo stato del link.',
      jsonBody('PUT', { slug: link.slug, url: link.url, active: !link.active })
    ),
    onMutate: (link) => {
      queryClient.setQueryData<ShortLink[]>(LINKS_QUERY_KEY, list => list?.map(item => item.id === link.id ? { ...item, active: !link.active } : item))
    },
    onSuccess: (saved) => toast.success(saved.active ? 'Link attivato.' : 'Link disattivato.'),
    onSettled: () => reload()
  })

  const removeLink = useMutation({
    mutationFn: async (link: ShortLink) => {
      const response = await fetch(`/api/links/${link.id}`, jsonBody('DELETE'))
      // Already gone counts as deleted.
      if (response.ok || response.status === 404) return
      const payload = await response.json().catch(() => null) as { message?: string } | null
      throw new Error(payload?.message ?? 'Impossibile eliminare il link.')
    },
    onSuccess: (_, link) => {
      toast.success('Link eliminato.')
      if (draft?.id === link.id) setDraft(null)
      return reload()
    },
    onSettled: () => setDeleteTarget(null)
  })

  async function copy(link: ShortLink) {
    try {
      await navigator.clipboard.writeText(shortUrl(link.slug))
      toast.success('Link copiato.')
    }
    catch {
      toast.error('Impossibile copiare il link.')
    }
  }

  return (
    <SettingsSection
      title='Link'
      description='Link brevi del sito: chi apre /link/nome viene portato all’indirizzo scelto.'
      actions={!draft && (
        <Button onClick={() => setDraft({ id: null, slug: '', url: '', active: true })}>
          <Plus className='size-4' /> Nuovo link
        </Button>
      )}
    >
      {draft && (
        <form
          className='space-y-4 rounded-lg border bg-card p-4 sm:p-6'
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <h3 className='font-semibold'>{draft.id ? 'Modifica link' : 'Nuovo link'}</h3>
          <div className='space-y-2'>
            <Label htmlFor='link-slug'>Nome</Label>
            <div className='flex items-center rounded-md border bg-background focus-within:ring-[3px] focus-within:ring-ring/50'>
              <span className='shrink-0 pl-3 text-sm text-muted-foreground'>/link/</span>
              <Input
                id='link-slug'
                value={draft.slug}
                maxLength={SLUG_MAX}
                // Formats as the admin types; a trailing dash stays until the next word.
                onChange={event => setDraft({ ...draft, slug: slugify(`${event.target.value}x`).slice(0, -1) })}
                onBlur={() => setDraft({ ...draft, slug: slugify(draft.slug) })}
                placeholder='iscrizioni'
                className='border-0 pl-0.5 shadow-none focus-visible:ring-0'
                autoFocus
              />
            </div>
            <p className='text-xs text-muted-foreground'>Lettere minuscole, numeri e trattini; gli spazi diventano trattini.</p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='link-url'>Porta a</Label>
            <Input
              id='link-url'
              type='url'
              inputMode='url'
              value={draft.url}
              maxLength={URL_MAX}
              onChange={event => setDraft({ ...draft, url: event.target.value })}
              placeholder='https://'
            />
          </div>
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <Button type='button' variant='outline' onClick={() => setDraft(null)} disabled={saving}>Annulla</Button>
            <Button type='submit' disabled={saving}>{saving ? 'Salvataggio...' : draft.id ? 'Salva modifiche' : 'Aggiungi link'}</Button>
          </div>
        </form>
      )}

      {loading ? (
        <BlockSkeleton lines={4} />
      ) : items.length === 0 ? (
        <EmptyState>Nessun link. Aggiungi il primo.</EmptyState>
      ) : (
        <ul className='divide-y rounded-lg border bg-card'>
          {items.map(link => (
            <li key={link.id} className='flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6 sm:py-4'>
              <div className='flex min-w-0 flex-1 items-start gap-3'>
                <Switch
                  className='mt-0.5'
                  checked={link.active}
                  disabled={toggle.isPending}
                  onCheckedChange={() => toggle.mutate(link)}
                  aria-label={`${link.active ? 'Disattiva' : 'Attiva'} /link/${link.slug}`}
                />
                <div className='min-w-0'>
                  <p className={link.active ? 'font-medium break-all' : 'font-medium break-all text-muted-foreground'}>/link/{link.slug}</p>
                  <p className='truncate text-sm text-muted-foreground' title={link.url}>{link.url}</p>
                  <p className='text-xs text-muted-foreground tabular-nums'>
                    {link.clicks === 1 ? '1 click' : `${link.clicks.toLocaleString('it-IT')} click`}
                    {!link.active && ' · disattivato'}
                  </p>
                </div>
              </div>
              <div className='flex shrink-0 gap-1 self-end sm:self-auto'>
                <Button variant='outline' size='icon' aria-label={`Copia /link/${link.slug}`} title='Copia il link' onClick={() => void copy(link)}>
                  <Copy className='size-4' />
                </Button>
                <Button variant='outline' size='icon' aria-label={`Codice QR di /link/${link.slug}`} title='Codice QR' onClick={() => setQrTarget(link)}>
                  <QrIcon className='size-4' />
                </Button>
                <Button
                  variant='outline'
                  size='icon'
                  aria-label={`Modifica /link/${link.slug}`}
                  title='Modifica'
                  onClick={() => setDraft({ id: link.id, slug: link.slug, url: link.url, active: link.active })}
                >
                  <Pencil className='size-4' />
                </Button>
                <Button
                  variant='outline'
                  size='icon'
                  aria-label={`Elimina /link/${link.slug}`}
                  title='Elimina'
                  className='text-destructive hover:text-destructive'
                  onClick={() => setDeleteTarget(link)}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={Boolean(qrTarget)} onOpenChange={open => !open && setQrTarget(null)}>
        <AlertDialogContent className='sm:max-w-sm'>
          <AlertDialogHeader>
            <AlertDialogTitle>Codice QR</AlertDialogTitle>
            <AlertDialogDescription className='break-all'>
              {qrTarget && shortUrl(qrTarget.slug)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {qrTarget && (
            <div className='flex justify-center'>
              <QrCode value={shortUrl(qrTarget.slug)} label={`Codice QR di /link/${qrTarget.slug}`} className='size-56 border sm:size-56' />
            </div>
          )}
          <AlertDialogFooter className='sm:justify-center'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <Button onClick={() => qrTarget && downloadQrPng(shortUrl(qrTarget.slug), `link-${qrTarget.slug}.png`)}>
              <Download className='size-4' /> Scarica PNG
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il link?</AlertDialogTitle>
            <AlertDialogDescription>
              /link/{deleteTarget?.slug} smette di funzionare, anche nei QR già stampati. Per fermarlo solo per un po’, disattivalo. Non si può annullare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-white hover:bg-destructive/90'
              onClick={() => deleteTarget && removeLink.mutate(deleteTarget)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
