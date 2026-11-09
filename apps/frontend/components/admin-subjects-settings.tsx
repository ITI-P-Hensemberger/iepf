'use client'

import * as React from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, jsonBody } from '@/lib/api-fetch'

import { EmptyState } from '@/components/empty-state'
import { BlockSkeleton } from '@/components/loading'
import { SearchField } from '@/components/search-field'
import { SETTINGS_STICKY_TOP, SettingsSection } from '@/components/settings-section'
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
import { extractPayloadArray } from '@/lib/backend-response'
import { capitalizeFirst } from '@/lib/capitalize'
import { cn } from '@/lib/utils'

type Subject = { id: string, name: string }
type Draft = { id: string | null, name: string }

const byName = (a: Subject, b: Subject) => a.name.localeCompare(b.name, 'it')

// The "Materie" section of the global settings, built like Popup and FAQ: "Nuova materia" on
// top opens the form above the list; each row edits or deletes its subject.
const noSubjects: Subject[] = []

export function AdminSubjectsSettings() {
  const queryClient = useQueryClient()
  // The same list the rest of the app uses, sorted here by name.
  const { data: subjects = noSubjects, isPending: loading } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => extractPayloadArray<Subject>(await apiFetch('/api/subjects', 'Impossibile caricare le materie.', { cache: 'no-store' })),
    select: (list) => [...list].sort(byName)
  })
  const [search, setSearch] = React.useState('')
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Subject | null>(null)
  const reload = () => queryClient.invalidateQueries({ queryKey: ['subjects'] })

  const saveSubject = useMutation({
    mutationFn: ({ id, name }: { id: string | null, name: string }) => apiFetch(
      id ? `/api/subjects/${id}` : '/api/subjects',
      'Impossibile salvare la materia.',
      jsonBody(id ? 'PATCH' : 'POST', { name })
    ),
    onSuccess: (_, { id }) => {
      toast.success(id ? 'Materia aggiornata.' : 'Materia aggiunta.')
      setDraft(null)
      return reload()
    }
  })
  const saving = saveSubject.isPending

  function save() {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) {
      toast.error('Scrivi il nome della materia.')
      return
    }
    saveSubject.mutate({ id: draft.id, name })
  }

  const removeSubject = useMutation({
    mutationFn: (subject: Subject) => apiFetch(`/api/subjects/${subject.id}`, 'Impossibile eliminare la materia.', jsonBody('DELETE')),
    onSuccess: (_, subject) => {
      toast.success('Materia eliminata.')
      if (draft?.id === subject.id) setDraft(null)
      return reload()
    },
    onSettled: () => setDeleteTarget(null)
  })
  const remove = (subject: Subject) => removeSubject.mutateAsync(subject).catch(() => {})

  const needle = search.trim().toLowerCase()
  const shown = needle ? subjects.filter(subject => subject.name.toLowerCase().includes(needle)) : subjects

  return (
    <SettingsSection
      title='Materie'
      description='Le materie che i tutor possono insegnare e gli studenti prenotare.'
      actions={!draft && (
        <Button onClick={() => setDraft({ id: null, name: '' })}>
          <Plus className='size-4' /> Nuova materia
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
          <h3 className='font-semibold'>{draft.id ? 'Modifica materia' : 'Nuova materia'}</h3>
          <div className='space-y-2'>
            <Label htmlFor='subject-name'>Nome</Label>
            <Input
              id='subject-name'
              value={draft.name}
              maxLength={120}
              onChange={event => setDraft({ ...draft, name: capitalizeFirst(event.target.value) })}
              placeholder='Es. Matematica'
              autoFocus
            />
          </div>
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <Button type='button' variant='outline' onClick={() => setDraft(null)} disabled={saving}>Annulla</Button>
            <Button type='submit' disabled={saving}>{saving ? 'Salvataggio...' : draft.id ? 'Salva modifiche' : 'Aggiungi materia'}</Button>
          </div>
        </form>
      )}

      {loading ? (
        <BlockSkeleton lines={5} />
      ) : subjects.length === 0 ? (
        <EmptyState>Nessuna materia: aggiungi la prima.</EmptyState>
      ) : (
        <div className='space-y-3'>
          {/* Like the lists' search: it stays under the header while the subjects scroll. */}
          <div className={cn('sticky z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur lg:mx-0 lg:px-0', SETTINGS_STICKY_TOP)}>
            <SearchField id='subject-settings-search' value={search} onChange={setSearch} placeholder='Cerca una materia' />
          </div>
          {shown.length === 0 ? (
            <EmptyState>Nessuna materia trovata.</EmptyState>
          ) : (
            <ul className='divide-y rounded-lg border bg-card'>
              {shown.map(subject => (
                <li key={subject.id} className='flex items-center gap-3 px-4 py-2.5 sm:px-6'>
                  <span className='min-w-0 flex-1 font-medium break-words'>{subject.name}</span>
                  <Button
                    variant='outline'
                    size='icon'
                    aria-label={`Modifica: ${subject.name}`}
                    title='Modifica'
                    onClick={() => setDraft({ id: subject.id, name: subject.name })}
                  >
                    <Pencil className='size-4' />
                  </Button>
                  <Button
                    variant='outline'
                    size='icon'
                    aria-label={`Elimina: ${subject.name}`}
                    title='Elimina'
                    className='text-destructive hover:text-destructive'
                    onClick={() => setDeleteTarget(subject)}
                  >
                    <Trash2 className='size-4' />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la materia?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteTarget?.name}» non sarà più tra le materie che i tutor possono insegnare.
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
