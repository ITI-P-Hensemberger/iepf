'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, jsonBody } from '@/lib/api-fetch'

import { EmptyState } from '@/components/empty-state'
import { SettingsSection } from '@/components/settings-section'
import type { FaqItem } from '@/components/faq'
import { BlockSkeleton } from '@/components/loading'
import { MarkdownContent } from '@/components/markdown-content'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { capitalizeFirst } from '@/lib/capitalize'

const QUESTION_MAX = 300
const ANSWER_MAX = 5_000

type Draft = { id: string | null, question: string, answer: string }

// The "FAQ" section of the global settings: the questions of the public FAQ page, in page
// order. Admins add, edit (answers in markdown, like the popups), delete and move them.
const noItems: FaqItem[] = []

export function AdminFaqSettings() {
  const queryClient = useQueryClient()
  const { data: items = noItems, isPending: loading } = useQuery({
    queryKey: ['faqs'],
    queryFn: () => apiFetch<FaqItem[]>('/api/faqs', 'Impossibile caricare le domande frequenti.', { cache: 'no-store' })
  })
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<FaqItem | null>(null)
  const reload = () => queryClient.invalidateQueries({ queryKey: ['faqs'] })

  const saveFaq = useMutation({
    mutationFn: (value: Draft) => apiFetch(
      value.id ? `/api/faqs/${value.id}` : '/api/faqs',
      'Impossibile salvare la domanda.',
      jsonBody(value.id ? 'PUT' : 'POST', { question: value.question.trim(), answer: value.answer.trim() })
    ),
    onSuccess: (_, value) => {
      toast.success(value.id ? 'Domanda aggiornata.' : 'Domanda aggiunta.')
      setDraft(null)
      return reload()
    }
  })
  const saving = saveFaq.isPending

  function save() {
    if (!draft) return
    if (!draft.question.trim() || !draft.answer.trim()) {
      toast.error('Scrivi la domanda e la risposta.')
      return
    }
    saveFaq.mutate(draft)
  }

  const removeFaq = useMutation({
    mutationFn: async (item: FaqItem) => {
      const response = await fetch(`/api/faqs/${item.id}`, jsonBody('DELETE'))
      // Already gone counts as deleted.
      if (response.ok || response.status === 404) return
      const payload = await response.json().catch(() => null) as { message?: string } | null
      throw new Error(payload?.message ?? 'Impossibile eliminare la domanda.')
    },
    onSuccess: (_, item) => {
      toast.success('Domanda eliminata.')
      if (draft?.id === item.id) setDraft(null)
      return reload()
    },
    onSettled: () => setDeleteTarget(null)
  })
  const remove = (item: FaqItem) => removeFaq.mutateAsync(item).catch(() => {})

  // Moves a question one place, at once on screen; a stale list comes back from the server.
  const reorder = useMutation({
    mutationFn: (next: FaqItem[]) => apiFetch<FaqItem[]>('/api/faqs/order', 'Impossibile cambiare l’ordine.', jsonBody('PUT', { ids: next.map(item => item.id) })),
    onMutate: (next) => {
      queryClient.setQueryData(['faqs'], next)
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['faqs'], saved)
    },
    onError: () => reload()
  })
  const moving = reorder.isPending

  function move(index: number, step: -1 | 1) {
    const target = index + step
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    reorder.mutate(next)
  }

  return (
    <SettingsSection
      title='Domande frequenti'
      description='Le domande della pagina pubblica FAQ, nell’ordine in cui le vede chi la apre.'
      actions={<>
          <Button asChild variant='outline'>
            <Link href='/faq' target='_blank'><ExternalLink className='size-4' /> Apri la pagina</Link>
          </Button>
          {!draft && (
            <Button onClick={() => setDraft({ id: null, question: '', answer: '' })}>
              <Plus className='size-4' /> Nuova domanda
            </Button>
          )}
      </>}
    >
      {draft && (
        <form
          className='space-y-4 rounded-lg border bg-card p-4 sm:p-6'
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <h3 className='font-semibold'>{draft.id ? 'Modifica domanda' : 'Nuova domanda'}</h3>
          <div className='space-y-2'>
            <Label htmlFor='faq-question'>Domanda</Label>
            <Input
              id='faq-question'
              value={draft.question}
              maxLength={QUESTION_MAX}
              onChange={event => setDraft({ ...draft, question: capitalizeFirst(event.target.value) })}
              placeholder='Es. Come posso prenotare una lezione?'
              autoFocus
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='faq-answer'>Risposta</Label>
            <MarkdownEditor
              id='faq-answer'
              value={draft.answer}
              maxLength={ANSWER_MAX}
              rows={8}
              onChange={answer => setDraft({ ...draft, answer })}
            />
          </div>
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <Button type='button' variant='outline' onClick={() => setDraft(null)} disabled={saving}>Annulla</Button>
            <Button type='submit' disabled={saving}>{saving ? 'Salvataggio...' : draft.id ? 'Salva modifiche' : 'Aggiungi domanda'}</Button>
          </div>
        </form>
      )}

      {loading ? (
        <BlockSkeleton lines={4} />
      ) : items.length === 0 ? (
        <EmptyState>Nessuna domanda: la pagina FAQ è vuota. Aggiungi la prima.</EmptyState>
      ) : (
        <ol className='divide-y rounded-lg border bg-card'>
          {items.map((item, index) => (
            <li key={item.id} className='flex gap-3 px-4 py-3 sm:px-6 sm:py-4'>
              <span className='mt-0.5 w-6 shrink-0 text-sm text-muted-foreground tabular-nums'>{index + 1}.</span>
              <div className='min-w-0 flex-1'>
                <p className='font-medium'>{item.question}</p>
                <div className='mt-1 line-clamp-2 text-sm text-muted-foreground'>
                  <MarkdownContent source={item.answer} />
                </div>
              </div>
              <div className='flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start'>
                <div className='flex gap-1'>
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label={`Sposta su: ${item.question}`}
                    title='Sposta su'
                    disabled={index === 0 || moving}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className='size-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label={`Sposta giù: ${item.question}`}
                    title='Sposta giù'
                    disabled={index === items.length - 1 || moving}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className='size-4' />
                  </Button>
                </div>
                <div className='flex gap-1'>
                  <Button
                    variant='outline'
                    size='icon'
                    aria-label={`Modifica: ${item.question}`}
                    title='Modifica'
                    onClick={() => setDraft({ id: item.id, question: item.question, answer: item.answer })}
                  >
                    <Pencil className='size-4' />
                  </Button>
                  <Button
                    variant='outline'
                    size='icon'
                    aria-label={`Elimina: ${item.question}`}
                    title='Elimina'
                    className='text-destructive hover:text-destructive'
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 className='size-4' />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la domanda?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteTarget?.question}» sparisce dalla pagina FAQ. Non si può annullare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-white hover:bg-destructive/90'
              onClick={() => deleteTarget && void remove(deleteTarget)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
